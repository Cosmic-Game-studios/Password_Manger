import {
  decryptVault,
  encryptVault,
  emptyVault,
  type VaultEntry,
  type VaultPayload,
  hydrateExposures,
} from "../crypto/cryptoClient";
import {
  loadEncryptedVault,
  saveEncryptedVault,
  hasExistingVault,
  clearStoredVault,
  markLastUnlocked,
} from "./vaultStorage";

export interface UnlockResult {
  payload: VaultPayload;
  isNewVault: boolean;
}

export async function unlockVault(masterPassword: string): Promise<UnlockResult> {
  const encrypted = loadEncryptedVault();
  if (!encrypted) {
    const fresh = emptyVault();
    markLastUnlocked();
    return {
      payload: fresh,
      isNewVault: true,
    };
  }

  const decrypted = await decryptVault(masterPassword, encrypted);
  markLastUnlocked();
  return {
    payload: {
      ...decrypted,
      entries: hydrateExposures(decrypted.entries),
    },
    isNewVault: false,
  };
}

export async function persistVault(
  masterPassword: string,
  payload: VaultPayload,
): Promise<void> {
  const encrypted = await encryptVault(masterPassword, payload);
  saveEncryptedVault(encrypted);
}

function requireCrypto(): Crypto {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto;
  }
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto as Crypto;
  }
  throw new Error("randomUUID not available in this environment.");
}

export function initializeVaultEntry(partial: Partial<VaultEntry>): VaultEntry {
  const cryptoRef = requireCrypto();
  const now = Date.now();
  return {
    id: cryptoRef.randomUUID(),
    label: partial.label ?? "Neuer Eintrag",
    username: partial.username ?? "",
    password: partial.password ?? "",
    notes: partial.notes,
    createdAt: partial.createdAt ?? now,
    updatedAt: now,
    exposure: partial.exposure ?? {
      status: "pending",
      sources: [],
      lastChecked: 0,
      errors: [],
    },
  };
}

export function vaultExists(): boolean {
  return hasExistingVault();
}

export function resetVault(): void {
  clearStoredVault();
}
