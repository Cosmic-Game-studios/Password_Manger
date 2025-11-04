export interface VaultIntelRecord {
  hash: string;
  description: string;
  source: string;
  severity: "medium" | "high";
  matches: number;
}

export const VAULT_INTEL_SAMPLE: VaultIntelRecord[] = [
  {
    hash: "7b6bbf0c2dc99ea6bf308a78b74dde2ac22b51c96ba5211a4535b0c3d0552560",
    description: "Credential Stuffing Toolkit Leak (2024/Q1)",
    source: "Vaultlight Threat Intel Feed",
    severity: "high",
    matches: 4,
  },
  {
    hash: "41e5653fc7aeb894026d6bb7b2db7f65902b454945fa8fd65a6327047b5277fb",
    description: "Legacy Admin Dumps Aggregator",
    source: "Vaultlight Threat Intel Feed",
    severity: "high",
    matches: 2,
  },
  {
    hash: "a6605061fff99092c221a4d08cdc8ef1393d525cae93a630ad5b473b30ab00a8",
    description: "Marketing SaaS Breach (2023/Q4)",
    source: "Vaultlight Threat Intel Feed",
    severity: "medium",
    matches: 1,
  },
  {
    hash: "a8499c7caacdbfaaa57f8e6f84fc7321d4cbcd0a97514dd4b350936066037183",
    description: "Gaming platform leak",
    source: "Vaultlight Threat Intel Feed",
    severity: "medium",
    matches: 3,
  },
  {
    hash: "2e8ba4e27be8f64e1ee6a4bb9d0f4d89f2c5cdb0be79a5e9dc0ac03ed696fbd3",
    description: "RaaS data package (2024/Q2)",
    source: "Vaultlight Threat Intel Feed",
    severity: "high",
    matches: 5,
  },
  {
    hash: "f15435b12c622e87e58bd9290ce84357007ae91f860f1cd5f6d3da6d10fee4ea",
    description: "Enterprise self-service leak",
    source: "Vaultlight Threat Intel Feed",
    severity: "medium",
    matches: 2,
  },
];
