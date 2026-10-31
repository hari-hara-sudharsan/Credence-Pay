// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IFinancialIdentityRegistry {
    function updateIdentity(
        address wallet,
        uint256 trustScore,
        uint256 creditScore,
        uint256 reliabilityScore
    ) external;

    function updateSettlementStats(
        address wallet,
        bool success,
        uint256 newTrustScore
    ) external;
}

interface ITrustReceiptRegistry {
    function issueReceipt(
        address entity,
        string calldata actionType,
        int256 trustImpact,
        bytes32 proofHash
    ) external returns (uint256);
}

/**
 * @title ReputationRegistry
 * @notice Permanent on-chain credit history engine for Credence AI.
 *         Records repayments and defaults, maintains credit scores,
 *         and tracks repayment streaks for progressive trust building.
 */
contract ReputationRegistry is AccessControl, Pausable, ReentrancyGuard {

    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    struct Reputation {
        uint256 totalRepayments;
        uint256 totalDefaults;
        uint256 totalAmountRepaid;
        uint256 totalAmountDefaulted;
        uint256 currentScore;
        uint256 streakCount;
        uint256 lastUpdated;
    }

    mapping(address => Reputation) public reputations;
    address[] public trackedWallets;
    mapping(address => bool) private _isTracked;

    uint256 public constant BASE_SCORE = 300;
    uint256 public constant MAX_SCORE = 1000;
    uint256 public constant REPAYMENT_BOOST = 15;
    uint256 public constant DEFAULT_PENALTY = 50;
    uint256 public constant STREAK_BONUS = 5;

    address public financialIdentityRegistry;
    address public trustReceiptRegistry;

    event RepaymentRecorded(address indexed wallet, uint256 amount, uint256 newScore, uint256 streak);
    event DefaultRecorded(address indexed wallet, uint256 amount, uint256 newScore);
    event ReputationUpdated(address indexed wallet, uint256 score, uint256 timestamp);
    event TrustReceiptCallFailed(address indexed entity, string actionType);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_ROLE, msg.sender);
    }

    function setFinancialIdentityRegistry(address _registry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        financialIdentityRegistry = _registry;
    }

    function setTrustReceiptRegistry(address _registry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        trustReceiptRegistry = _registry;
    }

    /**
     * @notice Record a successful loan repayment. Increases score and streak.
     * @param wallet The borrower address.
     * @param amount The repaid amount (for weighting).
     */
    function recordRepayment(address wallet, uint256 amount)
        external
        onlyRole(ORACLE_ROLE)
        whenNotPaused
        nonReentrant
    {
        require(wallet != address(0), "Invalid wallet");
        require(amount > 0, "Amount must be positive");

        Reputation storage rep = reputations[wallet];
        _ensureTracked(wallet);

        // Initialize score if first interaction
        if (rep.currentScore == 0 && rep.totalRepayments == 0 && rep.totalDefaults == 0) {
            rep.currentScore = BASE_SCORE;
        }

        rep.totalRepayments += 1;
        rep.totalAmountRepaid += amount;
        rep.streakCount += 1;

        // Score boost: base + streak bonus
        uint256 boost = REPAYMENT_BOOST + (rep.streakCount * STREAK_BONUS);
        if (rep.currentScore + boost > MAX_SCORE) {
            rep.currentScore = MAX_SCORE;
        } else {
            rep.currentScore += boost;
        }

        rep.lastUpdated = block.timestamp;

        emit RepaymentRecorded(wallet, amount, rep.currentScore, rep.streakCount);
        emit ReputationUpdated(wallet, rep.currentScore, block.timestamp);

        // Propagate to FinancialIdentityRegistry
        if (financialIdentityRegistry != address(0)) {
            uint256 creditScore = rep.currentScore;
            uint256 trustScore = creditScore; // aligns in reputation registry context
            uint256 reliabilityScore = 300;
            if (rep.totalRepayments + rep.totalDefaults > 0) {
                reliabilityScore = (rep.totalRepayments * 1000) / (rep.totalRepayments + rep.totalDefaults);
            }
            IFinancialIdentityRegistry(financialIdentityRegistry).updateIdentity(
                wallet,
                trustScore,
                creditScore,
                reliabilityScore
            );
        }
    }

    /**
     * @notice Record a loan default. Decreases score and resets streak.
     * @param wallet The borrower address.
     * @param amount The defaulted amount.
     */
    function recordDefault(address wallet, uint256 amount)
        external
        onlyRole(ORACLE_ROLE)
        whenNotPaused
        nonReentrant
    {
        require(wallet != address(0), "Invalid wallet");
        require(amount > 0, "Amount must be positive");

        Reputation storage rep = reputations[wallet];
        _ensureTracked(wallet);

        if (rep.currentScore == 0 && rep.totalRepayments == 0 && rep.totalDefaults == 0) {
            rep.currentScore = BASE_SCORE;
        }

        rep.totalDefaults += 1;
        rep.totalAmountDefaulted += amount;
        rep.streakCount = 0; // Reset streak

        // Score penalty
        if (rep.currentScore > DEFAULT_PENALTY) {
            rep.currentScore -= DEFAULT_PENALTY;
        } else {
            rep.currentScore = 0;
        }

        rep.lastUpdated = block.timestamp;

        emit DefaultRecorded(wallet, amount, rep.currentScore);
        emit ReputationUpdated(wallet, rep.currentScore, block.timestamp);

        if (trustReceiptRegistry != address(0)) {
            bytes32 proofHash = keccak256(abi.encodePacked(wallet, amount, block.timestamp));
            try ITrustReceiptRegistry(trustReceiptRegistry).issueReceipt(
                wallet,
                "LOAN_DEFAULTED",
                -50,
                proofHash
            ) returns (uint256) {
                // Success
            } catch {
                emit TrustReceiptCallFailed(wallet, "LOAN_DEFAULTED");
            }
        }

        // Propagate to FinancialIdentityRegistry
        if (financialIdentityRegistry != address(0)) {
            uint256 creditScore = rep.currentScore;
            uint256 trustScore = creditScore;
            uint256 reliabilityScore = 300;
            if (rep.totalRepayments + rep.totalDefaults > 0) {
                reliabilityScore = (rep.totalRepayments * 1000) / (rep.totalRepayments + rep.totalDefaults);
            }
            try IFinancialIdentityRegistry(financialIdentityRegistry).updateIdentity(
                wallet,
                trustScore,
                creditScore,
                reliabilityScore
            ) {} catch {}
        }
    }

    /**
     * @notice Update trust score manually or via settlement action.
     */
    function updateTrust(address wallet, int256 trustImpact)
        external
        onlyRole(ORACLE_ROLE)
        whenNotPaused
        nonReentrant
    {
        require(wallet != address(0), "Invalid wallet");
        Reputation storage rep = reputations[wallet];
        _ensureTracked(wallet);

        if (rep.currentScore == 0 && rep.totalRepayments == 0 && rep.totalDefaults == 0) {
            rep.currentScore = BASE_SCORE;
        }

        if (trustImpact >= 0) {
            uint256 boost = uint256(trustImpact);
            if (rep.currentScore + boost > MAX_SCORE) {
                rep.currentScore = MAX_SCORE;
            } else {
                rep.currentScore += boost;
            }
        } else {
            uint256 penalty = uint256(-trustImpact);
            if (rep.currentScore > penalty) {
                rep.currentScore -= penalty;
            } else {
                rep.currentScore = 0;
            }
        }

        rep.lastUpdated = block.timestamp;
        emit ReputationUpdated(wallet, rep.currentScore, block.timestamp);

        // Propagate to FinancialIdentityRegistry
        if (financialIdentityRegistry != address(0)) {
            uint256 creditScore = rep.currentScore;
            uint256 trustScore = creditScore;
            
            try IFinancialIdentityRegistry(financialIdentityRegistry).updateSettlementStats(
                wallet,
                trustImpact >= 0,
                trustScore
            ) {} catch {
                uint256 reliabilityScore = 300;
                if (rep.totalRepayments + rep.totalDefaults > 0) {
                    reliabilityScore = (rep.totalRepayments * 1000) / (rep.totalRepayments + rep.totalDefaults);
                }
                try IFinancialIdentityRegistry(financialIdentityRegistry).updateIdentity(
                    wallet,
                    trustScore,
                    creditScore,
                    reliabilityScore
                ) {} catch {}
            }
        }
    }

    /**
     * @notice Get full reputation data for a wallet.
     */
    function getReputation(address wallet) external view returns (Reputation memory) {
        return reputations[wallet];
    }

    /**
     * @notice Calculate weighted score based on multiple flywheel factors
     */
    function calculateWeightedScore(address wallet) public view returns (uint256) {
        Reputation storage rep = reputations[wallet];
        if (rep.totalRepayments == 0 && rep.totalDefaults == 0 && rep.currentScore == 0) {
            return BASE_SCORE;
        }

        // HSP Reliability (30%)
        uint256 hspReliability = 700;
        if (rep.totalRepayments + rep.totalDefaults > 0) {
            hspReliability = (rep.totalRepayments * 1000) / (rep.totalRepayments + rep.totalDefaults);
        }

        // Repayment History (35%)
        uint256 repaymentHistory = 500;
        if (rep.currentScore > 0) {
            repaymentHistory = rep.currentScore;
        }

        // Trust Receipts (20%)
        uint256 trustReceiptsScore = 600;
        if (rep.totalRepayments > 0) {
            trustReceiptsScore = 600 + (rep.totalRepayments * 50);
            if (trustReceiptsScore > 1000) trustReceiptsScore = 1000;
        }

        // Risk Behavior (15%)
        uint256 riskBehavior = 1000;
        if (rep.totalDefaults > 0) {
            riskBehavior = rep.totalDefaults >= 3 ? 300 : 1000 - (rep.totalDefaults * 200);
        }

        uint256 weighted = (hspReliability * 30) / 100 + 
                           (repaymentHistory * 35) / 100 + 
                           (trustReceiptsScore * 20) / 100 + 
                           (riskBehavior * 15) / 100;

        if (weighted < 300) return 300;
        if (weighted > 1000) return 1000;
        return weighted;
    }

    /**
     * @notice Get the upgraded weighted score for a wallet.
     */
    function getWeightedScore(address wallet) external view returns (uint256) {
        return calculateWeightedScore(wallet);
    }

    /**
     * @notice Get the current score for a wallet.
     */
    function getScore(address wallet) external view returns (uint256) {
        Reputation storage rep = reputations[wallet];
        if (rep.currentScore == 0 && rep.totalRepayments == 0 && rep.totalDefaults == 0) {
            return BASE_SCORE;
        }
        return rep.currentScore;
    }

    /**
     * @notice Get total tracked wallets.
     */
    function getTrackedWalletCount() external view returns (uint256) {
        return trackedWallets.length;
    }

    // ── Admin ────────────────────────────────────────────────────────

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ── Internal ─────────────────────────────────────────────────────

    function _ensureTracked(address wallet) internal {
        if (!_isTracked[wallet]) {
            trackedWallets.push(wallet);
            _isTracked[wallet] = true;
        }
    }
}
