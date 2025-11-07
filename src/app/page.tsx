"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  VaultEntry,
  VaultPayload,
  PasswordExposure,
} from "../core/crypto/cryptoClient";
import {
  initializeVaultEntry,
  persistVault,
  resetVault,
  unlockVault,
  vaultExists,
} from "../core/storage/vaultManager";
import { loadVaultMeta, type VaultMeta } from "../core/storage/vaultStorage";
import {
  assessStrength,
  generatePassword,
  type PasswordOptions,
  type StrengthAssessment,
} from "../core/password/generator";
import { checkPasswordAgainstLeaks } from "../core/leaks/leakChecker";
import { normalizeHost, extractDisplayUrl } from "../core/utils/url";
import {
  getSecurityState,
  recordUnlockFailure,
  recordUnlockSuccess,
  resetSecurityState,
  type SecurityState,
} from "../core/security/securityShield";
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  loadSettings,
  type UserSettings,
} from "../core/settings/userSettings";

const defaultPasswordOptions: PasswordOptions = {
  length: DEFAULT_SETTINGS.generatorLength,
  useUppercase: DEFAULT_SETTINGS.generatorUppercase,
  useLowercase: DEFAULT_SETTINGS.generatorLowercase,
  useDigits: DEFAULT_SETTINGS.generatorDigits,
  useSymbols: DEFAULT_SETTINGS.generatorSymbols,
  avoidAmbiguous: DEFAULT_SETTINGS.generatorAvoidAmbiguous,
};

const initialDraft = {
  label: "",
  username: "",
  password: "",
  notes: "",
  url: "",
};

type Stage = "checking" | "creating" | "locked" | "unlocking" | "unlocked";

type ToastKind = "info" | "success" | "error";

interface ToastMessage {
  id: number;
  text: string;
  kind: ToastKind;
}

function classNames(
  ...classes: Array<string | false | undefined | null>
): string {
  return classes.filter(Boolean).join(" ");
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

function exposureStatusLabel(status: PasswordExposure["status"]): string {
  switch (status) {
    case "safe":
      return "No leaks detected";
    case "warning":
      return "Warning";
    case "breached":
      return "Breach detected";
    default:
      return "Check pending";
  }
}

function strengthLabel(assessment: StrengthAssessment | null): string {
  if (!assessment) return "—";
  switch (assessment.level) {
    case "very-strong":
      return "Very strong";
    case "strong":
      return "Strong";
    case "medium":
      return "Medium";
    default:
      return "Weak";
  }
}

export default function HomePage() {
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [stage, setStage] = useState<Stage>("checking");
  const [hasExistingVault, setHasExistingVault] = useState(false);
  const [meta, setMeta] = useState<VaultMeta | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [masterInput, setMasterInput] = useState("");
  const [masterConfirm, setMasterConfirm] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [vault, setVault] = useState<VaultPayload | null>(null);
  const [draft, setDraft] = useState(initialDraft);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [masterChange, setMasterChange] = useState({ next: "", confirm: "" });
  const [masterChangeError, setMasterChangeError] = useState<string | null>(null);
  const [securityState, setSecurityState] = useState<SecurityState>(() => getSecurityState());
  const [passwordOptions, setPasswordOptions] = useState<PasswordOptions>(
    defaultPasswordOptions,
  );
  const [checkingEntries, setCheckingEntries] = useState<string[]>([]);
  const [revealedEntries, setRevealedEntries] = useState<string[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    label?: string;
    url?: string;
    password?: string;
    username?: string;
  }>({});
  const [isSavingEntry, setIsSavingEntry] = useState(false);

  const masterSecretRef = useRef<string>("");
  const vaultRef = useRef<VaultPayload | null>(null);
  const toastId = useRef(0);
  const lastInteractionRef = useRef(Date.now());
  const generatorCustomizedRef = useRef(false);
  const clipboardClearTimeout = useRef<number | null>(null);

  const autoLockMinutes = userSettings.autoLockMinutes;
  const autoLockMs = autoLockMinutes * 60 * 1000;

  useEffect(() => {
    return () => {
      masterSecretRef.current = "";
      vaultRef.current = null;
      if (clipboardClearTimeout.current) {
        window.clearTimeout(clipboardClearTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = loadSettings();
    setUserSettings(stored);
    setSettingsLoaded(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SETTINGS_STORAGE_KEY) {
        const next = loadSettings();
        setUserSettings(next);
        generatorCustomizedRef.current = false;
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }
    if (generatorCustomizedRef.current) {
      return;
    }
    setPasswordOptions({
      length: userSettings.generatorLength,
      useUppercase: userSettings.generatorUppercase,
      useLowercase: userSettings.generatorLowercase,
      useDigits: userSettings.generatorDigits,
      useSymbols: userSettings.generatorSymbols,
      avoidAmbiguous: userSettings.generatorAvoidAmbiguous,
    });
  }, [settingsLoaded, userSettings]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const exists = vaultExists();
    setHasExistingVault(exists);
    setMeta(loadVaultMeta());
    setStage(exists ? "locked" : "creating");
  }, []);

  useEffect(() => {
    if (stage === "unlocked") {
      lastInteractionRef.current = Date.now();
    }
  }, [stage]);

  useEffect(() => {
    if (stage !== "unlocked") {
      setDraft(initialDraft);
      setEditingEntryId(null);
      setDraftError(null);
      setFieldErrors({});
      setMasterChange({ next: "", confirm: "" });
      setMasterChangeError(null);
      generatorCustomizedRef.current = false;
      setPasswordOptions({
        length: userSettings.generatorLength,
        useUppercase: userSettings.generatorUppercase,
        useLowercase: userSettings.generatorLowercase,
        useDigits: userSettings.generatorDigits,
        useSymbols: userSettings.generatorSymbols,
        avoidAmbiguous: userSettings.generatorAvoidAmbiguous,
      });
    }
  }, [stage, userSettings]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setSecurityState(getSecurityState());
  }, [stage]);

  const sortedEntries = useMemo(() => {
    if (!vault) return [];
    let filtered = [...vault.entries];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((entry) => {
        return (
          entry.label.toLowerCase().includes(query) ||
          entry.username.toLowerCase().includes(query) ||
          entry.domain?.toLowerCase().includes(query) ||
          entry.url?.toLowerCase().includes(query) ||
          entry.notes?.toLowerCase().includes(query)
        );
      });
    }

    return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [vault, searchQuery]);

  const strength = useMemo(() => {
    if (!draft.password) return null;
    return assessStrength(draft.password);
  }, [draft.password]);

  const masterPasswordStrength = useMemo(() => {
    if (stage === "creating" && masterInput) {
      return assessStrength(masterInput);
    }
    if (stage === "unlocked" && masterChange.next) {
      return assessStrength(masterChange.next);
    }
    return null;
  }, [stage, masterInput, masterChange.next]);

  const isChecking = useCallback(
    (id: string) => checkingEntries.includes(id),
    [checkingEntries],
  );

  const addToast = useCallback((text: string, kind: ToastKind) => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((prev) => [...prev, { id, text, kind }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3600);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const refreshSecurityState = useCallback(() => {
    setSecurityState(getSecurityState());
  }, []);

  const registerInteraction = useCallback(() => {
    lastInteractionRef.current = Date.now();
  }, []);

  const lockVault = useCallback(
    (message?: string) => {
      masterSecretRef.current = "";
      vaultRef.current = null;
      setVault(null);
      const exists =
        typeof window !== "undefined" ? vaultExists() : hasExistingVault;
      setHasExistingVault(exists);
      const metaSnapshot =
        typeof window !== "undefined" ? loadVaultMeta() : null;
      setMeta(metaSnapshot);
      setStage(exists ? "locked" : "creating");
      addToast(message ?? "Vault locked.", "info");
      refreshSecurityState();
    },
    [addToast, hasExistingVault, refreshSecurityState],
  );

  useEffect(() => {
    if (stage !== "unlocked") {
      return;
    }

    registerInteraction();

    const handleActivity = () => {
      registerInteraction();
    };

    const handleVisibility = () => {
      if (document.hidden) {
        lockVault("Vault locked automatically (tab hidden).");
      } else {
        registerInteraction();
      }
    };

    const events: Array<keyof DocumentEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "wheel",
    ];

    const eventOptions: AddEventListenerOptions = { passive: true };

    events.forEach((event) =>
      document.addEventListener(event, handleActivity, eventOptions),
    );

    document.addEventListener("visibilitychange", handleVisibility);

    const interval = window.setInterval(() => {
      const elapsed = Date.now() - lastInteractionRef.current;
      if (elapsed >= autoLockMs) {
        lockVault("Vault locked automatically after inactivity.");
      }
    }, 10_000);

    const handleBeforeUnload = () => {
      masterSecretRef.current = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      events.forEach((event) =>
        document.removeEventListener(event, handleActivity, eventOptions),
      );
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.clearInterval(interval);
    };
  }, [autoLockMs, lockVault, registerInteraction, stage]);

  const applyVaultUpdate = useCallback(
    async (transform: (current: VaultPayload) => VaultPayload) => {
      if (!vaultRef.current) {
        throw new Error("No vault loaded.");
      }
      if (!masterSecretRef.current) {
        throw new Error("Master password not available.");
      }
      const next = transform(vaultRef.current);
      vaultRef.current = next;
      setVault(next);
      await persistVault(masterSecretRef.current, next);
      setMeta(loadVaultMeta());
      registerInteraction();
    },
    [registerInteraction],
  );

  const handleUnlock = useCallback(async () => {
    if (!masterInput) {
      setUnlockError("Please enter the master password.");
      return;
    }
    if (stage === "creating" && masterInput !== masterConfirm) {
      setUnlockError("Passwords do not match.");
      return;
    }

    const currentSecurity = getSecurityState();
    const now = Date.now();
    if (currentSecurity.requiresReset) {
      setUnlockError(
        "Security shield active. Reset the vault before trying again.",
      );
      setStage(hasExistingVault ? "locked" : "creating");
      return;
    }
    if (currentSecurity.lockUntil > now) {
      setUnlockError(
        `Too many failed attempts. Try again in ${formatCountdown(currentSecurity.lockUntil - now)}.`,
      );
      return;
    }

    setIsUnlocking(true);
    setUnlockError(null);
    try {
      const result = await unlockVault(masterInput);
      masterSecretRef.current = masterInput;
      setMasterInput("");
      setMasterConfirm("");
      vaultRef.current = result.payload;
      setVault(result.payload);
      setStage("unlocked");
      registerInteraction();
      if (result.isNewVault) {
        await persistVault(masterInput, result.payload);
        setHasExistingVault(true);
      }
      setMeta(loadVaultMeta());
      addToast("Vault unlocked.", "success");
      const updatedSecurity = recordUnlockSuccess();
      setSecurityState(updatedSecurity);
    } catch (error) {
      console.error(error);
      const updatedSecurity = recordUnlockFailure();
      setSecurityState(updatedSecurity);
      if (updatedSecurity.requiresReset) {
        setUnlockError(
          "Security shield active—the vault is locked. Reset the vault to continue.",
        );
      } else if (updatedSecurity.lockUntil > Date.now()) {
        setUnlockError(
          `Master password invalid. Vault temporarily locked (${formatCountdown(
            updatedSecurity.lockUntil - Date.now(),
          )}).`,
        );
      } else {
        setUnlockError("Master password incorrect or vault corrupted.");
      }
      setStage(hasExistingVault ? "locked" : "creating");
    } finally {
      setIsUnlocking(false);
      refreshSecurityState();
    }
  }, [
    addToast,
    hasExistingVault,
    masterConfirm,
    masterInput,
    refreshSecurityState,
    registerInteraction,
    stage,
  ]);

  const handleResetVault = useCallback(() => {
    const confirmed = window.confirm(
      "This will permanently delete all stored credentials. Continue?",
    );
    if (!confirmed) return;
    resetVault();
    resetSecurityState();
    refreshSecurityState();
    lockVault("Vault reset.");
  }, [lockVault, refreshSecurityState]);

  const handleGeneratePassword = useCallback(() => {
    try {
      const newPassword = generatePassword(passwordOptions);
      setDraft((prev) => ({ ...prev, password: newPassword }));
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "Generator error",
        "error",
      );
    }
  }, [addToast, passwordOptions]);

  const validateField = useCallback((key: keyof typeof initialDraft, value: string) => {
    const errors: typeof fieldErrors = {};

    if (key === "url" && value.trim()) {
      // Basic URL validation
      const urlPattern = /^(https?:\/\/)?([\w-]+(\.[\w-]+)+)(:\d+)?(\/.*)?$/i;
      const domainPattern = /^[\w-]+(\.[\w-]+)+$/i;
      if (!urlPattern.test(value) && !domainPattern.test(value)) {
        errors.url = "Please enter a valid domain or URL (e.g., example.com or https://example.com)";
      }
    }

    return errors;
  }, []);

  const handleDraftChange = useCallback(
    (key: keyof typeof initialDraft, value: string) => {
      setDraft((prev) => ({ ...prev, [key]: value }));

      // Real-time validation
      const errors = validateField(key, value);
      setFieldErrors((prev) => ({ ...prev, ...errors, [key]: errors[key] }));
    },
    [validateField],
  );

  const handlePasswordOptionChange = useCallback(
    (key: keyof PasswordOptions, value: boolean | number) => {
      generatorCustomizedRef.current = true;
      setPasswordOptions((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const hasUnsavedChanges = useCallback(() => {
    if (!editingEntryId) {
      // New entry - check if any field has content
      return draft.label || draft.username || draft.password || draft.notes || draft.url;
    }

    // Editing existing entry - check if any field changed
    const currentEntry = vault?.entries.find(e => e.id === editingEntryId);
    if (!currentEntry) return false;

    return (
      draft.label !== currentEntry.label ||
      draft.username !== currentEntry.username ||
      draft.password !== currentEntry.password ||
      (draft.notes || "") !== (currentEntry.notes || "") ||
      (draft.url || "") !== (currentEntry.url || currentEntry.domain || "")
    );
  }, [editingEntryId, draft, vault]);

  const handleEditEntry = useCallback(
    (entry: VaultEntry) => {
      // Check for unsaved changes before switching to another entry
      if (editingEntryId && hasUnsavedChanges()) {
        const confirmed = window.confirm(
          "You have unsaved changes. Do you want to discard them and edit this entry instead?"
        );
        if (!confirmed) return;
      }

      setEditingEntryId(entry.id);
      setDraft({
        label: entry.label,
        username: entry.username,
        password: entry.password,
        notes: entry.notes ?? "",
        url: entry.url ?? entry.domain ?? "",
      });
      setDraftError(null);
      registerInteraction();
    },
    [editingEntryId, hasUnsavedChanges, registerInteraction],
  );

  const handleCancelEdit = useCallback(() => {
    // Warn about unsaved changes
    if (hasUnsavedChanges()) {
      const confirmed = window.confirm(
        "You have unsaved changes. Are you sure you want to discard them?"
      );
      if (!confirmed) return;
    }

    setEditingEntryId(null);
    setDraft(initialDraft);
    setDraftError(null);
    setFieldErrors({});
  }, [hasUnsavedChanges]);

  const handleMasterChangeInput = useCallback(
    (key: "next" | "confirm", value: string) => {
      setMasterChange((prev) => ({ ...prev, [key]: value }));
      setMasterChangeError(null);
      registerInteraction();
    },
    [registerInteraction],
  );

  const handleRotateMasterPassword = useCallback(async () => {
    if (!vaultRef.current || !masterSecretRef.current) {
      setMasterChangeError("Vault is not unlocked.");
      return;
    }
    if (!masterChange.next) {
      setMasterChangeError("Please enter a new master password.");
      return;
    }
    if (masterChange.next.length < 12) {
      setMasterChangeError("Please use at least 12 characters.");
      return;
    }
    if (masterChange.next !== masterChange.confirm) {
      setMasterChangeError("Confirmation does not match the new password.");
      return;
    }
    if (masterChange.next === masterSecretRef.current) {
      setMasterChangeError("New master password must differ from the current one.");
      return;
    }
    try {
      await persistVault(masterChange.next, vaultRef.current);
      masterSecretRef.current = masterChange.next;
      setMasterChange({ next: "", confirm: "" });
      setMasterChangeError(null);
      setMeta(loadVaultMeta());
      addToast("Master password updated.", "success");
      registerInteraction();
    } catch (error) {
      console.error(error);
      setMasterChangeError("Master password could not be updated.");
    }
  }, [
    addToast,
    masterChange.confirm,
    masterChange.next,
    registerInteraction,
  ]);

  const queueLeakCheck = useCallback(
    async (entryId: string, password: string) => {
      if (!userSettings.leakChecksEnabled) {
        return;
      }
      registerInteraction();
      setCheckingEntries((prev) => [...new Set([...prev, entryId])]);
      try {
        const exposure = await checkPasswordAgainstLeaks(password);
        await applyVaultUpdate((current) => ({
          ...current,
          entries: current.entries.map((existing) =>
            existing.id === entryId
              ? {
                  ...existing,
                  exposure,
                  updatedAt: Date.now(),
                }
              : existing,
          ),
        }));
        addToast("Leak check complete.", "success");
      } catch (error) {
        console.error(error);
        await applyVaultUpdate((current) => ({
          ...current,
          entries: current.entries.map((existing) =>
            existing.id === entryId
              ? {
                  ...existing,
                  exposure: {
                    status: "warning",
                    sources: existing.exposure?.sources ?? [],
                    errors: [
                      ...(existing.exposure?.errors ?? []),
                      error instanceof Error
                        ? error.message
                        : "Unexpected error during leak check.",
                    ],
                    lastChecked: Date.now(),
                  },
                }
              : existing,
          ),
        }));
        addToast("Leak check failed.", "error");
      } finally {
        setCheckingEntries((prev) => prev.filter((id) => id !== entryId));
      }
    },
    [addToast, applyVaultUpdate, registerInteraction, userSettings.leakChecksEnabled],
  );

  const handleSaveEntry = useCallback(async () => {
    if (!vaultRef.current || !masterSecretRef.current) {
      setDraftError("Vault is not unlocked.");
      return;
    }
    if (!draft.password) {
      setDraftError("Please add or generate a password.");
      return;
    }
    setDraftError(null);
    setIsSavingEntry(true);

    try {
      const trimmedLabel = draft.label.trim() || "Untitled";
      const trimmedUsername = draft.username.trim();
      const normalizedNotes = draft.notes.trim() ? draft.notes.trim() : undefined;
      const trimmedUrl = draft.url.trim();
      const normalizedDomain = trimmedUrl ? normalizeHost(trimmedUrl) : undefined;
      const storedUrl = trimmedUrl || undefined;
      const now = Date.now();

      if (editingEntryId) {
      await applyVaultUpdate((current) => ({
        ...current,
        entries: current.entries.map((existing) =>
          existing.id === editingEntryId
            ? {
                ...existing,
                label: trimmedLabel,
                username: trimmedUsername,
                password: draft.password,
                notes: normalizedNotes,
                url: storedUrl,
                domain: normalizedDomain,
                updatedAt: now,
                exposure: {
                  status: "pending",
                  sources: [],
                  errors: [],
                  lastChecked: now,
                },
              }
            : existing,
        ),
      }));
      const entryId = editingEntryId;
      setEditingEntryId(null);
      setDraft(initialDraft);
      if (userSettings.leakChecksEnabled) {
        addToast("Entry updated. Breach check running...", "info");
        await queueLeakCheck(entryId, draft.password);
      } else {
        addToast("Entry updated locally.", "success");
      }
      return;
    }

    const entry = initializeVaultEntry({
      label: trimmedLabel,
      username: trimmedUsername,
      password: draft.password,
      notes: normalizedNotes,
      url: storedUrl,
      domain: normalizedDomain,
    });

    await applyVaultUpdate((current) => ({
      ...current,
      entries: [entry, ...current.entries],
    }));

      setDraft(initialDraft);
      if (userSettings.leakChecksEnabled) {
        addToast("Entry saved. Breach check running...", "info");
        await queueLeakCheck(entry.id, entry.password);
      } else {
        addToast("Entry saved locally.", "success");
      }
    } catch (error) {
      console.error("Error saving entry:", error);
      setDraftError("Failed to save entry. Please try again.");
    } finally {
      setIsSavingEntry(false);
    }
  }, [
    addToast,
    applyVaultUpdate,
    draft.label,
    draft.notes,
    draft.password,
    draft.username,
    draft.url,
    editingEntryId,
    queueLeakCheck,
    userSettings.leakChecksEnabled,
  ]);

  const handleDeleteEntry = useCallback(
    async (id: string) => {
      if (!vaultRef.current || !masterSecretRef.current) return;
      const ok = window.confirm("Delete this entry?");
      if (!ok) return;
      if (editingEntryId === id) {
        setEditingEntryId(null);
        setDraft(initialDraft);
        setDraftError(null);
      }
      await applyVaultUpdate((current) => ({
        ...current,
        entries: current.entries.filter((entry) => entry.id !== id),
      }));
      addToast("Entry deleted.", "info");
    },
    [addToast, applyVaultUpdate, editingEntryId],
  );

  const handleToggleReveal = useCallback((id: string) => {
    setRevealedEntries((prev) =>
      prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id],
    );
  }, []);

  const handleCopyToClipboard = useCallback(
    async (value: string, successText: string) => {
      try {
        await navigator.clipboard.writeText(value);
        addToast(successText, "success");
        if (clipboardClearTimeout.current) {
          window.clearTimeout(clipboardClearTimeout.current);
          clipboardClearTimeout.current = null;
        }
        if (userSettings.clipboardAutoClear) {
          clipboardClearTimeout.current = window.setTimeout(() => {
            navigator.clipboard
              .writeText("")
              .catch((error) =>
                console.warn("Vaultlight: failed to clear clipboard.", error),
              );
            clipboardClearTimeout.current = null;
          }, 30_000) as unknown as number;
        }
      } catch (error) {
        console.error(error);
        addToast("Could not copy to the clipboard.", "error");
      }
    },
    [addToast, userSettings.clipboardAutoClear],
  );

  const handleRecheckEntry = useCallback(
    async (entry: VaultEntry) => {
      if (!masterSecretRef.current) return;
      if (!userSettings.leakChecksEnabled) {
        addToast("Leak checks are disabled in settings.", "info");
        return;
      }
      addToast("Starting leak check...", "info");
      await queueLeakCheck(entry.id, entry.password);
    },
    [addToast, queueLeakCheck, userSettings.leakChecksEnabled],
  );

  const renderUnlockCard = () => (
    <section className="vault-card">
      <header className="vault-card__header">
        <h1>Vaultlight Password Manager</h1>
        <p>
          Local vault with strong encryption, a password generator, and automated leak
          monitoring.
        </p>
      </header>
      <div className="vault-form__group">
        <label htmlFor="master-password">Master password</label>
        <input
          id="master-password"
          type="password"
          value={masterInput}
          autoFocus
          onChange={(event) => setMasterInput(event.target.value)}
          placeholder="Master password (at least 12 characters)"
        />
        {stage === "creating" && masterPasswordStrength && (
          <div className={classNames("vault-strength", masterPasswordStrength.level)}>
            <span>{strengthLabel(masterPasswordStrength)}</span>
            <span>Estimated crack time: {masterPasswordStrength.crackTime}</span>
          </div>
        )}
      </div>
      {stage === "creating" && (
        <div className="vault-form__group">
          <label htmlFor="master-password-confirm">Repeat master password</label>
          <input
            id="master-password-confirm"
            type="password"
            value={masterConfirm}
            onChange={(event) => setMasterConfirm(event.target.value)}
            placeholder="Confirm password"
          />
        </div>
      )}
      {unlockError && <p className="vault-error">{unlockError}</p>}
      {securityState.requiresReset && (
        <p className="vault-error">
          Security shield active: too many failed attempts. Reset the vault to continue.
        </p>
      )}
      {!securityState.requiresReset && securityState.lockUntil > Date.now() && (
        <p className="vault-warning">
          Vault temporarily blocked—time remaining:{" "}
          {formatCountdown(securityState.lockUntil - Date.now())}.
        </p>
      )}
      <button
        className="vault-button primary"
        type="button"
        onClick={handleUnlock}
        disabled={isUnlocking}
      >
        {stage === "creating" ? "Create vault" : "Unlock vault"}
      </button>
      {hasExistingVault && stage !== "creating" && (
        <button
          type="button"
          className="vault-button subtle"
          onClick={handleResetVault}
        >
          Delete vault
        </button>
      )}
      {meta && hasExistingVault && (
        <div className="vault-meta">
          <span>Last unlocked: {formatTimestamp(meta.lastUnlockedAt)}</span>
          <span>Updated: {formatTimestamp(meta.updatedAt)}</span>
        </div>
      )}
    </section>
  );

  if (stage !== "unlocked" || !vault) {
    return (
      <main className="vault-app single-column" role="main" aria-label="Vault unlock">
        {renderUnlockCard()}
        <div className="vault-toasts" role="status" aria-live="polite" aria-atomic="true">
          {toasts.map((toast) => (
            <div key={toast.id} className={classNames("toast", toast.kind)}>
              <span>{toast.text}</span>
              <button
                type="button"
                className="toast-dismiss"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </main>
    );
  }

  return (
    <>
      <a href="#vault-content" className="skip-link">
        Skip to entries
      </a>
      <main className="vault-app" role="main" aria-label="Password vault management">
        <div className="vault-columns">
        <aside className="vault-sidebar" role="complementary" aria-label="Entry editor and vault controls">
          <div className="vault-card">
            <header className="vault-card__header">
              <h2>{editingEntryId ? "Edit entry" : "New entry"}</h2>
              <p>
                {editingEntryId
                  ? "Update credentials; all changes are encrypted instantly."
                  : "Store credentials locally with encryption."}
              </p>
            </header>
            {editingEntryId && (
              <div className="vault-edit-indicator">
                Editing · <strong>{draft.label || "Untitled"}</strong>
              </div>
            )}
            <div className="vault-form__group">
              <label htmlFor="entry-label">Label</label>
              <input
                id="entry-label"
                type="text"
                value={draft.label}
                onChange={(event) => handleDraftChange("label", event.target.value)}
                placeholder="e.g. company email"
              />
            </div>
            <div className="vault-form__group">
              <label htmlFor="entry-url">Website / domain</label>
              <input
                id="entry-url"
                type="text"
                value={draft.url}
                onChange={(event) =>
                  handleDraftChange("url", event.target.value)
                }
                placeholder="example.com"
                className={fieldErrors.url ? "error" : ""}
                aria-invalid={!!fieldErrors.url}
                aria-describedby={fieldErrors.url ? "entry-url-error" : undefined}
              />
              {fieldErrors.url && (
                <p className="vault-field-error" id="entry-url-error">
                  {fieldErrors.url}
                </p>
              )}
            </div>
            <div className="vault-form__group">
              <label htmlFor="entry-password">Password</label>
              <div className="vault-input-with-button">
                <input
                  id="entry-password"
                  type="text"
                  value={draft.password}
                  onChange={(event) =>
                    handleDraftChange("password", event.target.value)
                  }
                  placeholder="Generated password"
                />
                <button
                  type="button"
                  className="vault-button secondary"
                  onClick={handleGeneratePassword}
                  aria-label="Generate new password"
                >
                  Generate
                </button>
              </div>
              {strength && (
                <div className={classNames("vault-strength", strength.level)}>
                  <span>{strengthLabel(strength)}</span>
                  <span>Estimated: {strength.crackTime}</span>
                </div>
              )}
            </div>
            <div className="vault-form__group">
              <label htmlFor="entry-notes">Notes</label>
              <textarea
                id="entry-notes"
                value={draft.notes}
                onChange={(event) => handleDraftChange("notes", event.target.value)}
                placeholder="Security hints, 2FA backups, etc."
                rows={3}
              />
            </div>
            <div className="vault-generator">
              <h3>Generator</h3>
              <div className="vault-generator__grid">
                <label>
                  Length
                  <input
                    type="number"
                    min={8}
                    max={64}
                    value={passwordOptions.length}
                    onChange={(event) =>
                      handlePasswordOptionChange(
                        "length",
                        Number.parseInt(event.target.value, 10),
                      )
                    }
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={passwordOptions.useUppercase}
                    onChange={(event) =>
                      handlePasswordOptionChange(
                        "useUppercase",
                        event.target.checked,
                      )
                    }
                  />
                  Uppercase letters
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={passwordOptions.useLowercase}
                    onChange={(event) =>
                      handlePasswordOptionChange(
                        "useLowercase",
                        event.target.checked,
                      )
                    }
                  />
                  Lowercase letters
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={passwordOptions.useDigits}
                    onChange={(event) =>
                      handlePasswordOptionChange("useDigits", event.target.checked)
                    }
                  />
                  Digits
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={passwordOptions.useSymbols}
                    onChange={(event) =>
                      handlePasswordOptionChange(
                        "useSymbols",
                        event.target.checked,
                      )
                    }
                  />
                  Symbols
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={passwordOptions.avoidAmbiguous}
                    onChange={(event) =>
                      handlePasswordOptionChange(
                        "avoidAmbiguous",
                        event.target.checked,
                      )
                    }
                  />
                  Avoid ambiguous characters
                </label>
              </div>
            </div>
            {draftError && <p className="vault-error">{draftError}</p>}
            <div className="vault-form__actions">
              {editingEntryId && (
                <button
                  type="button"
                  className="vault-button ghost"
                  onClick={handleCancelEdit}
                  aria-label="Cancel editing and discard changes"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                className="vault-button primary"
                onClick={handleSaveEntry}
                disabled={isSavingEntry}
                aria-label={editingEntryId ? "Save changes to entry" : "Save new entry"}
                aria-busy={isSavingEntry}
              >
                {isSavingEntry ? "Saving..." : (editingEntryId ? "Save changes" : "Save entry")}
              </button>
            </div>
          </div>
          <div className="vault-card vault-summary">
            <h3>Overview</h3>
            <div className="vault-summary__stats">
              <div>
                <span className="vault-summary__value">{vault.entries.length}</span>
                <span className="vault-summary__label">Stored entries</span>
              </div>
              <div>
                <span className="vault-summary__value">
                  {vault.entries.filter(
                    (entry) => entry.exposure?.status === "breached",
                  ).length}
                </span>
                <span className="vault-summary__label">Breach warnings</span>
              </div>
            </div>
            <div className="vault-meta">
              <span>Last unlocked: {formatTimestamp(meta?.lastUnlockedAt)}</span>
              <span>Updated: {formatTimestamp(meta?.updatedAt)}</span>
            </div>
          </div>
          <div className="vault-card vault-security">
            <h3>Master password</h3>
            <p>Rotate your master password regularly for maximum security.</p>
            <div className="vault-form__group">
              <label htmlFor="master-new">New master password</label>
              <input
                id="master-new"
                type="password"
                autoComplete="new-password"
                value={masterChange.next}
                onChange={(event) => handleMasterChangeInput("next", event.target.value)}
                placeholder="At least 12 characters"
              />
              {masterPasswordStrength && (
                <div className={classNames("vault-strength", masterPasswordStrength.level)}>
                  <span>{strengthLabel(masterPasswordStrength)}</span>
                  <span>Estimated crack time: {masterPasswordStrength.crackTime}</span>
                </div>
              )}
            </div>
            <div className="vault-form__group">
              <label htmlFor="master-confirm">Confirmation</label>
              <input
                id="master-confirm"
                type="password"
                autoComplete="new-password"
                value={masterChange.confirm}
                onChange={(event) =>
                  handleMasterChangeInput("confirm", event.target.value)
                }
                placeholder="Repeat new master password"
              />
            </div>
            {masterChangeError && <p className="vault-error">{masterChangeError}</p>}
            <div className="vault-form__actions">
              <button
                type="button"
                className="vault-button secondary"
                onClick={handleRotateMasterPassword}
                disabled={!masterChange.next || !masterChange.confirm}
              >
                Update master password
              </button>
            </div>
            <p className="vault-security__hint">
              Auto-lock enabled: after {autoLockMinutes} {autoLockMinutes === 1 ? "minute" : "minutes"} of inactivity the vault locks automatically.
            </p>
          </div>
        </aside>
        <section className="vault-content" id="vault-content">
          <header className="vault-content__header">
            <div>
              <h1>My credentials</h1>
              <p>All data is stored locally in encrypted form only.</p>
            </div>
            <button
              type="button"
              className="vault-button subtle"
              onClick={() => lockVault()}
              aria-label="Lock vault"
            >
              Lock
            </button>
          </header>
          {vault.entries.length > 0 && (
            <div className="vault-search">
              <input
                type="search"
                className="vault-search__input"
                placeholder="Search entries by label, username, domain, or notes..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                aria-label="Search password entries"
              />
              {searchQuery && (
                <span className="vault-search__results">
                  {sortedEntries.length} {sortedEntries.length === 1 ? "result" : "results"}
                </span>
              )}
            </div>
          )}
          {sortedEntries.length === 0 ? (
            <div className="vault-empty">
              <h2>{searchQuery ? "No matching entries" : "No entries yet"}</h2>
              <p>
                {searchQuery
                  ? "Try a different search term or clear the search to see all entries."
                  : "Create your first entry. Every credential is checked against multiple leak databases immediately."}
              </p>
            </div>
          ) : (
            <div className="vault-entries">
              {sortedEntries.map((entry) => {
                const revealed = revealedEntries.includes(entry.id);
                const exposure = entry.exposure;
                return (
                  <article
                    key={entry.id}
                    className={classNames(
                      "vault-entry",
                      editingEntryId === entry.id && "editing",
                    )}
                  >
                    <header className="vault-entry__header">
                      <div>
                        <h3>{entry.label}</h3>
                        {entry.domain || entry.url ? (
                          <span className="vault-entry__url">
                            {entry.domain ?? extractDisplayUrl(entry.url)}
                          </span>
                        ) : null}
                        <span className="vault-entry__timestamp">
                          Updated: {formatTimestamp(entry.updatedAt)}
                        </span>
                      </div>
                      <span
                        className={classNames(
                          "vault-badge",
                          exposure?.status ?? "pending",
                        )}
                      >
                        {exposureStatusLabel(exposure?.status ?? "pending")}
                      </span>
                    </header>
                    <div className="vault-entry__body">
                      <div className="vault-entry__row">
                        <span className="label">Username</span>
                        <div className="value">
                          <span>{entry.username || "—"}</span>
                          {entry.username && (
                            <button
                              type="button"
                              className="vault-button ghost"
                              onClick={() =>
                                handleCopyToClipboard(entry.username, "Username copied.")
                              }
                              aria-label={`Copy username for ${entry.label}`}
                            >
                              Copy
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="vault-entry__row">
                        <span className="label">Password</span>
                        <div className="value">
                          <span className="vault-entry__password">
                            {revealed ? entry.password : "•••••••••"}
                          </span>
                          <div className="vault-entry__actions">
                            <button
                              type="button"
                              className="vault-button ghost"
                              onClick={() => handleToggleReveal(entry.id)}
                              aria-label={revealed ? `Hide password for ${entry.label}` : `Reveal password for ${entry.label}`}
                              aria-pressed={revealed}
                            >
                              {revealed ? "Hide" : "Reveal"}
                            </button>
                            <button
                              type="button"
                              className="vault-button ghost"
                              onClick={() =>
                                handleCopyToClipboard(entry.password, "Password copied.")
                              }
                              aria-label={`Copy password for ${entry.label}`}
                            >
                              Copy
                            </button>
                          </div>
                        </div>
                      </div>
                      {entry.notes && (
                        <div className="vault-entry__row">
                          <span className="label">Notes</span>
                          <div className="value notes">{entry.notes}</div>
                        </div>
                      )}
                    </div>
                    <footer className="vault-entry__footer">
                      <div className="vault-exposure">
                        <span>Last checked: {formatTimestamp(exposure?.lastChecked)}</span>
                        <div className="vault-exposure__sources">
                          {exposure?.sources?.length ? (
                            exposure.sources.map((source) => (
                              <span key={source.provider} className="source-chip">
                                {source.provider} · {source.matches} matches
                              </span>
                            ))
                          ) : (
                            <span className="source-chip muted">No matches recorded.</span>
                          )}
                        </div>
                        {exposure?.errors?.length ? (
                          <details className="vault-exposure__errors">
                            <summary>Error details</summary>
                            <ul>
                              {exposure.errors.map((error, index) => (
                                <li key={index}>{error}</li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                      </div>
                      <div className="vault-entry__footer-actions">
                        <button
                          type="button"
                          className="vault-button ghost"
                          disabled={editingEntryId === entry.id}
                          onClick={() => handleEditEntry(entry)}
                          aria-label={`Edit ${entry.label}`}
                        >
                          {editingEntryId === entry.id ? "In progress" : "Edit"}
                        </button>
                        <button
                          type="button"
                          className="vault-button secondary"
                          disabled={isChecking(entry.id)}
                          onClick={() => handleRecheckEntry(entry)}
                          aria-label={`Run leak check for ${entry.label}`}
                          aria-busy={isChecking(entry.id)}
                        >
                          {isChecking(entry.id) ? "Checking..." : "Leak-Check"}
                        </button>
                        <button
                          type="button"
                          className="vault-button danger"
                          onClick={() => handleDeleteEntry(entry.id)}
                          aria-label={`Delete ${entry.label}`}
                        >
                          Delete
                        </button>
                      </div>
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
      <div className="vault-toasts" role="status" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={classNames("toast", toast.kind)}>
            <span>{toast.text}</span>
            <button
              type="button"
              className="toast-dismiss"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </main>
    </>
  );
}
