const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface VaultEntry {
  id: string;
  label: string;
  username: string;
  password: string;
  createdAt: number;
  updatedAt: number;
  notes?: string;
  exposure?: PasswordExposure;
  url?: string;
  domain?: string;
}

export interface PasswordExposure {
  status: "pending" | "safe" | "warning" | "breached";
  sources: ExposureSource[];
  lastChecked: number;
  errors?: string[];
}

export interface ExposureSource {
  provider: string;
  description: string;
  matches: number;
  severity: "low" | "medium" | "high";
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

const DEFAULT_VAULT_VERSION = 1;

function ensureCrypto(): Crypto {
  if (typeof globalThis.crypto === "undefined") {
    throw new Error("Web Crypto API not available in this environment.");
  }
  return globalThis.crypto as Crypto;
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
  const binaryString = atob(value);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(
  masterPassword: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
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

export async function encryptVault(
  masterPassword: string,
  payload: VaultPayload,
): Promise<EncryptedVault> {
  const crypto = ensureCrypto();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(masterPassword, salt);
  const plaintext = encoder.encode(JSON.stringify(payload));

  const cipherBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    plaintext,
  );

  return {
    version: DEFAULT_VAULT_VERSION,
    cipherText: toBase64(cipherBuffer),
    iv: toBase64(iv),
    salt: toBase64(salt),
  };
}

export async function decryptVault(
  masterPassword: string,
  encrypted: EncryptedVault,
): Promise<VaultPayload> {
  const crypto = ensureCrypto();
  const salt = fromBase64(encrypted.salt);
  const iv = fromBase64(encrypted.iv);
  const key = await deriveKey(masterPassword, salt);
  const cipherText = fromBase64(encrypted.cipherText);

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

export function emptyVault(): VaultPayload {
  return {
    version: DEFAULT_VAULT_VERSION,
    entries: [],
  };
}

export function serializeVault(payload: VaultPayload): string {
  return JSON.stringify(payload);
}

export function deserializeVault(serialized: string): VaultPayload {
  return JSON.parse(serialized) as VaultPayload;
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
