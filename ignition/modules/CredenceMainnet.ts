import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// HSK Chain mainnet (177): deploys only the hackathon A2A layer and wires it into the
// ReputationRegistry that is already live on mainnet from the Credence prototype.
// The test dollar is not deployed: on mainnet the HSP rail settles real USDC (EIP-3009).
//
//   npx hardhat run scripts/mainnet-preflight.ts --network hashkey
//   npx hardhat ignition deploy ignition/modules/CredenceMainnet.ts --network hashkey --deployment-id credence-mainnet
export default buildModule("CredenceMainnet", (m) => {
  const admin = m.getAccount(0);
  const reputationAddress = m.getParameter("reputation", "0x110e9fB1ABEc92521E4511d5f45B4917B4c941Ab");
  const merchantAgent = m.getParameter("merchantAgent", "0x0000000000000000000000000000000000000000");

  const policy = m.contract("AgentSpendingPolicy", [admin]);
  const registry = m.contract("A2ASettlementRegistry", [admin, policy]);
  const reputation = m.contractAt("ReputationRegistry", reputationAddress);

  const meterRole = m.staticCall(policy, "METER_ROLE", [], 0, { id: "METER_ROLE" });
  m.call(policy, "grantRole", [meterRole, registry], { id: "policy_meter_registry" });

  const oracleRole = m.staticCall(reputation, "ORACLE_ROLE", [], 0, { id: "ORACLE_ROLE" });
  m.call(reputation, "grantRole", [oracleRole, registry], { id: "rep_oracle_a2a" });
  m.call(registry, "setReputationRegistry", [reputation]);

  const settlerRole = m.staticCall(registry, "SETTLER_ROLE", [], 0, { id: "SETTLER_ROLE" });
  m.call(registry, "grantRole", [settlerRole, merchantAgent], { id: "registry_settler_merchant" });

  return { policy, registry };
});
