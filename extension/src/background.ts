import {
  decryptVault,
  hydrateExposures,
  encryptVault,
} from "./shared/crypto";
import type {
  EncryptedVault,
  VaultPayload,
  VaultMeta,
  EntryPreview,
  VaultEntry,
} from "./shared/types";
import {
  DEFAULT_SECURITY_STATE,
  deriveFailure,
  deriveSuccess,
  loadSecurityState,
  resetSecurityState as resetStoredSecurityState,
  storeSecurityState,
  type SecurityState,
} from "./shared/security";

const STORAGE_KEY = "vaultlight.encryptedVault";
const META_KEY = "vaultlight.meta";
const AUTO_LOCK_MS = 5 * 60 * 1000;
const EXTENSION_DISABLED = true;
const DISABLED_MESSAGE =
  "Vaultlight extension is temporarily disabled while we complete upcoming improvements.";

let encryptedVault: EncryptedVault | null = null;
let vaultMeta: VaultMeta | null = null;
let decryptedVault: VaultPayload | null = null;
let lockTimer: number | undefined;
let securityState: SecurityState = { ...DEFAULT_SECURITY_STATE };
let masterSecret: string | null = null;

type PasswordOptions = {
  length: number;
  useUppercase: boolean;
  useLowercase: boolean;
  useDigits: boolean;
  useSymbols: boolean;
  avoidAmbiguous: boolean;
};

const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
  length: 20,
  useUppercase: true,
  useLowercase: true,
  useDigits: true,
  useSymbols: true,
  avoidAmbiguous: true,
};

const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.<>/?";
const AMBIGUOUS = "Il1O0";

function normalizeHost(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = trimmed.includes("://") ? new URL(trimmed) : new URL(`https://${trimmed}`);
    const host = url.hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    const fallback = trimmed.toLowerCase().replace(/^[^a-z0-9]+/i, "");
    if (!fallback) return null;
    return fallback.startsWith("www.") ? fallback.slice(4) : fallback;
  }
}

function getCrypto(): Crypto {
  const instance = globalThis.crypto;
  if (!instance?.getRandomValues) {
    throw new Error("Secure random generator not available.");
  }
  return instance;
}

function randomUUID(): string {
  const crypto = getCrypto();
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0"));
  return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`;
}

function filterAmbiguous(source: string, avoid: boolean): string {
  if (!avoid) return source;
  const ambiguous = new Set(AMBIGUOUS.split(""));
  return source
    .split("")
    .filter((char) => !ambiguous.has(char))
    .join("");
}

function generateStrongPassword(options: Partial<PasswordOptions> = {}): string {
  const config: PasswordOptions = { ...DEFAULT_PASSWORD_OPTIONS, ...options };
  const pools: string[] = [];
  if (config.useLowercase) pools.push(filterAmbiguous(LOWERCASE, config.avoidAmbiguous));
  if (config.useUppercase) pools.push(filterAmbiguous(UPPERCASE, config.avoidAmbiguous));
  if (config.useDigits) pools.push(filterAmbiguous(DIGITS, config.avoidAmbiguous));
  if (config.useSymbols) pools.push(filterAmbiguous(SYMBOLS, config.avoidAmbiguous));
  const filtered = pools.filter((pool) => pool.length > 0);
  if (filtered.length === 0) {
    throw new Error("At least one character group must be selected.");
  }
  const combined = filtered.join("");
  const crypto = getCrypto();
  const indices = new Uint32Array(config.length);
  crypto.getRandomValues(indices);
  const chars: string[] = [];
  for (let i = 0; i < config.length; i += 1) {
    const index = indices[i] % combined.length;
    chars.push(combined[index]);
  }
  filtered.forEach((pool, poolIndex) => {
    if (poolIndex >= chars.length) return;
    if (!chars.some((char) => pool.includes(char))) {
      const randomIndex = indices[poolIndex] % pool.length;
      const slot = poolIndex % chars.length;
      chars[slot] = pool[randomIndex];
    }
  });
  return chars.join("");
}

function createVaultEntry(partial: Partial<VaultEntry>): VaultEntry {
  const now = Date.now();
  return {
    id: partial.id ?? randomUUID(),
    label: partial.label ?? "New entry",
    username: partial.username ?? "",
    password: partial.password ?? "",
    notes: partial.notes,
    url: partial.url,
    domain: partial.domain,
    createdAt: partial.createdAt ?? now,
    updatedAt: now,
    exposure:
      partial.exposure ??
      {
        status: "pending",
        sources: [],
        lastChecked: 0,
        errors: [],
      },
  };
}

async function loadFromStorage() {
  const stored = await chrome.storage.local.get([STORAGE_KEY, META_KEY]);
  encryptedVault = stored[STORAGE_KEY] ?? null;
  vaultMeta = stored[META_KEY] ?? null;
  securityState = await loadSecurityState();
}

async function updateSecurityState(next: SecurityState) {
  securityState = next;
  await storeSecurityState(next);
}

function formatLockCountdown(lockUntil: number): string {
  const totalSeconds = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${seconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours}h ${remMinutes}m`;
}

function scheduleLock() {
  if (lockTimer) {
    clearTimeout(lockTimer);
  }
  lockTimer = setTimeout(() => {
    lockVault("Locked automatically after inactivity.");
  }, AUTO_LOCK_MS) as unknown as number;
}

function lockVault(reason?: string) {
  decryptedVault = null;
  masterSecret = null;
  if (lockTimer) {
    clearTimeout(lockTimer);
    lockTimer = undefined;
  }
  if (reason) {
    chrome.runtime.sendMessage({ type: "vaultlight.lock-notice", reason }).catch(() => {
      // no popup listening
    });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  if (EXTENSION_DISABLED) return;
  void loadFromStorage();
});

chrome.runtime.onStartup.addListener(() => {
  if (EXTENSION_DISABLED) return;
  void loadFromStorage();
});

async function ensureEncryptedVaultLoaded() {
  if (!encryptedVault) {
    await loadFromStorage();
  }
}

function getEntryPreviews(): EntryPreview[] {
  if (!decryptedVault) {
    return [];
  }
  return [...decryptedVault.entries]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      username: entry.username,
      updatedAt: entry.updatedAt,
      exposure: entry.exposure,
      url: entry.url,
      domain: resolveEntryDomain(entry) ?? undefined,
    }));
}

function resolveEntryDomain(entry: VaultEntry): string | null {
  if (!entry.domain && entry.url) {
    const derived = normalizeHost(entry.url);
    if (derived) {
      entry.domain = derived;
      return derived;
    }
  }
  return entry.domain ?? null;
}

async function persistDecryptedVault() {
  if (!decryptedVault || !masterSecret) {
    return;
  }
  const encrypted = await encryptVault(masterSecret, decryptedVault);
  encryptedVault = encrypted;
  const now = Date.now();
  const nextMeta: VaultMeta = {
    createdAt: vaultMeta?.createdAt ?? now,
    updatedAt: now,
    lastUnlockedAt: vaultMeta?.lastUnlockedAt,
  };
  await chrome.storage.local.set({
    [STORAGE_KEY]: encrypted,
    [META_KEY]: nextMeta,
  });
  vaultMeta = nextMeta;
}

function getTabHost(tab?: chrome.tabs.Tab): string | null {
  const url = tab?.url ?? (tab as { pendingUrl?: string } | undefined)?.pendingUrl;
  if (!url) return null;
  return normalizeHost(url);
}

function ensureHostMatches(entry: VaultEntry, host: string | null): boolean {
  const entryDomain = resolveEntryDomain(entry);
  if (!entryDomain) {
    return true;
  }
  if (!host) {
    return false;
  }
  return entryDomain === host;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type } = message ?? {};

  if (EXTENSION_DISABLED) {
    if (type === "vaultlight.getStatus") {
      sendResponse({
        success: false,
        hasEncrypted: false,
        unlocked: false,
        meta: null,
        error: DISABLED_MESSAGE,
      });
    } else {
      sendResponse({ success: false, error: DISABLED_MESSAGE });
    }
    return true;
  }

  switch (type) {
    case "vaultlight.storeEncryptedVault": {
      (async () => {
        const { encrypted, meta } = message as {
          encrypted: EncryptedVault | null;
          meta: VaultMeta | null;
        };
        encryptedVault = encrypted;
        vaultMeta = meta;
        masterSecret = null;
        await chrome.storage.local.set({
          [STORAGE_KEY]: encryptedVault,
          [META_KEY]: vaultMeta,
        });
        lockVault();
        await updateSecurityState(deriveSuccess());
        sendResponse({ success: true });
      })().catch((error) => {
        console.error("Vaultlight: failed to store encrypted vault", error);
        sendResponse({ success: false, error: "Failed to store encrypted vault." });
      });
      return true;
    }
    case "vaultlight.getStatus": {
      (async () => {
        await ensureEncryptedVaultLoaded();
        sendResponse({
          success: true,
          hasEncrypted: Boolean(encryptedVault),
          unlocked: Boolean(decryptedVault),
          meta: vaultMeta,
          security: securityState,
        });
      })().catch((error) => {
        console.error("Vaultlight: status error", error);
        sendResponse({ success: false, error: "Could not determine status." });
      });
      return true;
    }
    case "vaultlight.unlock": {
      (async () => {
        await ensureEncryptedVaultLoaded();
        if (!encryptedVault) {
          sendResponse({ success: false, error: "No vault synced." });
          return;
        }
        const now = Date.now();
        if (securityState.requiresReset) {
          sendResponse({
            success: false,
            error: "Security shield active. Sync or reset the vault.",
            security: securityState,
          });
          return;
        }
        if (securityState.lockUntil > now) {
          sendResponse({
            success: false,
            error: `Vault temporarily locked (${formatLockCountdown(securityState.lockUntil)}).`,
            security: securityState,
          });
          return;
        }
        try {
          const payload = await decryptVault(message.masterPassword, encryptedVault);
          decryptedVault = {
            ...payload,
            entries: hydrateExposures(payload.entries),
          };
          masterSecret = message.masterPassword;
          scheduleLock();
          await updateSecurityState(deriveSuccess());
          sendResponse({
            success: true,
            entryCount: decryptedVault.entries.length,
            security: securityState,
          });
        } catch (error) {
          console.error("Vaultlight: unlock failed", error);
          decryptedVault = null;
          masterSecret = null;
          const updated = deriveFailure(securityState, Date.now());
          await updateSecurityState(updated);
          if (updated.requiresReset) {
            encryptedVault = null;
            vaultMeta = null;
            await chrome.storage.local.remove([STORAGE_KEY]);
          }
          const errorMessage = updated.requiresReset
            ? "Security shield active. Vault locked and local copy removed."
            : updated.lockUntil > Date.now()
            ? `Master password invalid. Vault locked for ${formatLockCountdown(updated.lockUntil)}.`
            : "Master password invalid.";
          sendResponse({ success: false, error: errorMessage, security: updated });
        }
      })();
      return true;
    }
    case "vaultlight.lock": {
      lockVault("Locked manually.");
      sendResponse({ success: true });
      return false;
    }
    case "vaultlight.getEntries": {
      if (!decryptedVault) {
        sendResponse({ success: false, error: "Vault is locked.", security: securityState });
        return false;
      }
      sendResponse({ success: true, entries: getEntryPreviews(), security: securityState });
      scheduleLock();
      return false;
    }
    case "vaultlight.fillEntry": {
      (async () => {
        if (!decryptedVault) {
          sendResponse({ success: false, error: "Vault is locked.", security: securityState });
          return;
        }
        const { entryId, tabId } = message as { entryId: string; tabId?: number };
        const entry = decryptedVault.entries.find((item) => item.id === entryId);
        if (!entry) {
          sendResponse({ success: false, error: "Entry not found.", security: securityState });
          return;
        }
        try {
          const targetTab = tabId
            ? await chrome.tabs.get(tabId)
            : (await chrome.tabs.query({ active: true, currentWindow: true })).at(0);
          const targetTabId = targetTab?.id;
          if (!targetTabId) {
            sendResponse({ success: false, error: "No active tab available." });
            return;
          }
          const host = getTabHost(targetTab);
          if (!ensureHostMatches(entry, host)) {
            sendResponse({
              success: false,
              error: "Domain mismatch. Autofill blocked for safety.",
              security: securityState,
            });
            return;
          }
          if (!entry.domain && host) {
            entry.domain = host;
            if (decryptedVault) {
              await persistDecryptedVault();
            }
          }
          await chrome.tabs.sendMessage(targetTabId, {
            type: "vaultlight.autofill",
            payload: {
              username: entry.username,
              password: entry.password,
              label: entry.label,
            },
          });
          scheduleLock();
          sendResponse({ success: true, security: securityState });
        } catch (error) {
          console.error("Vaultlight: autofill failed", error);
          sendResponse({
            success: false,
            error: "Autofill not possible (tab protected?).",
            security: securityState,
          });
        }
      })();
      return true;
    }
    case "vaultlight.generateRegistration": {
      (async () => {
        if (!decryptedVault || !masterSecret) {
          sendResponse({ success: false, error: "Unlock the vault before generating credentials." });
          return;
        }
        try {
          const targetTab = (await chrome.tabs.query({ active: true, currentWindow: true })).at(0);
          const targetTabId = targetTab?.id;
          if (!targetTabId) {
            sendResponse({ success: false, error: "No active tab available." });
            return;
          }
          const host = getTabHost(targetTab);
          if (!host) {
            sendResponse({ success: false, error: "Unable to determine site domain." });
            return;
          }
          const password = generateStrongPassword({
            length: 20,
            useUppercase: true,
            useLowercase: true,
            useDigits: true,
            useSymbols: true,
            avoidAmbiguous: true,
          });
          const randomBuffer = new Uint32Array(2);
          globalThis.crypto?.getRandomValues(randomBuffer);
          const suffix = Array.from(randomBuffer, (value) => value.toString(36)).join("").slice(0, 10) || Date.now().toString(36);
          const sanitizedHost = host.replace(/[^a-z0-9]/gi, "");
          const username = `vault_${sanitizedHost.slice(0, 10)}_${suffix}`;
          const email = `${username}@vaultlight.app`;

          const result = (await chrome.tabs.sendMessage(targetTabId, {
            type: "vaultlight.registrationFill",
            payload: {
              username,
              email,
              password,
              domain: host,
            },
          })) as { success: boolean; data?: { username?: string; email?: string; password: string } } | undefined;

          if (!result?.success || !result.data) {
            sendResponse({
              success: false,
              error: "Could not prepare registration form.",
            });
            return;
          }

          const finalUsername = result.data.username ?? result.data.email ?? username;
          const finalPassword = result.data.password;
          const finalEmail = result.data.email ?? email;
          const entryLabel = `${host} account`;

          const entry = createVaultEntry({
            label: entryLabel,
            username: finalUsername,
            password: finalPassword,
            notes: `Email: ${finalEmail}`,
            url: targetTab.url ?? host,
            domain: host,
          });

          decryptedVault = {
            ...decryptedVault,
            entries: [entry, ...decryptedVault.entries],
          };

          await persistDecryptedVault();
          scheduleLock();
          sendResponse({ success: true, entryId: entry.id });
        } catch (error) {
          console.error("Vaultlight: registration generation failed", error);
          sendResponse({
            success: false,
            error: "Registration helper failed.",
          });
        }
      })();
      return true;
    }
    case "vaultlight.clear": {
      encryptedVault = null;
      vaultMeta = null;
      decryptedVault = null;
      if (lockTimer) {
        clearTimeout(lockTimer);
        lockTimer = undefined;
      }
      void chrome.storage.local.remove([STORAGE_KEY, META_KEY]);
      void resetStoredSecurityState().then((state) => {
        securityState = state;
      });
      sendResponse({ success: true });
      return false;
    }
    default:
      break;
  }
  return undefined;
});
