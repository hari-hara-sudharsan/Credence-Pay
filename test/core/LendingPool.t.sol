// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {LendingPool} from "../../contracts/core/LendingPool.sol";

contract LendingPoolTest is Test {
    LendingPool pool;
    address admin = address(this);
    address poolRole = address(0xAA);
    address lender1 = address(0xBB);
    address lender2 = address(0xCC);
    address borrower = address(0xDD);

    function setUp() public {
        pool = new LendingPool();
        pool.grantRole(pool.POOL_ROLE(), poolRole);
        vm.deal(lender1, 100 ether);
        vm.deal(lender2, 100 ether);
        vm.deal(poolRole, 10 ether);
    }

    // ── Deposit ─────────────────────────────────────────────────────

    function test_Deposit_MintsShares() public {
        vm.prank(lender1);
        pool.deposit{value: 10 ether}();

        (uint256 shares, uint256 currentValue, uint256 deposited, ) = pool.getLenderPosition(lender1);
        assertEq(shares, 10 ether); // First deposit 1:1
        assertEq(deposited, 10 ether);
        assertEq(currentValue, 10 ether);
    }

    function test_Deposit_UpdatesPoolStats() public {
        vm.prank(lender1);
        pool.deposit{value: 10 ether}();

        LendingPool.PoolStats memory stats = pool.getPoolStats();
        assertEq(stats.totalDeposits, 10 ether);
        assertEq(stats.availableLiquidity, 10 ether);
        assertEq(stats.totalShares, 10 ether);
    }

    function test_Deposit_MultipleProportional() public {
        vm.prank(lender1);
        pool.deposit{value: 10 ether}();

        vm.prank(lender2);
        pool.deposit{value: 5 ether}();

        LendingPool.PoolStats memory stats = pool.getPoolStats();
        assertEq(stats.totalDeposits, 15 ether);
        assertEq(stats.totalShares, 15 ether);
    }

    function test_RevertWhen_DepositZero() public {
        vm.prank(lender1);
        vm.expectRevert("Amount must be positive");
        pool.deposit{value: 0}();
    }

    // ── Withdraw ────────────────────────────────────────────────────

    function test_Withdraw_ReturnsFunds() public {
        vm.prank(lender1);
        pool.deposit{value: 10 ether}();

        uint256 balBefore = lender1.balance;
        vm.prank(lender1);
        pool.withdraw(10 ether);
        assertEq(lender1.balance, balBefore + 10 ether);
    }

    function test_RevertWhen_WithdrawInsufficientShares() public {
        vm.prank(lender1);
        pool.deposit{value: 5 ether}();

        vm.prank(lender1);
        vm.expectRevert("Insufficient shares");
        pool.withdraw(10 ether);
    }

    // ── Allocate Loan ───────────────────────────────────────────────

    function test_AllocateLoan() public {
        vm.prank(lender1);
        pool.deposit{value: 10 ether}();

        uint256 balBefore = borrower.balance;
        vm.prank(poolRole);
        pool.allocateLoan(borrower, 3 ether);

        assertEq(borrower.balance, balBefore + 3 ether);

        LendingPool.PoolStats memory stats = pool.getPoolStats();
        assertEq(stats.availableLiquidity, 7 ether);
        assertEq(stats.totalBorrowed, 3 ether);
    }

    function test_RevertWhen_AllocateExceedsLiquidity() public {
        vm.prank(lender1);
        pool.deposit{value: 5 ether}();

        vm.prank(poolRole);
        vm.expectRevert("Insufficient liquidity");
        pool.allocateLoan(borrower, 10 ether);
    }

    function test_RevertWhen_NonPoolRoleAllocates() public {
        vm.prank(lender1);
        pool.deposit{value: 10 ether}();

        vm.prank(lender1);
        vm.expectRevert();
        pool.allocateLoan(borrower, 1 ether);
    }

    // ── Repayment ───────────────────────────────────────────────────

    function test_RecordRepayment_WithInterest() public {
        vm.prank(lender1);
        pool.deposit{value: 10 ether}();

        vm.prank(poolRole);
        pool.allocateLoan(borrower, 5 ether);

        vm.prank(poolRole);
        pool.recordRepayment{value: 5.5 ether}(5 ether, 0.5 ether);

        LendingPool.PoolStats memory stats = pool.getPoolStats();
        assertEq(stats.totalBorrowed, 0);
        assertEq(stats.totalInterestEarned, 0.5 ether);
    }

    // ── Share Value (Interest Accrual) ───────────────────────────────

    function test_ShareValueIncreasesWithInterest() public {
        vm.prank(lender1);
        pool.deposit{value: 10 ether}();

        // Allocate and repay with interest
        vm.startPrank(poolRole);
        pool.allocateLoan(borrower, 5 ether);
        vm.stopPrank();

        // Borrower repays with 1 ether interest
        vm.prank(poolRole);
        pool.recordRepayment{value: 6 ether}(5 ether, 1 ether);

        // Share value should now be > 1 ETH per share
        uint256 value = pool.getShareValue(10 ether);
        assertEq(value, 11 ether); // 10 deposited + 1 interest
    }

    // ── Pausable ────────────────────────────────────────────────────

    function test_RevertWhen_PausedDeposit() public {
        pool.pause();
        vm.prank(lender1);
        vm.expectRevert();
        pool.deposit{value: 1 ether}();
    }

    function test_RevertWhen_PausedAllocate() public {
        vm.prank(lender1);
        pool.deposit{value: 10 ether}();

        pool.pause();
        vm.prank(poolRole);
        vm.expectRevert();
        pool.allocateLoan(borrower, 1 ether);
    }

    // ── Lender Count ────────────────────────────────────────────────

    function test_LenderCount() public {
        vm.prank(lender1);
        pool.deposit{value: 1 ether}();
        vm.prank(lender2);
        pool.deposit{value: 1 ether}();
        assertEq(pool.getLenderCount(), 2);
    }

    // ── Events ──────────────────────────────────────────────────────

    function test_EmitsLiquidityDeposited() public {
        vm.prank(lender1);
        vm.expectEmit(true, false, false, true);
        emit LendingPool.LiquidityDeposited(lender1, 5 ether, 5 ether);
        pool.deposit{value: 5 ether}();
    }

    function test_EmitsLoanAllocated() public {
        vm.prank(lender1);
        pool.deposit{value: 10 ether}();

        vm.prank(poolRole);
        vm.expectEmit(true, false, false, true);
        emit LendingPool.LoanAllocated(borrower, 3 ether);
        pool.allocateLoan(borrower, 3 ether);
    }
}
