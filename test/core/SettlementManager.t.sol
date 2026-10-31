// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {SettlementManager} from "../../contracts/core/SettlementManager.sol";

contract SettlementManagerTest is Test {
    SettlementManager sm;
    address admin = address(this);
    address settler = address(0xAA);
    address borrower = address(0xBB);
    address lender = address(0xCC);

    function setUp() public {
        sm = new SettlementManager();
        sm.grantRole(sm.SETTLEMENT_ROLE(), settler);
        // Fund settler for native ETH settlements
        vm.deal(settler, 100 ether);
    }

    // ── Create Settlement ────────────────────────────────────────────

    function test_CreateSettlement() public {
        vm.prank(settler);
        uint256 sid = sm.createSettlement(1, borrower, lender, 1 ether);
        assertEq(sid, 1);
        assertEq(sm.settlementCount(), 1);

        SettlementManager.Settlement memory s = sm.getSettlement(1);
        assertEq(s.loanId, 1);
        assertEq(s.borrower, borrower);
        assertEq(s.lender, lender);
        assertEq(s.amount, 1 ether);
        assertEq(uint(s.state), uint(SettlementManager.SettlementState.CREATED));
    }

    function test_RevertWhen_NonSettlerCreates() public {
        vm.prank(borrower);
        vm.expectRevert();
        sm.createSettlement(1, borrower, lender, 1 ether);
    }

    function test_RevertWhen_ZeroBorrower() public {
        vm.prank(settler);
        vm.expectRevert("Invalid borrower");
        sm.createSettlement(1, address(0), lender, 1 ether);
    }

    function test_RevertWhen_SameBorrowerLender() public {
        vm.prank(settler);
        vm.expectRevert("Borrower cannot be lender");
        sm.createSettlement(1, borrower, borrower, 1 ether);
    }

    function test_RevertWhen_ZeroAmount() public {
        vm.prank(settler);
        vm.expectRevert("Amount must be positive");
        sm.createSettlement(1, borrower, lender, 0);
    }

    // ── Execute Settlement (Native ETH) ──────────────────────────────

    function test_ExecuteSettlement_NativeETH() public {
        vm.prank(settler);
        sm.createSettlement(1, borrower, lender, 1 ether);

        uint256 balBefore = borrower.balance;
        vm.prank(settler);
        sm.executeSettlement{value: 1 ether}(1);

        assertEq(borrower.balance, balBefore + 1 ether);

        SettlementManager.Settlement memory s = sm.getSettlement(1);
        assertEq(uint(s.state), uint(SettlementManager.SettlementState.EXECUTED));
        assertTrue(s.settlementRef != bytes32(0));
        assertTrue(s.executedAt > 0);
    }

    function test_RevertWhen_ExecuteInsufficientETH() public {
        vm.prank(settler);
        sm.createSettlement(1, borrower, lender, 1 ether);

        vm.prank(settler);
        vm.expectRevert("Insufficient ETH sent");
        sm.executeSettlement{value: 0.5 ether}(1);
    }

    function test_RevertWhen_ExecuteNonExistent() public {
        vm.prank(settler);
        vm.expectRevert("Settlement not found");
        sm.executeSettlement{value: 1 ether}(999);
    }

    function test_RevertWhen_DoubleExecute() public {
        vm.startPrank(settler);
        sm.createSettlement(1, borrower, lender, 1 ether);
        sm.executeSettlement{value: 1 ether}(1);

        vm.expectRevert("Settlement not in CREATED state");
        sm.executeSettlement{value: 1 ether}(1);
        vm.stopPrank();
    }

    // ── Verify Settlement ────────────────────────────────────────────

    function test_VerifySettlement_Executed() public {
        vm.startPrank(settler);
        sm.createSettlement(1, borrower, lender, 1 ether);
        sm.executeSettlement{value: 1 ether}(1);
        vm.stopPrank();

        (bool completed, bytes32 ref, uint256 executedAt) = sm.verifySettlement(1);
        assertTrue(completed);
        assertTrue(ref != bytes32(0));
        assertTrue(executedAt > 0);
    }

    function test_VerifySettlement_NotExecuted() public {
        vm.prank(settler);
        sm.createSettlement(1, borrower, lender, 1 ether);

        (bool completed, , ) = sm.verifySettlement(1);
        assertFalse(completed);
    }

    // ── Pausable ────────────────────────────────────────────────────

    function test_RevertWhen_PausedCreate() public {
        sm.pause();
        vm.prank(settler);
        vm.expectRevert();
        sm.createSettlement(1, borrower, lender, 1 ether);
    }

    function test_RevertWhen_PausedExecute() public {
        vm.prank(settler);
        sm.createSettlement(1, borrower, lender, 1 ether);

        sm.pause();
        vm.prank(settler);
        vm.expectRevert();
        sm.executeSettlement{value: 1 ether}(1);
    }

    // ── Events ──────────────────────────────────────────────────────

    function test_EmitsSettlementCreated() public {
        vm.prank(settler);
        vm.expectEmit(true, true, false, true);
        emit SettlementManager.SettlementCreated(1, 1, borrower, lender, 1 ether);
        sm.createSettlement(1, borrower, lender, 1 ether);
    }

    // ── Multiple Settlements ────────────────────────────────────────

    function test_MultipleSettlements() public {
        vm.startPrank(settler);
        sm.createSettlement(1, borrower, lender, 1 ether);
        sm.createSettlement(2, borrower, lender, 2 ether);
        sm.createSettlement(3, borrower, lender, 3 ether);
        vm.stopPrank();

        assertEq(sm.settlementCount(), 3);
        assertEq(sm.getSettlement(2).amount, 2 ether);
    }

    // ── Refund Excess ETH ───────────────────────────────────────────

    function test_RefundsExcessETH() public {
        vm.prank(settler);
        sm.createSettlement(1, borrower, lender, 1 ether);

        uint256 balBefore = settler.balance;
        vm.prank(settler);
        sm.executeSettlement{value: 2 ether}(1);

        // Settler gets back 1 ether (sent 2, settlement was 1)
        assertEq(settler.balance, balBefore - 1 ether);
    }
}
