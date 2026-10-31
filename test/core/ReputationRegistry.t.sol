// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ReputationRegistry} from "../../contracts/core/ReputationRegistry.sol";

contract ReputationRegistryTest is Test {
    ReputationRegistry rep;
    address admin = address(this);
    address oracle = address(0xAA);
    address borrower1 = address(0xBB);
    address borrower2 = address(0xCC);

    function setUp() public {
        rep = new ReputationRegistry();
        rep.grantRole(rep.ORACLE_ROLE(), oracle);
    }

    // ── Basic Repayment ─────────────────────────────────────────────

    function test_RecordRepayment_IncreasesScore() public {
        vm.prank(oracle);
        rep.recordRepayment(borrower1, 1000);

        ReputationRegistry.Reputation memory r = rep.getReputation(borrower1);
        assertEq(r.totalRepayments, 1);
        assertEq(r.totalAmountRepaid, 1000);
        assertEq(r.streakCount, 1);
        // BASE(300) + REPAYMENT_BOOST(15) + STREAK_BONUS(5)*1 = 320
        assertEq(r.currentScore, 320);
    }

    function test_RecordRepayment_StreakBonus() public {
        vm.startPrank(oracle);
        rep.recordRepayment(borrower1, 1000);
        rep.recordRepayment(borrower1, 1000);
        rep.recordRepayment(borrower1, 1000);
        vm.stopPrank();

        ReputationRegistry.Reputation memory r = rep.getReputation(borrower1);
        assertEq(r.totalRepayments, 3);
        assertEq(r.streakCount, 3);
        // 300 + (15+5) + (15+10) + (15+15) = 375
        assertEq(r.currentScore, 375);
    }

    // ── Default ─────────────────────────────────────────────────────

    function test_RecordDefault_DecreasesScore() public {
        // First give some score
        vm.startPrank(oracle);
        rep.recordRepayment(borrower1, 1000);
        rep.recordRepayment(borrower1, 1000);
        rep.recordDefault(borrower1, 500);
        vm.stopPrank();

        ReputationRegistry.Reputation memory r = rep.getReputation(borrower1);
        assertEq(r.totalDefaults, 1);
        assertEq(r.streakCount, 0); // Reset
        // 300 + 20 + 25 - 50 = 295
        assertEq(r.currentScore, 295);
    }

    function test_RecordDefault_ScoreFloorAtZero() public {
        vm.startPrank(oracle);
        rep.recordDefault(borrower1, 1000);
        rep.recordDefault(borrower1, 1000);
        rep.recordDefault(borrower1, 1000);
        rep.recordDefault(borrower1, 1000);
        rep.recordDefault(borrower1, 1000);
        rep.recordDefault(borrower1, 1000);
        rep.recordDefault(borrower1, 1000);
        vm.stopPrank();

        ReputationRegistry.Reputation memory r = rep.getReputation(borrower1);
        assertEq(r.currentScore, 0);
    }

    // ── Score Cap ────────────────────────────────────────────────────

    function test_ScoreCapsAtMax() public {
        vm.startPrank(oracle);
        for (uint i = 0; i < 50; i++) {
            rep.recordRepayment(borrower1, 1000);
        }
        vm.stopPrank();

        ReputationRegistry.Reputation memory r = rep.getReputation(borrower1);
        assertEq(r.currentScore, 1000); // MAX_SCORE
    }

    // ── Access Control ──────────────────────────────────────────────

    function test_RevertWhen_NonOracleRecordsRepayment() public {
        vm.prank(borrower1);
        vm.expectRevert();
        rep.recordRepayment(borrower1, 1000);
    }

    function test_RevertWhen_NonOracleRecordsDefault() public {
        vm.prank(borrower1);
        vm.expectRevert();
        rep.recordDefault(borrower1, 1000);
    }

    // ── Pausable ────────────────────────────────────────────────────

    function test_RevertWhen_PausedRepayment() public {
        rep.pause();
        vm.prank(oracle);
        vm.expectRevert();
        rep.recordRepayment(borrower1, 1000);
    }

    function test_UnpauseResumesOperations() public {
        rep.pause();
        rep.unpause();
        vm.prank(oracle);
        rep.recordRepayment(borrower1, 1000);
        assertEq(rep.getScore(borrower1), 320);
    }

    // ── View Functions ──────────────────────────────────────────────

    function test_GetScore_ReturnsBaseForNewWallet() public view {
        assertEq(rep.getScore(borrower2), 300); // BASE_SCORE
    }

    function test_TrackedWalletCount() public {
        vm.startPrank(oracle);
        rep.recordRepayment(borrower1, 100);
        rep.recordRepayment(borrower2, 100);
        vm.stopPrank();
        assertEq(rep.getTrackedWalletCount(), 2);
    }

    // ── Invalid Inputs ──────────────────────────────────────────────

    function test_RevertWhen_ZeroAddressRepayment() public {
        vm.prank(oracle);
        vm.expectRevert("Invalid wallet");
        rep.recordRepayment(address(0), 1000);
    }

    function test_RevertWhen_ZeroAmountRepayment() public {
        vm.prank(oracle);
        vm.expectRevert("Amount must be positive");
        rep.recordRepayment(borrower1, 0);
    }

    // ── Events ──────────────────────────────────────────────────────

    function test_EmitsRepaymentRecorded() public {
        vm.prank(oracle);
        vm.expectEmit(true, false, false, true);
        emit ReputationRegistry.RepaymentRecorded(borrower1, 1000, 320, 1);
        rep.recordRepayment(borrower1, 1000);
    }

    function test_EmitsDefaultRecorded() public {
        vm.prank(oracle);
        vm.expectEmit(true, false, false, true);
        emit ReputationRegistry.DefaultRecorded(borrower1, 500, 250);
        rep.recordDefault(borrower1, 500);
    }
}
