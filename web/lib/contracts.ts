// Deployed Credence contracts. Only addresses verified on-chain belong here.
export const DEPLOYMENTS = [
  {
    network: "HashKey Chain Testnet",
    chainId: 133,
    explorer: "https://testnet-explorer.hsk.xyz",
    contracts: [
      { name: "A2ASettlementRegistry", role: "Settlement memory, trust score, terms, fee ledger", address: "0x0da11d916c5730E19a48bEc142387bEFDb59A819", hackathon: true },
      { name: "AgentSpendingPolicy", role: "Human-owned spending limits for agents", address: "0x7a9559Db3c9846825102c3513AbA2973A1A47BCA", hackathon: true },
      { name: "CredenceTestUSD", role: "EIP-3009 test dollar for the sandbox rail", address: "0x26985124407Bf5d3B3E0e1EAc8d904221f4b9bc5", hackathon: true },
      { name: "ReputationRegistry", role: "Cross-application reputation, fed by A2A settlements", address: "0x946E4397B93a147D68e7ADBa22C5A0EA718b00DC", hackathon: false },
      { name: "CreditPassportV2", role: "Soulbound credit passport", address: "0x23CB5b72399c552A5117E9762C754c429Eb5Dd3F", hackathon: false },
      { name: "SettlementManager", role: "Loan settlement and repayment records", address: "0x578dF3A9ee35d8ade83BA742E1821c67cc7338C5", hackathon: false },
      { name: "LendingPool", role: "Liquidity for future pool-backed credit tabs", address: "0xc3D08c5D8fc127f4232f112a37399E1f2547ff39", hackathon: false },
      { name: "LoanManager", role: "Loan lifecycle", address: "0xDC8FBDA1e52c7677dc05b062A30BBaC802Ac57d3", hackathon: false },
    ],
  },
];
