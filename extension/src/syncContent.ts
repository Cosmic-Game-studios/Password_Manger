const VAULT_STORAGE_KEY = "vaultlight.encrypted-vault";
const META_STORAGE_KEY = "vaultlight.meta";

interface SyncResponse {
  encrypted: unknown;
  meta: unknown;
}

function readVaultFromLocalStorage(): SyncResponse | null {
  try {
    const encryptedRaw = window.localStorage.getItem(VAULT_STORAGE_KEY);
    if (!encryptedRaw) {
      return null;
    }
    const metaRaw = window.localStorage.getItem(META_STORAGE_KEY);
    return {
      encrypted: JSON.parse(encryptedRaw),
      meta: metaRaw ? JSON.parse(metaRaw) : null,
    };
  } catch (error) {
    console.error("Vaultlight extension: unable to read vault", error);
    return null;
  }
}

function pushVaultToBackground() {
  const payload = readVaultFromLocalStorage();
  if (!payload) {
    return;
  }
  chrome.runtime.sendMessage({
    type: "vaultlight.storeEncryptedVault",
    encrypted: payload.encrypted,
    meta: payload.meta,
  }).catch(() => {
    // Background may not be reachable (e.g., extension disabled)
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "vaultlight.dumpVault") {
    const payload = readVaultFromLocalStorage();
    if (!payload) {
      sendResponse({ success: false, error: "No vault found." });
      return false;
    }
    sendResponse({ success: true, encrypted: payload.encrypted, meta: payload.meta });
    return false;
  }
  return undefined;
});

// Auto-sync on load when the vault is open in this tab.
pushVaultToBackground();
