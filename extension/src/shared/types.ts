export type ExposureSeverity = "low" | "medium" | "high";
export type ExposureStatus = "pending" | "safe" | "warning" | "breached";

export interface ExposureSource {
  provider: string;
  description: string;
  matches: number;
  severity: ExposureSeverity;
}

export interface PasswordExposure {
  status: ExposureStatus;
  sources: ExposureSource[];
  lastChecked: number;
  errors?: string[];
}

export interface VaultEntry {
  id: string;
  label: string;
  username: string;
  password: string;
  createdAt: number;
  updatedAt: number;
  notes?: string;
  exposure?: PasswordExposure;
}

export interface VaultPayload {
  version: number;
  entries: VaultEntry[];
}

export interface EncryptedVault {
  version: number;
  cipherText: string;
  iv: string;
  salt: string;
}

export interface VaultMeta {
  createdAt: number;
  updatedAt: number;
  lastUnlockedAt?: number;
}

export interface EntryPreview {
  id: string;
  label: string;
  username: string;
  updatedAt: number;
  exposure?: PasswordExposure;
}
