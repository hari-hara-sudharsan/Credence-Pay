// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/AccessControl.sol";

interface ISpendingPolicy {
    function recordSpend(address agent, address merchant, uint256 amount, bytes32 mandateHash) external;
}

interface IReputationRegistry {
    function recordRepayment(address wallet, uint256 amount) external;
}

/// @title A2ASettlementRegistry
/// @notice On-chain memory for agent-to-agent payments settled through HSP.
///         Every settled Payment Mandate is anchored here (mandate hash ->
///         HSP flow id -> payment tx). The settlement history becomes an
///         agent trust score, and the score decides the terms a merchant
///         agent offers next time: prepay, net terms, or a credit tab.
contract A2ASettlementRegistry is AccessControl {
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");

    enum Terms { PREPAY, NET, CREDIT }
    enum Status { NONE, OPEN, SETTLED, DEFAULTED }

    struct Mandate {
        address payer;
        address payee;
        address token;
        uint128 amount;
        uint64 createdAt;
        uint64 dueAt;          // 0 for prepay
        uint64 settledAt;
        Terms terms;
        Status status;
        bytes32 hspFlowId;     // keccak256 of the HSP flow_id string
        bytes32 paymentTx;     // settlement transaction hash
    }

    struct AgentStats {
        uint32 settledCount;
        uint32 onTimeCount;
        uint32 lateCount;
        uint32 defaultCount;
        uint128 settledVolume;
        uint128 outstanding;   // open NET/CREDIT exposure
        uint64 firstSeenAt;
        uint64 lastSettledAt;
    }

    uint16 public constant BASE_SCORE = 500;
    uint16 public constant MIN_SCORE = 300;
    uint16 public constant MAX_SCORE = 900;

    ISpendingPolicy public spendingPolicy;
    IReputationRegistry public reputation;   // Credence cross-application reputation (optional)

    /// Credence fee on deferred-terms volume, in basis points, accrued per merchant.
    uint16 public feeBps = 150;
    uint16 public constant MAX_FEE_BPS = 1000;
    mapping(address => uint256) public feesAccrued;
    uint256 public totalFees;
    uint256[3] public volumeByTerms;   // PREPAY, NET, CREDIT
    uint256 public totalDefaulted;

    mapping(bytes32 => Mandate) public mandates;
    mapping(address => AgentStats) public stats;
    uint256 public totalSettled;
    uint256 public totalVolume;

    event TabOpened(bytes32 indexed mandateHash, address indexed payer, address indexed payee, uint256 amount, uint8 terms, uint64 dueAt);
    event MandateSettled(bytes32 indexed mandateHash, address indexed payer, address indexed payee, address token, uint256 amount, uint8 terms, bytes32 hspFlowId, bytes32 paymentTx, bool onTime);
    event MandateDefaulted(bytes32 indexed mandateHash, address indexed payer, uint256 amount);
    event TrustUpdated(address indexed agent, uint256 score);
    event FeeAccrued(bytes32 indexed mandateHash, address indexed merchant, uint256 fee);
    event FeeUpdated(uint16 feeBps);
    event PolicyViolation(bytes32 indexed mandateHash, address indexed payer, uint256 amount);

    error MandateExists();
    error MandateNotOpen();
    error NotOverdue();
    error InvalidTerms();

    constructor(address admin, address policy) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(SETTLER_ROLE, admin);
        spendingPolicy = ISpendingPolicy(policy);
    }

    function setSpendingPolicy(address policy) external onlyRole(DEFAULT_ADMIN_ROLE) {
        spendingPolicy = ISpendingPolicy(policy);
    }

    function setReputationRegistry(address registry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        reputation = IReputationRegistry(registry);
    }

    function setFeeBps(uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > MAX_FEE_BPS) revert InvalidTerms();
        feeBps = bps;
        emit FeeUpdated(bps);
    }

    /// @notice Merchant agent extends deferred terms (NET or CREDIT) to a trusted payer.
    function openTab(
        bytes32 mandateHash,
        address payer,
        address payee,
        address token,
        uint128 amount,
        Terms terms,
        uint64 dueAt
    ) external onlyRole(SETTLER_ROLE) {
        if (terms == Terms.PREPAY || dueAt <= block.timestamp) revert InvalidTerms();
        if (mandates[mandateHash].status != Status.NONE) revert MandateExists();

        mandates[mandateHash] = Mandate({
            payer: payer,
            payee: payee,
            token: token,
            amount: amount,
            createdAt: uint64(block.timestamp),
            dueAt: dueAt,
            settledAt: 0,
            terms: terms,
            status: Status.OPEN,
            hspFlowId: bytes32(0),
            paymentTx: bytes32(0)
        });
        AgentStats storage s = _touch(payer);
        s.outstanding += amount;
        emit TabOpened(mandateHash, payer, payee, amount, uint8(terms), dueAt);
    }

    /// @notice Anchor an HSP-settled payment. For prepay this creates and settles
    ///         the mandate in one step; for an open tab it closes it.
    function recordSettlement(
        bytes32 mandateHash,
        address payer,
        address payee,
        address token,
        uint128 amount,
        bytes32 hspFlowId,
        bytes32 paymentTx
    ) external onlyRole(SETTLER_ROLE) {
        Mandate storage m = mandates[mandateHash];
        AgentStats storage s = _touch(payer);
        bool onTime = true;

        if (m.status == Status.NONE) {
            m.payer = payer;
            m.payee = payee;
            m.token = token;
            m.amount = amount;
            m.createdAt = uint64(block.timestamp);
            m.terms = Terms.PREPAY;
        } else if (m.status == Status.OPEN) {
            onTime = block.timestamp <= m.dueAt;
            s.outstanding -= m.amount;
        } else {
            revert MandateNotOpen();
        }

        m.status = Status.SETTLED;
        m.settledAt = uint64(block.timestamp);
        m.hspFlowId = hspFlowId;
        m.paymentTx = paymentTx;

        s.settledCount += 1;
        s.settledVolume += m.amount;
        s.lastSettledAt = uint64(block.timestamp);
        if (onTime) s.onTimeCount += 1;
        else s.lateCount += 1;

        totalSettled += 1;
        totalVolume += m.amount;
        volumeByTerms[uint8(m.terms)] += m.amount;

        // Credence earns on the terms it underwrites: deferred (NET / CREDIT) volume only.
        if (m.terms != Terms.PREPAY && feeBps > 0) {
            uint256 fee = (uint256(m.amount) * feeBps) / 10_000;
            feesAccrued[m.payee] += fee;
            totalFees += fee;
            emit FeeAccrued(mandateHash, m.payee, fee);
        }

        // Feed the shared Credence reputation layer so other apps benefit from agent payment history.
        if (onTime && address(reputation) != address(0)) {
            try reputation.recordRepayment(m.payer, m.amount) {} catch {}
        }

        // The payment already happened on HSP, so a policy breach is flagged, never hidden by a revert.
        if (address(spendingPolicy) != address(0)) {
            try spendingPolicy.recordSpend(m.payer, m.payee, m.amount, mandateHash) {} catch {
                emit PolicyViolation(mandateHash, m.payer, m.amount);
            }
        }

        emit MandateSettled(mandateHash, m.payer, m.payee, m.token, m.amount, uint8(m.terms), hspFlowId, paymentTx, onTime);
        emit TrustUpdated(m.payer, trustScore(m.payer));
    }

    /// @notice Mark an overdue tab as defaulted. Anyone can call it once the tab is overdue.
    function markDefault(bytes32 mandateHash) external {
        Mandate storage m = mandates[mandateHash];
        if (m.status != Status.OPEN) revert MandateNotOpen();
        if (block.timestamp <= m.dueAt) revert NotOverdue();

        m.status = Status.DEFAULTED;
        AgentStats storage s = stats[m.payer];
        s.outstanding -= m.amount;
        s.defaultCount += 1;
        totalDefaulted += m.amount;

        emit MandateDefaulted(mandateHash, m.payer, m.amount);
        emit TrustUpdated(m.payer, trustScore(m.payer));
    }

    /// @notice Transparent, deterministic agent trust score in [300, 900].
    ///         +15 per on-time settlement (max +300), +up to 100 for volume,
    ///         -40 per late settlement, -150 per default.
    function trustScore(address agent) public view returns (uint256) {
        AgentStats memory s = stats[agent];
        int256 score = int256(uint256(BASE_SCORE));

        uint256 onTime = s.onTimeCount > 20 ? 20 : s.onTimeCount;
        score += int256(onTime * 15);

        // 1 point per 10 USD settled (6-decimal stablecoins), capped at 100
        uint256 volumePts = uint256(s.settledVolume) / 10e6;
        score += int256(volumePts > 100 ? 100 : volumePts);

        score -= int256(uint256(s.lateCount) * 40);
        score -= int256(uint256(s.defaultCount) * 150);

        if (score < int256(uint256(MIN_SCORE))) return MIN_SCORE;
        if (score > int256(uint256(MAX_SCORE))) return MAX_SCORE;
        return uint256(score);
    }

    /// @notice Terms a merchant agent should offer this payer, derived from trust.
    /// @return terms PREPAY / NET / CREDIT
    /// @return creditLimit max open exposure in token base units
    /// @return netDays days until a deferred payment is due
    function termsFor(address agent) external view returns (Terms terms, uint256 creditLimit, uint256 netDays) {
        AgentStats memory s = stats[agent];
        uint256 score = trustScore(agent);
        if (s.defaultCount > 0 || score < 560) return (Terms.PREPAY, 0, 0);
        if (score < 700) {
            uint256 limit = 25e6;
            return (Terms.NET, limit > s.outstanding ? limit - s.outstanding : 0, 7);
        }
        uint256 creditLimit_ = 25e6 + (score - 700) * 1e6; // 25 USD up to 225 USD
        return (Terms.CREDIT, creditLimit_ > s.outstanding ? creditLimit_ - s.outstanding : 0, 30);
    }

    function getMandate(bytes32 mandateHash) external view returns (Mandate memory) {
        return mandates[mandateHash];
    }

    function getVolumeByTerms() external view returns (uint256[3] memory) {
        return volumeByTerms;
    }

    function getStats(address agent) external view returns (AgentStats memory) {
        return stats[agent];
    }

    function _touch(address agent) internal returns (AgentStats storage s) {
        s = stats[agent];
        if (s.firstSeenAt == 0) s.firstSeenAt = uint64(block.timestamp);
    }
}
