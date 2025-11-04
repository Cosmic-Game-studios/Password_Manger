import type { EncryptedVault, VaultPayload, VaultEntry } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const DEFAULT_VAULT_VERSION = 1;

function ensureCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto API is not available.");
  }
  return globalThis.crypto;
}

function toBase64(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(masterPassword: string, salt: Uint8Array): Promise<CryptoKey> {
  const crypto = ensureCrypto();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(masterPassword),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 210_000,
      hash: "SHA-256",
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function decryptVault(
  masterPassword: string,
  encrypted: EncryptedVault,
): Promise<VaultPayload> {
  const crypto = ensureCrypto();
  const salt = fromBase64(encrypted.salt);
  const iv = fromBase64(encrypted.iv);
  const cipherText = fromBase64(encrypted.cipherText);
  const key = await deriveKey(masterPassword, salt);

  const plainBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    cipherText,
  );

  const decoded = decoder.decode(plainBuffer);
  const payload = JSON.parse(decoded) as VaultPayload;
  if (payload.version !== DEFAULT_VAULT_VERSION) {
    throw new Error(
      `Unsupported vault version ${payload.version}. Expected ${DEFAULT_VAULT_VERSION}.`,
    );
  }
  return payload;
}

export function hydrateExposures(entries: VaultEntry[]): VaultEntry[] {
  return entries.map((entry) => ({
    ...entry,
    exposure:
      entry.exposure ?? {
        status: "pending",
        sources: [],
        lastChecked: 0,
        errors: [],
      },
  }));
}
