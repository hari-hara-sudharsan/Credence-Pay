// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LendingPool
 * @notice Capital management pool for Credence AI lending infrastructure.
 *         Tracks lender shares with proportional interest accrual.
 *         AccessControl with POOL_ROLE for loan allocation.
 */
contract LendingPool is AccessControl, Pausable, ReentrancyGuard {

    bytes32 public constant POOL_ROLE = keccak256("POOL_ROLE");

    struct PoolStats {
        uint256 totalDeposits;
        uint256 totalBorrowed;
        uint256 availableLiquidity;
        uint256 totalInterestEarned;
        uint256 totalShares;
    }

    struct LenderPosition {
        uint256 shares;
        uint256 depositedAmount;
        uint256 depositTimestamp;
    }

    mapping(address => LenderPosition) public lenderPositions;
    address[] public lenders;
    mapping(address => bool) private _isLender;
    PoolStats public stats;

    event LiquidityDeposited(address indexed lender, uint256 amount, uint256 shares);
    event LiquidityWithdrawn(address indexed lender, uint256 amount, uint256 shares);
    event LoanAllocated(address indexed borrower, uint256 amount);
    event RepaymentReceived(uint256 amount, uint256 interest);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(POOL_ROLE, msg.sender);
    }

    // ── Lender Operations ────────────────────────────────────────────

    /**
     * @notice Deposit ETH into the pool. Mints proportional shares.
     */
    function deposit() external payable whenNotPaused nonReentrant {
        require(msg.value > 0, "Amount must be positive");

        uint256 shares;
        if (stats.totalShares == 0 || stats.totalDeposits == 0) {
            // First deposit: 1:1 share ratio
            shares = msg.value;
        } else {
            // Proportional: shares = deposit * totalShares / totalPoolValue
            uint256 poolValue = stats.totalDeposits + stats.totalInterestEarned - stats.totalBorrowed;
            if (poolValue == 0) {
                shares = msg.value;
            } else {
                shares = (msg.value * stats.totalShares) / poolValue;
            }
        }

        require(shares > 0, "Shares must be positive");

        LenderPosition storage pos = lenderPositions[msg.sender];
        pos.shares += shares;
        pos.depositedAmount += msg.value;
        if (pos.depositTimestamp == 0) {
            pos.depositTimestamp = block.timestamp;
        }

        if (!_isLender[msg.sender]) {
            lenders.push(msg.sender);
            _isLender[msg.sender] = true;
        }

        stats.totalDeposits += msg.value;
        stats.availableLiquidity += msg.value;
        stats.totalShares += shares;

        emit LiquidityDeposited(msg.sender, msg.value, shares);
    }

    /**
     * @notice Withdraw by burning shares. Returns proportional pool value.
     * @param sharesToBurn Number of shares to redeem.
     */
    function withdraw(uint256 sharesToBurn) external whenNotPaused nonReentrant {
        require(sharesToBurn > 0, "Shares must be positive");
        LenderPosition storage pos = lenderPositions[msg.sender];
        require(pos.shares >= sharesToBurn, "Insufficient shares");

        // Calculate withdrawal value
        uint256 value = getShareValue(sharesToBurn);
        require(stats.availableLiquidity >= value, "Insufficient pool liquidity");

        pos.shares -= sharesToBurn;
        stats.totalShares -= sharesToBurn;
        stats.availableLiquidity -= value;
        if (stats.totalDeposits >= value) {
            stats.totalDeposits -= value;
        } else {
            stats.totalDeposits = 0;
        }

        (bool success, ) = msg.sender.call{value: value}("");
        require(success, "Withdraw transfer failed");

        emit LiquidityWithdrawn(msg.sender, value, sharesToBurn);
    }

    // ── Pool Operations (POOL_ROLE) ──────────────────────────────────

    /**
     * @notice Allocate a loan from pool liquidity.
     */
    function allocateLoan(address borrower, uint256 amount)
        external
        onlyRole(POOL_ROLE)
        whenNotPaused
        nonReentrant
    {
        require(borrower != address(0), "Invalid borrower");
        require(amount > 0, "Amount must be positive");
        require(stats.availableLiquidity >= amount, "Insufficient liquidity");

        stats.availableLiquidity -= amount;
        stats.totalBorrowed += amount;

        (bool success, ) = borrower.call{value: amount}("");
        require(success, "Loan allocation failed");

        emit LoanAllocated(borrower, amount);
    }

    /**
     * @notice Record a loan repayment with interest. Interest accrues to pool.
     */
    function recordRepayment(uint256 amount, uint256 interest)
        external
        payable
        onlyRole(POOL_ROLE)
        whenNotPaused
        nonReentrant
    {
        require(msg.value >= amount + interest, "Insufficient value sent");

        stats.availableLiquidity += amount + interest;
        if (stats.totalBorrowed >= amount) {
            stats.totalBorrowed -= amount;
        } else {
            stats.totalBorrowed = 0;
        }
        stats.totalInterestEarned += interest;

        emit RepaymentReceived(amount, interest);
    }

    // ── View Functions ───────────────────────────────────────────────

    /**
     * @notice Get the ETH value of a given number of shares.
     */
    function getShareValue(uint256 shares) public view returns (uint256) {
        if (stats.totalShares == 0) return 0;
        uint256 poolValue = address(this).balance;
        return (shares * poolValue) / stats.totalShares;
    }

    /**
     * @notice Get a lender's position details.
     */
    function getLenderPosition(address lender) external view returns (
        uint256 shares,
        uint256 currentValue,
        uint256 depositedAmount,
        uint256 earnedInterest
    ) {
        LenderPosition storage pos = lenderPositions[lender];
        uint256 value = getShareValue(pos.shares);
        uint256 earned = value > pos.depositedAmount ? value - pos.depositedAmount : 0;
        return (pos.shares, value, pos.depositedAmount, earned);
    }

    function getPoolStats() external view returns (PoolStats memory) {
        return stats;
    }

    function getLenderCount() external view returns (uint256) {
        return lenders.length;
    }

    // ── Admin ────────────────────────────────────────────────────────

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    receive() external payable {}
}
