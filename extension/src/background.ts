import {
  decryptVault,
  hydrateExposures,
} from "./shared/crypto";
import type {
  EncryptedVault,
  VaultPayload,
  VaultMeta,
  EntryPreview,
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

let encryptedVault: EncryptedVault | null = null;
let vaultMeta: VaultMeta | null = null;
let decryptedVault: VaultPayload | null = null;
let lockTimer: number | undefined;
let securityState: SecurityState = { ...DEFAULT_SECURITY_STATE };

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
    lockVault("Automatische Sperre nach Inaktivität.");
  }, AUTO_LOCK_MS) as unknown as number;
}

function lockVault(reason?: string) {
  decryptedVault = null;
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
  void loadFromStorage();
});

chrome.runtime.onStartup.addListener(() => {
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
    }));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type } = message ?? {};

  switch (type) {
    case "vaultlight.storeEncryptedVault": {
      (async () => {
        const { encrypted, meta } = message as {
          encrypted: EncryptedVault | null;
          meta: VaultMeta | null;
        };
        encryptedVault = encrypted;
        vaultMeta = meta;
        await chrome.storage.local.set({
          [STORAGE_KEY]: encryptedVault,
          [META_KEY]: vaultMeta,
        });
        lockVault();
        await updateSecurityState(deriveSuccess());
        sendResponse({ success: true });
      })().catch((error) => {
        console.error("Vaultlight: Speicherung fehlgeschlagen", error);
        sendResponse({ success: false, error: "Speicherung fehlgeschlagen." });
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
        console.error("Vaultlight: Status Fehler", error);
        sendResponse({ success: false, error: "Status konnte nicht ermittelt werden." });
      });
      return true;
    }
    case "vaultlight.unlock": {
      (async () => {
        await ensureEncryptedVaultLoaded();
        if (!encryptedVault) {
          sendResponse({ success: false, error: "Kein Tresor synchronisiert." });
          return;
        }
        const now = Date.now();
        if (securityState.requiresReset) {
          sendResponse({
            success: false,
            error: "Sicherheitsmodus aktiv. Synchronisiere oder setze den Tresor zurück.",
            security: securityState,
          });
          return;
        }
        if (securityState.lockUntil > now) {
          sendResponse({
            success: false,
            error: `Tresor vorübergehend gesperrt (${formatLockCountdown(securityState.lockUntil)}).`,
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
          scheduleLock();
          await updateSecurityState(deriveSuccess());
          sendResponse({
            success: true,
            entryCount: decryptedVault.entries.length,
            security: securityState,
          });
        } catch (error) {
          console.error("Vaultlight: Entsperren fehlgeschlagen", error);
          decryptedVault = null;
          const updated = deriveFailure(securityState, Date.now());
          await updateSecurityState(updated);
          if (updated.requiresReset) {
            encryptedVault = null;
            vaultMeta = null;
            await chrome.storage.local.remove([STORAGE_KEY]);
          }
          const errorMessage = updated.requiresReset
            ? "Sicherheitsmodus aktiv. Tresor wurde gesperrt und lokale Kopie entfernt."
            : updated.lockUntil > Date.now()
            ? `Master-Passwort ungültig. Tresor gesperrt für ${formatLockCountdown(updated.lockUntil)}.`
            : "Master-Passwort ungültig.";
          sendResponse({ success: false, error: errorMessage, security: updated });
        }
      })();
      return true;
    }
    case "vaultlight.lock": {
      lockVault("Manuell gesperrt.");
      sendResponse({ success: true });
      return false;
    }
    case "vaultlight.getEntries": {
      if (!decryptedVault) {
        sendResponse({ success: false, error: "Tresor ist gesperrt.", security: securityState });
        return false;
      }
      sendResponse({ success: true, entries: getEntryPreviews(), security: securityState });
      scheduleLock();
      return false;
    }
    case "vaultlight.fillEntry": {
      (async () => {
        if (!decryptedVault) {
          sendResponse({ success: false, error: "Tresor ist gesperrt.", security: securityState });
          return;
        }
        const { entryId, tabId } = message as { entryId: string; tabId?: number };
        const entry = decryptedVault.entries.find((item) => item.id === entryId);
        if (!entry) {
          sendResponse({ success: false, error: "Eintrag nicht gefunden.", security: securityState });
          return;
        }
        try {
          const targetTabId =
            tabId ??
            (await chrome.tabs
              .query({ active: true, currentWindow: true })
              .then((tabs) => tabs[0]?.id));
          if (!targetTabId) {
            sendResponse({ success: false, error: "Kein aktiver Tab verfügbar." });
            return;
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
          console.error("Vaultlight: Autofill fehlgeschlagen", error);
          sendResponse({
            success: false,
            error: "Autofill nicht möglich (Tab geschützt?).",
            security: securityState,
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
