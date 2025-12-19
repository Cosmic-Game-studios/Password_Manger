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
  kdf?: {
    algorithm: "PBKDF2";
    hash: "SHA-256";
    iterations: number;
  };
}

const DEFAULT_VAULT_VERSION = 1;
const ENCRYPTED_VAULT_VERSION = 2;
const LEGACY_PBKDF2_ITERATIONS = 210_000;
const STRONG_PBKDF2_ITERATIONS = 600_000;
const DEFAULT_SALT_BYTES = 32;
const LEGACY_SALT_BYTES = 16;
const IV_BYTES = 12;
const VAULT_AAD = encoder.encode("vaultlight.v2");

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
  iterations: number,
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
      iterations,
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

function requireLength(bytes: Uint8Array, expected: number, label: string) {
  if (bytes.length !== expected) {
    throw new Error(
      `Invalid ${label} length: expected ${expected} bytes, received ${bytes.length}.`,
    );
  }
}

export async function encryptVault(
  masterPassword: string,
  payload: VaultPayload,
): Promise<EncryptedVault> {
  const crypto = ensureCrypto();
  const salt = crypto.getRandomValues(new Uint8Array(DEFAULT_SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(masterPassword, salt, STRONG_PBKDF2_ITERATIONS);
  const plaintext = encoder.encode(JSON.stringify(payload));

  const cipherBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: VAULT_AAD,
    },
    key,
    plaintext,
  );

  return {
    version: ENCRYPTED_VAULT_VERSION,
    cipherText: toBase64(cipherBuffer),
    iv: toBase64(iv),
    salt: toBase64(salt),
    kdf: {
      algorithm: "PBKDF2",
      hash: "SHA-256",
      iterations: STRONG_PBKDF2_ITERATIONS,
    },
  };
}

export async function decryptVault(
  masterPassword: string,
  encrypted: EncryptedVault,
): Promise<VaultPayload> {
  const crypto = ensureCrypto();
  const encryptedVersion = encrypted.version ?? 1;
  if (encryptedVersion > ENCRYPTED_VAULT_VERSION) {
    throw new Error(
      `Unsupported encrypted vault version ${encryptedVersion}. Expected ${ENCRYPTED_VAULT_VERSION}.`,
    );
  }
  const salt = fromBase64(encrypted.salt);
  const iv = fromBase64(encrypted.iv);
  const iterations =
    encrypted.kdf?.iterations ??
    (encryptedVersion >= 2 ? STRONG_PBKDF2_ITERATIONS : LEGACY_PBKDF2_ITERATIONS);
  if (encrypted.kdf && encrypted.kdf.algorithm !== "PBKDF2") {
    throw new Error(`Unsupported KDF ${encrypted.kdf.algorithm}.`);
  }
  if (encryptedVersion >= 2) {
    requireLength(salt, DEFAULT_SALT_BYTES, "salt");
  } else {
    requireLength(salt, LEGACY_SALT_BYTES, "salt");
  }
  requireLength(iv, IV_BYTES, "iv");
  const key = await deriveKey(masterPassword, salt, iterations);
  const cipherText = fromBase64(encrypted.cipherText);

  const plainBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: encryptedVersion >= 2 ? VAULT_AAD : undefined,
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
