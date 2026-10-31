// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IReputationRegistry {
    function recordRepayment(address wallet, uint256 amount) external;
    function getScore(address wallet) external view returns (uint256);
    function updateTrust(address wallet, int256 trustImpact) external;
}

interface ICreditPassportV2 {
    function walletPassports(address wallet) external view returns (bytes32);
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
 * @title SettlementManager
 * @notice Separates loan approval from payment execution.
 *         Supports both native ETH and ERC20 (HSP/USDC) settlement.
 *         Provides verifiable proof of every financial transaction.
 */
contract SettlementManager is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant SETTLEMENT_ROLE = keccak256("SETTLEMENT_ROLE");
    bytes32 public constant SETTLEMENT_EXECUTOR_ROLE = keccak256("SETTLEMENT_EXECUTOR_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    enum SettlementType { NATIVE, ERC20 }
    enum SettlementState { CREATED, EXECUTED, VERIFIED, FAILED }

    struct Settlement {
        uint256 settlementId;
        uint256 loanId;
        address borrower;
        address lender;
        uint256 amount;
        SettlementType settlementType;
        SettlementState state;
        bytes32 settlementRef;
        uint256 createdAt;
        uint256 executedAt;
    }

    struct HSPSettlement {
        uint256 settlementId;
        uint256 loanId;
        address borrower;
        address lender;
        uint256 amount;
        bytes32 hspProofHash;
        bool verified;
        uint256 timestamp;
    }

    // Storage
    mapping(uint256 => Settlement) public settlements;
    mapping(uint256 => HSPSettlement) public hspSettlements;
    mapping(address => uint256[]) private _userHSPSettlements;
    uint256 public settlementCount;

    // Lending asset for ERC20 mode
    IERC20 public lendingAsset;
    bool public erc20Enabled;

    IReputationRegistry public reputationRegistry;
    ICreditPassportV2 public creditPassportV2;

    // Events
    event SettlementCreated(
        uint256 indexed settlementId,
        uint256 indexed loanId,
        address borrower,
        address lender,
        uint256 amount
    );

    event SettlementExecuted(
        uint256 indexed settlementId,
        uint256 indexed loanId,
        address borrower,
        uint256 amount,
        bytes32 settlementRef
    );

    event HSPSettlementCompleted(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 amount,
        bytes32 settlementRef
    );

    event TrustSettlementCompleted(
        address indexed wallet,
        uint256 amount,
        uint256 newTrustScore
    );

    event TrustReceiptCallFailed(address indexed entity, string actionType);

    event SettlementVerified(uint256 indexed settlementId, bytes32 settlementRef);
    event SettlementFailed(uint256 indexed settlementId, string reason);
    event LendingAssetUpdated(address indexed token);

    // Part 2 Events
    event HSPSettlementCreated(
        uint256 id,
        address borrower,
        uint256 amount
    );

    event HSPSettlementVerified(
        uint256 id,
        bytes32 proofHash
    );

    event TrustGeneratedFromSettlement(
        address user,
        uint256 trustIncrease
    );

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(SETTLEMENT_ROLE, msg.sender);
        _grantRole(SETTLEMENT_EXECUTOR_ROLE, msg.sender);
        _grantRole(ORACLE_ROLE, msg.sender);
    }

    // ── Configuration ────────────────────────────────────────────────

    /**
     * @notice Set the ERC20 lending asset (e.g., HSP or USDC).
     */
    function setLendingAsset(address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(token != address(0), "Invalid token address");
        lendingAsset = IERC20(token);
        erc20Enabled = true;
        emit LendingAssetUpdated(token);
    }

    // ── Settlement Lifecycle ─────────────────────────────────────────

    /**
     * @notice Create a new settlement record for a loan.
     * @param loanId The loan identifier.
     * @param borrower The borrower receiving funds.
     * @param lender The lender providing funds.
     * @param amount The settlement amount.
     * @return settlementId The ID of the created settlement.
     */
    function createSettlement(
        uint256 loanId,
        address borrower,
        address lender,
        uint256 amount
    )
        external
        onlyRole(SETTLEMENT_ROLE)
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        require(borrower != address(0), "Invalid borrower");
        require(lender != address(0), "Invalid lender");
        require(amount > 0, "Amount must be positive");
        require(borrower != lender, "Borrower cannot be lender");

        settlementCount += 1;
        uint256 sid = settlementCount;

        settlements[sid] = Settlement({
            settlementId: sid,
            loanId: loanId,
            borrower: borrower,
            lender: lender,
            amount: amount,
            settlementType: erc20Enabled ? SettlementType.ERC20 : SettlementType.NATIVE,
            state: SettlementState.CREATED,
            settlementRef: bytes32(0),
            createdAt: block.timestamp,
            executedAt: 0
        });

        emit SettlementCreated(sid, loanId, borrower, lender, amount);
        return sid;
    }

    /**
     * @notice Execute a settlement — transfer funds to borrower.
     *         For native ETH: must send msg.value >= amount.
     *         For ERC20: caller must have approved this contract.
     * @param settlementId The settlement to execute.
     */
    function executeSettlement(uint256 settlementId)
        external
        payable
        onlyRole(SETTLEMENT_ROLE)
        whenNotPaused
        nonReentrant
    {
        Settlement storage s = settlements[settlementId];
        require(s.settlementId != 0, "Settlement not found");
        require(s.state == SettlementState.CREATED, "Settlement not in CREATED state");

        bytes32 ref = keccak256(abi.encodePacked(
            settlementId, s.loanId, s.borrower, s.amount, block.timestamp
        ));

        if (s.settlementType == SettlementType.ERC20) {
            // ERC20 settlement (HSP/USDC)
            lendingAsset.safeTransferFrom(msg.sender, s.borrower, s.amount);
        } else {
            // Native ETH settlement
            require(msg.value >= s.amount, "Insufficient ETH sent");
            (bool success, ) = s.borrower.call{value: s.amount}("");
            require(success, "ETH transfer failed");

            // Refund excess
            if (msg.value > s.amount) {
                (bool refundOk, ) = msg.sender.call{value: msg.value - s.amount}("");
                require(refundOk, "Refund failed");
            }
        }

        s.state = SettlementState.EXECUTED;
        s.settlementRef = ref;
        s.executedAt = block.timestamp;

        // Record HSPSettlement
        hspSettlements[settlementId] = HSPSettlement({
            settlementId: settlementId,
            loanId: s.loanId,
            borrower: s.borrower,
            lender: s.lender,
            amount: s.amount,
            hspProofHash: ref,
            verified: true,
            timestamp: block.timestamp
        });
        _userHSPSettlements[s.borrower].push(settlementId);

        // Trigger Reputation update
        if (address(reputationRegistry) != address(0)) {
            reputationRegistry.recordRepayment(s.borrower, s.amount);
            uint256 newTrustScore = reputationRegistry.getScore(s.borrower);
            emit TrustSettlementCompleted(s.borrower, s.amount, newTrustScore);
        }

        if (trustReceiptRegistry != address(0)) {
            try ITrustReceiptRegistry(trustReceiptRegistry).issueReceipt(
                s.borrower,
                "HSP_SETTLEMENT",
                25,
                ref
            ) returns (uint256) {
                // Success
            } catch {
                emit TrustReceiptCallFailed(s.borrower, "HSP_SETTLEMENT");
            }
        }

        emit SettlementExecuted(settlementId, s.loanId, s.borrower, s.amount, ref);
        emit HSPSettlementCompleted(s.loanId, s.borrower, s.amount, ref);
    }

    /**
     * @notice Verify a completed settlement.
     * @param settlementId The settlement to verify.
     */
    function verifySettlement(uint256 settlementId)
        external
        view
        returns (bool completed, bytes32 settlementRef, uint256 executedAt)
    {
        Settlement storage s = settlements[settlementId];
        require(s.settlementId != 0, "Settlement not found");
        return (
            s.state == SettlementState.EXECUTED || s.state == SettlementState.VERIFIED,
            s.settlementRef,
            s.executedAt
        );
    }

    /**
     * @notice Get full settlement details.
     */
    function getSettlement(uint256 settlementId) external view returns (Settlement memory) {
        require(settlements[settlementId].settlementId != 0, "Settlement not found");
        return settlements[settlementId];
    }

    // ── Admin ────────────────────────────────────────────────────────

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function setReputationRegistry(address _reputationRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        reputationRegistry = IReputationRegistry(_reputationRegistry);
    }

    function setCreditPassportV2(address _creditPassportV2) external onlyRole(DEFAULT_ADMIN_ROLE) {
        creditPassportV2 = ICreditPassportV2(_creditPassportV2);
    }

    address public trustReceiptRegistry;

    function setTrustReceiptRegistry(address _registry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        trustReceiptRegistry = _registry;
    }

    // ── Part 2 - New HSPSettlement Functions ─────────────────────────

    /**
     * @notice Register a new HSP settlement request.
     */
    function createHSPSettlement(
        uint256 loanId,
        address borrower,
        address lender,
        uint256 amount
    ) external onlyRole(SETTLEMENT_ROLE) returns (uint256) {
        require(borrower != address(0), "Invalid borrower");
        require(lender != address(0), "Invalid lender");
        require(amount > 0, "Amount must be positive");

        settlementCount += 1;
        uint256 sid = settlementCount;

        hspSettlements[sid] = HSPSettlement({
            settlementId: sid,
            loanId: loanId,
            borrower: borrower,
            lender: lender,
            amount: amount,
            hspProofHash: bytes32(0),
            verified: false,
            timestamp: block.timestamp
        });

        _userHSPSettlements[borrower].push(sid);

        emit HSPSettlementCreated(sid, borrower, amount);
        return sid;
    }

    /**
     * @notice Execute / Verify the HSP Settlement, generating trust receipts and boosting reputation.
     */
    function executeHSPSettlement(
        uint256 settlementId,
        bytes32 proofHash
    ) external onlyRole(SETTLEMENT_EXECUTOR_ROLE) whenNotPaused nonReentrant {
        HSPSettlement storage hs = hspSettlements[settlementId];
        require(hs.settlementId != 0, "Settlement not found");
        require(!hs.verified, "Settlement already verified");
        require(proofHash != bytes32(0), "Invalid proof hash");

        hs.verified = true;
        hs.hspProofHash = proofHash;
        hs.timestamp = block.timestamp;

        // Auto-create Trust Receipt
        if (trustReceiptRegistry != address(0)) {
            try ITrustReceiptRegistry(trustReceiptRegistry).issueReceipt(
                hs.borrower,
                "HSP_SETTLEMENT",
                25,
                proofHash
            ) returns (uint256) {
                // Success
            } catch {
                emit TrustReceiptCallFailed(hs.borrower, "HSP_SETTLEMENT");
            }
        }

        // Call ReputationRegistry to update score
        if (address(reputationRegistry) != address(0)) {
            try reputationRegistry.updateTrust(hs.borrower, 25) {
                emit TrustGeneratedFromSettlement(hs.borrower, 25);
            } catch {
                // Fallback to recordRepayment if updateTrust is not available
                try reputationRegistry.recordRepayment(hs.borrower, hs.amount) {} catch {}
            }
        }

        emit HSPSettlementVerified(settlementId, proofHash);
    }

    /**
     * @notice Verify a completed HSP settlement.
     */
    function verifyHSPProof(
        uint256 settlementId
    ) external view returns (bool verified, bytes32 hspProofHash, uint256 timestamp) {
        HSPSettlement storage hs = hspSettlements[settlementId];
        require(hs.settlementId != 0, "Settlement not found");
        return (hs.verified, hs.hspProofHash, hs.timestamp);
    }

    /**
     * @notice Get all HSP settlements for a borrower.
     */
    function getSettlementHistory(
        address borrower
    ) external view returns (HSPSettlement[] memory) {
        uint256[] storage ids = _userHSPSettlements[borrower];
        HSPSettlement[] memory history = new HSPSettlement[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            history[i] = hspSettlements[ids[i]];
        }
        return history;
    }
}
