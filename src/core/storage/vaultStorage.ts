import type { EncryptedVault } from "../crypto/cryptoClient";

const VAULT_STORAGE_KEY = "vaultlight.encrypted-vault";
const META_STORAGE_KEY = "vaultlight.meta";

export interface VaultMeta {
  createdAt: number;
  updatedAt: number;
  lastUnlockedAt?: number;
}

export function hasExistingVault(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(VAULT_STORAGE_KEY) !== null;
}

export function loadEncryptedVault(): EncryptedVault | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as EncryptedVault;
  } catch (error) {
    console.error("Failed to parse encrypted vault", error);
    return null;
  }
}

export function saveEncryptedVault(record: EncryptedVault): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(record));
  const meta: VaultMeta = loadVaultMeta() ?? { createdAt: Date.now(), updatedAt: Date.now() };
  meta.updatedAt = Date.now();
  window.localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
}

export function loadVaultMeta(): VaultMeta | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(META_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as VaultMeta;
  } catch (error) {
    console.error("Failed to parse vault meta", error);
    return null;
  }
}

export function markLastUnlocked(): void {
  if (typeof window === "undefined") {
    return;
  }
  const meta = loadVaultMeta() ?? { createdAt: Date.now(), updatedAt: Date.now() };
  meta.lastUnlockedAt = Date.now();
  window.localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
}

export function clearStoredVault(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(VAULT_STORAGE_KEY);
  window.localStorage.removeItem(META_STORAGE_KEY);
}
