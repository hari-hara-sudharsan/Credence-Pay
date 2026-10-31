import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Full Credence stack: the core trust contracts from the prototype plus the
// A2A payment layer built for the hackathon, wired together.
export default buildModule("Credence", (m) => {
  const admin = m.getAccount(0);

  // --- core trust layer ---
  const passport = m.contract("CreditPassportV2");
  const reputation = m.contract("ReputationRegistry");
  const settlement = m.contract("SettlementManager");
  const lendingPool = m.contract("LendingPool");
  const loanManager = m.contract("LoanManager");

  // --- A2A payment layer ---
  const testUsd = m.contract("CredenceTestUSD", [admin]);
  const policy = m.contract("AgentSpendingPolicy", [admin]);
  const registry = m.contract("A2ASettlementRegistry", [admin, policy]);

  // --- wiring ---
  const oracleRole = m.staticCall(reputation, "ORACLE_ROLE", [], 0, { id: "ORACLE_ROLE" });
  m.call(reputation, "grantRole", [oracleRole, settlement], { id: "rep_oracle_settlement" });
  m.call(reputation, "grantRole", [oracleRole, loanManager], { id: "rep_oracle_loans" });
  m.call(reputation, "grantRole", [oracleRole, registry], { id: "rep_oracle_a2a" });

  m.call(settlement, "setReputationRegistry", [reputation]);
  m.call(settlement, "setCreditPassportV2", [passport]);
  m.call(settlement, "setLendingAsset", [testUsd]);
  m.call(loanManager, "setReputationRegistry", [reputation]);

  const meterRole = m.staticCall(policy, "METER_ROLE", [], 0, { id: "METER_ROLE" });
  m.call(policy, "grantRole", [meterRole, registry], { id: "policy_meter_registry" });
  m.call(registry, "setReputationRegistry", [reputation]);

  return { passport, reputation, settlement, lendingPool, loanManager, testUsd, policy, registry };
});
