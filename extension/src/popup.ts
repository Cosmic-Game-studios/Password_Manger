import type { EntryPreview, VaultMeta } from "./shared/types";
import type { SecurityState } from "./shared/security";

type StatusResponse = {
  success: boolean;
  hasEncrypted: boolean;
  unlocked: boolean;
  meta: VaultMeta | null;
  error?: string;
  security?: SecurityState;
};

type UnlockResponse = {
  success: boolean;
  entryCount?: number;
  error?: string;
  security?: SecurityState;
};

type EntriesResponse = {
  success: boolean;
  entries?: EntryPreview[];
  error?: string;
  security?: SecurityState;
};

type FillResponse = {
  success: boolean;
  error?: string;
  security?: SecurityState;
};

type SyncResponse = {
  success: boolean;
  encrypted?: unknown;
  meta?: unknown;
  error?: string;
};

type RegistrationResponse = {
  success: boolean;
  error?: string;
  entryId?: string;
};

const statusSection = document.getElementById("status-section") as HTMLDivElement;
const statusText = document.getElementById("status-text") as HTMLParagraphElement;
const syncSection = document.getElementById("sync-section") as HTMLDivElement;
const syncButton = document.getElementById("sync-button") as HTMLButtonElement;
const unlockSection = document.getElementById("unlock-section") as HTMLDivElement;
const unlockForm = document.getElementById("unlock-form") as HTMLFormElement;
const unlockPassword = document.getElementById("unlock-password") as HTMLInputElement;
const entriesSection = document.getElementById("entries-section") as HTMLDivElement;
const entriesContainer = document.getElementById("entries") as HTMLDivElement;
const lockButton = document.getElementById("lock-button") as HTMLButtonElement;
const registrationButton = document.getElementById("registration-button") as HTMLButtonElement | null;
const messageBox = document.getElementById("message") as HTMLParagraphElement;
const securityHint = document.getElementById("security-state") as HTMLParagraphElement | null;

let unlockedEntries: EntryPreview[] = [];

function setMessage(text: string, kind: "info" | "success" | "error" = "info") {
  messageBox.textContent = text;
  messageBox.classList.remove("success", "error");
  if (kind !== "info") {
    messageBox.classList.add(kind);
  }
}

function showSection(section: HTMLElement, visible: boolean) {
  if (visible) {
    section.classList.remove("hidden");
  } else {
    section.classList.add("hidden");
  }
}

async function queryActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return "—";
  const locale =
    typeof navigator !== "undefined" && navigator.language
      ? navigator.language
      : "en-US";
  return new Date(timestamp).toLocaleString(locale, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
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

function exposureClass(status?: string): string {
  switch (status) {
    case "safe":
      return "badge safe";
    case "warning":
      return "badge warning";
    case "breached":
      return "badge breached";
    default:
      return "badge pending";
  }
}

function exposureLabel(status?: string): string {
  switch (status) {
    case "safe":
      return "No leaks";
    case "warning":
      return "Warning";
    case "breached":
      return "Breach";
    default:
      return "Unchecked";
  }
}

function renderEntries(entries: EntryPreview[]) {
  unlockedEntries = entries;
  entriesContainer.innerHTML = "";
  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No entries found. Sync again or add new entries in the vault.";
    entriesContainer.appendChild(empty);
    return;
  }

  entries.forEach((entry) => {
    const card = document.createElement("div");
    card.className = "entry";

    const header = document.createElement("div");
    header.className = "entry-header";

    const label = document.createElement("div");
    label.className = "entry-label";
    label.textContent = entry.label;

    const badge = document.createElement("span");
    badge.className = exposureClass(entry.exposure?.status);
    badge.textContent = exposureLabel(entry.exposure?.status);

    header.appendChild(label);
    header.appendChild(badge);

    const username = document.createElement("div");
    username.className = "entry-username";
    username.textContent = entry.username || "—";

    const meta = document.createElement("div");
    meta.className = "entry-meta";
    meta.textContent = `Updated: ${formatTimestamp(entry.updatedAt)}`;

    const action = document.createElement("button");
    action.className = "primary";
    action.textContent = "Autofill";
    action.addEventListener("click", () => void handleFill(entry.id));

    card.appendChild(header);
    if (entry.domain || entry.url) {
      const domain = document.createElement("div");
      domain.className = "entry-domain";
      domain.textContent = entry.domain ?? entry.url ?? "";
      card.appendChild(domain);
    }
    card.appendChild(username);
    card.appendChild(meta);
    card.appendChild(action);

    entriesContainer.appendChild(card);
  });
}

function updateSecurityDetails(security?: SecurityState) {
  if (!securityHint) {
    return;
  }
  if (!security) {
    securityHint.textContent = "";
    securityHint.style.display = "none";
    securityHint.classList.remove("warning", "danger");
    return;
  }

  securityHint.style.display = "block";
  securityHint.classList.remove("warning", "danger");

  if (security.requiresReset) {
    securityHint.classList.add("danger");
    securityHint.textContent =
      "Security shield active—vault blocked. Resync or reset the vault.";
    return;
  }

  if (security.lockUntil > Date.now()) {
    securityHint.classList.add("warning");
    securityHint.textContent = `Protection active: retry in ${formatCountdown(
      security.lockUntil - Date.now(),
    )}.`;
    return;
  }

  if (security.shieldLevel > 0 || security.totalFailures > 0) {
    securityHint.classList.add("warning");
    securityHint.textContent = "Protection active: failed attempts recorded.";
    return;
  }

  securityHint.textContent = "";
  securityHint.style.display = "none";
}

async function refreshStatus() {
  const response = (await chrome.runtime.sendMessage({
    type: "vaultlight.getStatus",
  })) as StatusResponse;

  if (!response?.success) {
    statusText.textContent = response?.error ?? "Status unknown.";
    statusText.classList.add("error");
    messageBox.textContent = response?.error ?? "Extension disabled.";
    messageBox.classList.add("error");
    showSection(syncSection, true);
    showSection(unlockSection, false);
    showSection(entriesSection, false);
    updateSecurityDetails(response?.security);
    return;
  }

  statusText.textContent = response.unlocked
    ? "Vault unlocked. Choose an entry to autofill."
    : response.hasEncrypted
    ? "Vault synced. Enter the master password."
    : "No vault synced yet.";

  showSection(syncSection, !response.hasEncrypted);
  showSection(unlockSection, response.hasEncrypted && !response.unlocked);
  showSection(entriesSection, response.unlocked);
  updateSecurityDetails(response.security);

  if (registrationButton) {
    registrationButton.classList.toggle("hidden", !response.unlocked);
    registrationButton.disabled = !response.unlocked;
  }

  if (response.unlocked) {
    await loadEntries();
  }
}

async function handleSync() {
  setMessage("Syncing...");
  const tab = await queryActiveTab();
  if (!tab?.id) {
    setMessage("No active tab found.", "error");
    return;
  }
  try {
    const dump = (await chrome.tabs.sendMessage(tab.id, {
      type: "vaultlight.dumpVault",
    })) as SyncResponse;
    if (!dump?.success || !dump.encrypted) {
      setMessage(dump?.error ?? "No vault found. Open the vault in the active tab.", "error");
      return;
    }
    await chrome.runtime.sendMessage({
      type: "vaultlight.storeEncryptedVault",
      encrypted: dump.encrypted,
      meta: dump.meta ?? null,
    });
    setMessage("Sync complete.", "success");
    await refreshStatus();
  } catch (error) {
    console.error("Vaultlight popup: sync error", error);
    setMessage("Sync not possible (content script active?).", "error");
  }
}

async function handleUnlock(event: SubmitEvent) {
  event.preventDefault();
  const password = unlockPassword.value.trim();
  if (!password) {
    setMessage("Please enter the master password.", "error");
    return;
  }
  setMessage("Unlocking vault...");
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "vaultlight.unlock",
      masterPassword: password,
    })) as UnlockResponse;
    if (!response?.success) {
      setMessage(response?.error ?? "Master password incorrect.", "error");
      updateSecurityDetails(response?.security);
      return;
    }
    unlockPassword.value = "";
    setMessage(`Vault unlocked (${response.entryCount ?? 0} entries).`, "success");
    updateSecurityDetails(response.security);
    await refreshStatus();
  } catch (error) {
    console.error("Vaultlight popup: unlock error", error);
    setMessage("Unlock failed.", "error");
  }
}

async function loadEntries() {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "vaultlight.getEntries",
    })) as EntriesResponse;
    if (!response?.success || !response.entries) {
      setMessage(response?.error ?? "No entries available.");
      renderEntries([]);
      updateSecurityDetails(response?.security);
      return;
    }
    renderEntries(response.entries);
    setMessage("Ready.", "success");
  } catch (error) {
    console.error("Vaultlight popup: failed to load entries", error);
    setMessage("Entries could not be loaded.", "error");
  }
}


async function handleGenerateRegistration() {
  setMessage("Preparing secure registration...");
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "vaultlight.generateRegistration",
    })) as RegistrationResponse;
    if (!response?.success) {
      setMessage(response?.error ?? "Registration helper failed.", "error");
      return;
    }
    setMessage("Registration data generated and saved.", "success");
    await refreshStatus();
  } catch (error) {
    console.error("Vaultlight popup: registration error", error);
    setMessage("Registration helper failed.", "error");
  }
}

async function handleFill(entryId: string) {
  setMessage("Preparing autofill...");
  const tab = await queryActiveTab();
  if (!tab?.id) {
    setMessage("No active tab found.", "error");
    return;
  }
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "vaultlight.fillEntry",
      entryId,
      tabId: tab.id,
    })) as FillResponse;
    if (!response?.success) {
      setMessage(response?.error ?? "Autofill failed.", "error");
      updateSecurityDetails(response?.security);
      return;
    }
    setMessage("Credential filled.", "success");
    updateSecurityDetails(response?.security);
  } catch (error) {
    console.error("Vaultlight popup: autofill error", error);
    setMessage("Autofill not possible.", "error");
  }
}

async function handleLock() {
  await chrome.runtime.sendMessage({ type: "vaultlight.lock" });
  unlockedEntries = [];
  renderEntries([]);
  setMessage("Vault locked.");
  await refreshStatus();
}

syncButton.addEventListener("click", () => void handleSync());
unlockForm.addEventListener("submit", (event) => void handleUnlock(event));
registrationButton?.addEventListener("click", () => void handleGenerateRegistration());
lockButton.addEventListener("click", () => void handleLock());

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "vaultlight.lock-notice") {
    setMessage(message.reason ?? "Vault locked.");
    void refreshStatus();
    return false;
  }
  return undefined;
});

void refreshStatus();
