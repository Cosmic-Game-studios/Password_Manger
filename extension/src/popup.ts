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
  return new Date(timestamp).toLocaleString("de-DE", {
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
      return "Keine Leaks";
    case "warning":
      return "Warnung";
    case "breached":
      return "Breach";
    default:
      return "Ungeprüft";
  }
}

function renderEntries(entries: EntryPreview[]) {
  unlockedEntries = entries;
  entriesContainer.innerHTML = "";
  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Keine Einträge vorhanden. Synchronisiere erneut oder erstelle Einträge im Vault.";
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
    meta.className = "entry-username";
    meta.textContent = `Aktualisiert: ${formatTimestamp(entry.updatedAt)}`;

    const action = document.createElement("button");
    action.className = "primary";
    action.textContent = "Autofill";
    action.addEventListener("click", () => void handleFill(entry.id));

    card.appendChild(header);
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
      "Sicherheitsmodus aktiv – Tresor blockiert. Bitte Tresor neu synchronisieren oder zurücksetzen.";
    return;
  }

  if (security.lockUntil > Date.now()) {
    securityHint.classList.add("warning");
    securityHint.textContent = `Schutz aktiv: Wiederholung in ${formatCountdown(
      security.lockUntil - Date.now(),
    )} möglich.`;
    return;
  }

  if (security.shieldLevel > 0 || security.totalFailures > 0) {
    securityHint.classList.add("warning");
    securityHint.textContent = "Schutz aktiv: Fehlversuche wurden protokolliert.";
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
    statusText.textContent = response?.error ?? "Status unbekannt.";
    showSection(syncSection, true);
    showSection(unlockSection, false);
    showSection(entriesSection, false);
    updateSecurityDetails(response?.security);
    return;
  }

  statusText.textContent = response.unlocked
    ? "Tresor entsperrt. Wähle einen Eintrag zum Ausfüllen."
    : response.hasEncrypted
    ? "Tresor synchronisiert. Bitte Master-Passwort eingeben."
    : "Noch kein Tresor synchronisiert.";

  showSection(syncSection, !response.hasEncrypted);
  showSection(unlockSection, response.hasEncrypted && !response.unlocked);
  showSection(entriesSection, response.unlocked);
  updateSecurityDetails(response.security);

  if (response.unlocked) {
    await loadEntries();
  }
}

async function handleSync() {
  setMessage("Synchronisiere…");
  const tab = await queryActiveTab();
  if (!tab?.id) {
    setMessage("Kein aktiver Tab gefunden.", "error");
    return;
  }
  try {
    const dump = (await chrome.tabs.sendMessage(tab.id, {
      type: "vaultlight.dumpVault",
    })) as SyncResponse;
    if (!dump?.success || !dump.encrypted) {
      setMessage(dump?.error ?? "Kein Tresor gefunden. Tresor im aktiven Tab öffnen.", "error");
      return;
    }
    await chrome.runtime.sendMessage({
      type: "vaultlight.storeEncryptedVault",
      encrypted: dump.encrypted,
      meta: dump.meta ?? null,
    });
    setMessage("Synchronisation abgeschlossen.", "success");
    await refreshStatus();
  } catch (error) {
    console.error("Vaultlight Popup: Sync Fehler", error);
    setMessage("Synchronisation nicht möglich (Content Script aktiv?).", "error");
  }
}

async function handleUnlock(event: SubmitEvent) {
  event.preventDefault();
  const password = unlockPassword.value.trim();
  if (!password) {
    setMessage("Bitte Master-Passwort eingeben.", "error");
    return;
  }
  setMessage("Entsperre Tresor…");
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "vaultlight.unlock",
      masterPassword: password,
    })) as UnlockResponse;
    if (!response?.success) {
      setMessage(response?.error ?? "Master-Passwort falsch.", "error");
      updateSecurityDetails(response?.security);
      return;
    }
    unlockPassword.value = "";
    setMessage(`Tresor entsperrt (${response.entryCount ?? 0} Einträge).`, "success");
    updateSecurityDetails(response.security);
    await refreshStatus();
  } catch (error) {
    console.error("Vaultlight Popup: Unlock Fehler", error);
    setMessage("Entsperren fehlgeschlagen.", "error");
  }
}

async function loadEntries() {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "vaultlight.getEntries",
    })) as EntriesResponse;
    if (!response?.success || !response.entries) {
      setMessage(response?.error ?? "Keine Einträge verfügbar.");
      renderEntries([]);
      updateSecurityDetails(response?.security);
      return;
    }
    renderEntries(response.entries);
    setMessage("Bereit.", "success");
  } catch (error) {
    console.error("Vaultlight Popup: Laden der Einträge fehlgeschlagen", error);
    setMessage("Einträge konnten nicht geladen werden.", "error");
  }
}

async function handleFill(entryId: string) {
  setMessage("Autofill wird vorbereitet…");
  const tab = await queryActiveTab();
  if (!tab?.id) {
    setMessage("Kein aktiver Tab gefunden.", "error");
    return;
  }
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "vaultlight.fillEntry",
      entryId,
      tabId: tab.id,
    })) as FillResponse;
    if (!response?.success) {
      setMessage(response?.error ?? "Autofill fehlgeschlagen.", "error");
      updateSecurityDetails(response?.security);
      return;
    }
    setMessage("Zugang ausgefüllt.", "success");
    updateSecurityDetails(response?.security);
  } catch (error) {
    console.error("Vaultlight Popup: Autofill Fehler", error);
    setMessage("Autofill nicht möglich.", "error");
  }
}

async function handleLock() {
  await chrome.runtime.sendMessage({ type: "vaultlight.lock" });
  unlockedEntries = [];
  renderEntries([]);
  setMessage("Tresor gesperrt.");
  await refreshStatus();
}

syncButton.addEventListener("click", () => void handleSync());
unlockForm.addEventListener("submit", (event) => void handleUnlock(event));
lockButton.addEventListener("click", () => void handleLock());

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "vaultlight.lock-notice") {
    setMessage(message.reason ?? "Tresor gesperrt.");
    void refreshStatus();
    return false;
  }
  return undefined;
});

void refreshStatus();
