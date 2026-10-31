import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Deploys the A2A trust layer and wires the registry as the policy's spend meter.
// The deployer is admin and initial SETTLER; grant SETTLER_ROLE to the merchant agent afterwards.
export default buildModule("CredenceA2A", (m) => {
  const admin = m.getAccount(0);

  const policy = m.contract("AgentSpendingPolicy", [admin]);
  const registry = m.contract("A2ASettlementRegistry", [admin, policy]);

  const meterRole = m.staticCall(policy, "METER_ROLE");
  m.call(policy, "grantRole", [meterRole, registry]);

  return { policy, registry };
});
