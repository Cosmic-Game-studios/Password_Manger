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
import {
  getSecurityState,
  recordUnlockFailure,
  recordUnlockSuccess,
  resetSecurityState,
  type SecurityState,
} from "../core/security/securityShield";

const defaultPasswordOptions: PasswordOptions = {
  length: 20,
  useUppercase: true,
  useLowercase: true,
  useDigits: true,
  useSymbols: true,
  avoidAmbiguous: true,
};

const initialDraft = {
  label: "",
  username: "",
  password: "",
  notes: "",
};

const AUTO_LOCK_MINUTES = 5;
const AUTO_LOCK_MS = AUTO_LOCK_MINUTES * 60 * 1000;

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

function exposureStatusLabel(status: PasswordExposure["status"]): string {
  switch (status) {
    case "safe":
      return "Keine Leaks gefunden";
    case "warning":
      return "Warnung";
    case "breached":
      return "Breach gefunden";
    default:
      return "Prüfung ausstehend";
  }
}

function strengthLabel(assessment: StrengthAssessment | null): string {
  if (!assessment) return "—";
  switch (assessment.level) {
    case "very-strong":
      return "Sehr stark";
    case "strong":
      return "Stark";
    case "medium":
      return "Mittel";
    default:
      return "Schwach";
  }
}

export default function HomePage() {
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

  const masterSecretRef = useRef<string>("");
  const vaultRef = useRef<VaultPayload | null>(null);
  const toastId = useRef(0);
  const lastInteractionRef = useRef(Date.now());

  useEffect(() => {
    return () => {
      masterSecretRef.current = "";
      vaultRef.current = null;
    };
  }, []);

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
      setMasterChange({ next: "", confirm: "" });
      setMasterChangeError(null);
    }
  }, [stage]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setSecurityState(getSecurityState());
  }, [stage]);

  const sortedEntries = useMemo(() => {
    if (!vault) return [];
    return [...vault.entries].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [vault]);

  const strength = useMemo(() => {
    if (!draft.password) return null;
    return assessStrength(draft.password);
  }, [draft.password]);

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
      addToast(message ?? "Tresor gesperrt.", "info");
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
        lockVault("Tresor automatisch gesperrt (Tab verlassen).");
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
      if (elapsed >= AUTO_LOCK_MS) {
        lockVault("Automatische Sperre nach Inaktivität.");
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
  }, [lockVault, registerInteraction, stage]);

  const applyVaultUpdate = useCallback(
    async (transform: (current: VaultPayload) => VaultPayload) => {
      if (!vaultRef.current) {
        throw new Error("Kein Vault geladen.");
      }
      if (!masterSecretRef.current) {
        throw new Error("Master-Passwort nicht verfügbar.");
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
      setUnlockError("Bitte Master-Passwort eingeben.");
      return;
    }
    if (stage === "creating" && masterInput !== masterConfirm) {
      setUnlockError("Passwörter stimmen nicht überein.");
      return;
    }

    const currentSecurity = getSecurityState();
    const now = Date.now();
    if (currentSecurity.requiresReset) {
      setUnlockError(
        "Sicherheitsmodus aktiv. Tresor muss zurückgesetzt werden, bevor neue Versuche möglich sind.",
      );
      setStage(hasExistingVault ? "locked" : "creating");
      return;
    }
    if (currentSecurity.lockUntil > now) {
      setUnlockError(
        `Zu viele Fehlversuche. Bitte in ${formatCountdown(currentSecurity.lockUntil - now)} erneut versuchen.`,
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
      addToast("Tresor entsperrt.", "success");
      const updatedSecurity = recordUnlockSuccess();
      setSecurityState(updatedSecurity);
    } catch (error) {
      console.error(error);
      const updatedSecurity = recordUnlockFailure();
      setSecurityState(updatedSecurity);
      if (updatedSecurity.requiresReset) {
        setUnlockError(
          "Sicherheitsmodus aktiv – Tresor aus Schutzgründen gesperrt. Bitte Tresor zurücksetzen.",
        );
      } else if (updatedSecurity.lockUntil > Date.now()) {
        setUnlockError(
          `Master-Passwort ungültig. Tresor vorübergehend gesperrt (${formatCountdown(
            updatedSecurity.lockUntil - Date.now(),
          )}).`,
        );
      } else {
        setUnlockError("Master-Passwort ungültig oder Tresor beschädigt.");
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
      "Dadurch werden alle gespeicherten Zugangsdaten dauerhaft gelöscht. Fortfahren?",
    );
    if (!confirmed) return;
    resetVault();
    resetSecurityState();
    refreshSecurityState();
    lockVault("Tresor zurückgesetzt.");
  }, [lockVault, refreshSecurityState]);

  const handleGeneratePassword = useCallback(() => {
    try {
      const newPassword = generatePassword(passwordOptions);
      setDraft((prev) => ({ ...prev, password: newPassword }));
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "Generator-Fehler",
        "error",
      );
    }
  }, [addToast, passwordOptions]);

  const handleDraftChange = useCallback(
    (key: keyof typeof initialDraft, value: string) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handlePasswordOptionChange = useCallback(
    (key: keyof PasswordOptions, value: boolean | number) => {
      setPasswordOptions((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleEditEntry = useCallback(
    (entry: VaultEntry) => {
      setEditingEntryId(entry.id);
      setDraft({
        label: entry.label,
        username: entry.username,
        password: entry.password,
        notes: entry.notes ?? "",
      });
      setDraftError(null);
      registerInteraction();
    },
    [registerInteraction],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingEntryId(null);
    setDraft(initialDraft);
    setDraftError(null);
  }, []);

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
      setMasterChangeError("Tresor ist nicht entsperrt.");
      return;
    }
    if (!masterChange.next) {
      setMasterChangeError("Bitte ein neues Master-Passwort eingeben.");
      return;
    }
    if (masterChange.next.length < 12) {
      setMasterChangeError("Bitte mindestens 12 Zeichen verwenden.");
      return;
    }
    if (masterChange.next !== masterChange.confirm) {
      setMasterChangeError("Bestätigung stimmt nicht mit dem neuen Passwort überein.");
      return;
    }
    if (masterChange.next === masterSecretRef.current) {
      setMasterChangeError("Neues Master-Passwort darf nicht identisch mit dem aktuellen sein.");
      return;
    }
    try {
      await persistVault(masterChange.next, vaultRef.current);
      masterSecretRef.current = masterChange.next;
      setMasterChange({ next: "", confirm: "" });
      setMasterChangeError(null);
      setMeta(loadVaultMeta());
      addToast("Master-Passwort aktualisiert.", "success");
      registerInteraction();
    } catch (error) {
      console.error(error);
      setMasterChangeError("Master-Passwort konnte nicht aktualisiert werden.");
    }
  }, [
    addToast,
    masterChange.confirm,
    masterChange.next,
    registerInteraction,
  ]);

  const queueLeakCheck = useCallback(
    async (entryId: string, password: string) => {
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
        addToast("Leak-Check abgeschlossen.", "success");
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
                        : "Unbekannter Fehler beim Leak-Check",
                    ],
                    lastChecked: Date.now(),
                  },
                }
              : existing,
          ),
        }));
        addToast("Leak-Check fehlgeschlagen.", "error");
      } finally {
        setCheckingEntries((prev) => prev.filter((id) => id !== entryId));
      }
    },
    [addToast, applyVaultUpdate, registerInteraction],
  );

  const handleSaveEntry = useCallback(async () => {
    if (!vaultRef.current || !masterSecretRef.current) {
      setDraftError("Vault ist nicht entsperrt.");
      return;
    }
    if (!draft.password) {
      setDraftError("Bitte ein Passwort hinzufügen oder generieren.");
      return;
    }
    setDraftError(null);

    const trimmedLabel = draft.label.trim() || "Unbenannt";
    const trimmedUsername = draft.username.trim();
    const normalizedNotes = draft.notes.trim() ? draft.notes.trim() : undefined;
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
      addToast("Eintrag aktualisiert. Breach-Check läuft…", "info");
      const entryId = editingEntryId;
      setEditingEntryId(null);
      setDraft(initialDraft);
      await queueLeakCheck(entryId, draft.password);
      return;
    }

    const entry = initializeVaultEntry({
      label: trimmedLabel,
      username: trimmedUsername,
      password: draft.password,
      notes: normalizedNotes,
    });

    await applyVaultUpdate((current) => ({
      ...current,
      entries: [entry, ...current.entries],
    }));

    setDraft(initialDraft);
    addToast("Eintrag gespeichert. Breach-Check läuft…", "info");
    await queueLeakCheck(entry.id, entry.password);
  }, [
    addToast,
    applyVaultUpdate,
    draft.label,
    draft.notes,
    draft.password,
    draft.username,
    editingEntryId,
    queueLeakCheck,
  ]);

  const handleDeleteEntry = useCallback(
    async (id: string) => {
      if (!vaultRef.current || !masterSecretRef.current) return;
      const ok = window.confirm("Eintrag wirklich löschen?");
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
      addToast("Eintrag gelöscht.", "info");
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
      } catch (error) {
        console.error(error);
        addToast("Konnte nicht in die Zwischenablage kopieren.", "error");
      }
    },
    [addToast],
  );

  const handleRecheckEntry = useCallback(
    async (entry: VaultEntry) => {
      if (!masterSecretRef.current) return;
      addToast("Starte Leak-Check…", "info");
      await queueLeakCheck(entry.id, entry.password);
    },
    [addToast, queueLeakCheck],
  );

  const renderUnlockCard = () => (
    <section className="vault-card">
      <header className="vault-card__header">
        <h1>Vaultlight Passwort Manager</h1>
        <p>
          Lokaler Tresor mit starker Verschlüsselung, Passwort-Generator und
          automatischen Leak-Checks.
        </p>
      </header>
      <div className="vault-form__group">
        <label htmlFor="master-password">Master-Passwort</label>
        <input
          id="master-password"
          type="password"
          value={masterInput}
          autoFocus
          onChange={(event) => setMasterInput(event.target.value)}
          placeholder="Master-Passwort"
        />
      </div>
      {stage === "creating" && (
        <div className="vault-form__group">
          <label htmlFor="master-password-confirm">Master-Passwort wiederholen</label>
          <input
            id="master-password-confirm"
            type="password"
            value={masterConfirm}
            onChange={(event) => setMasterConfirm(event.target.value)}
            placeholder="Passwort bestätigen"
          />
        </div>
      )}
      {unlockError && <p className="vault-error">{unlockError}</p>}
      {securityState.requiresReset && (
        <p className="vault-error">
          Sicherheitsmodus aktiv: Zu viele Fehlversuche. Setze den Tresor zurück, um fortzufahren.
        </p>
      )}
      {!securityState.requiresReset && securityState.lockUntil > Date.now() && (
        <p className="vault-warning">
          Tresor vorübergehend blockiert – verbleibende Zeit: {formatCountdown(
            securityState.lockUntil - Date.now(),
          )}.
        </p>
      )}
      <button
        className="vault-button primary"
        type="button"
        onClick={handleUnlock}
        disabled={isUnlocking}
      >
        {stage === "creating" ? "Tresor anlegen" : "Tresor entsperren"}
      </button>
      {hasExistingVault && stage !== "creating" && (
        <button
          type="button"
          className="vault-button subtle"
          onClick={handleResetVault}
        >
          Tresor löschen
        </button>
      )}
      {meta && hasExistingVault && (
        <div className="vault-meta">
          <span>Zuletzt entsperrt: {formatTimestamp(meta.lastUnlockedAt)}</span>
          <span>Aktualisiert: {formatTimestamp(meta.updatedAt)}</span>
        </div>
      )}
    </section>
  );

  if (stage !== "unlocked" || !vault) {
    return (
      <main className="vault-app single-column">
        {renderUnlockCard()}
        <div className="vault-toasts">
          {toasts.map((toast) => (
            <div key={toast.id} className={classNames("toast", toast.kind)}>
              {toast.text}
            </div>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="vault-app">
      <div className="vault-columns">
        <aside className="vault-sidebar">
          <div className="vault-card">
            <header className="vault-card__header">
              <h2>{editingEntryId ? "Eintrag bearbeiten" : "Neuer Eintrag"}</h2>
              <p>
                {editingEntryId
                  ? "Aktualisiere Zugangsdaten; Änderungen werden sofort verschlüsselt gespeichert."
                  : "Speichere Zugangsdaten lokal verschlüsselt."}
              </p>
            </header>
            {editingEntryId && (
              <div className="vault-edit-indicator">
                Bearbeitung aktiv · <strong>{draft.label || "Unbenannt"}</strong>
              </div>
            )}
            <div className="vault-form__group">
              <label htmlFor="entry-label">Bezeichnung</label>
              <input
                id="entry-label"
                type="text"
                value={draft.label}
                onChange={(event) => handleDraftChange("label", event.target.value)}
                placeholder="z.B. Firmen-Mail"
              />
            </div>
            <div className="vault-form__group">
              <label htmlFor="entry-username">Benutzername / E-Mail</label>
              <input
                id="entry-username"
                type="text"
                value={draft.username}
                onChange={(event) =>
                  handleDraftChange("username", event.target.value)
                }
                placeholder="mail@example.com"
              />
            </div>
            <div className="vault-form__group">
              <label htmlFor="entry-password">Passwort</label>
              <div className="vault-input-with-button">
                <input
                  id="entry-password"
                  type="text"
                  value={draft.password}
                  onChange={(event) =>
                    handleDraftChange("password", event.target.value)
                  }
                  placeholder="Generiertes Passwort"
                />
                <button
                  type="button"
                  className="vault-button secondary"
                  onClick={handleGeneratePassword}
                >
                  Generieren
                </button>
              </div>
              {strength && (
                <div className={classNames("vault-strength", strength.level)}>
                  <span>{strengthLabel(strength)}</span>
                  <span>Geschätzt: {strength.crackTime}</span>
                </div>
              )}
            </div>
            <div className="vault-form__group">
              <label htmlFor="entry-notes">Notizen</label>
              <textarea
                id="entry-notes"
                value={draft.notes}
                onChange={(event) => handleDraftChange("notes", event.target.value)}
                placeholder="Sicherheitshinweise, 2FA-Backup usw."
                rows={3}
              />
            </div>
            <div className="vault-generator">
              <h3>Generator</h3>
              <div className="vault-generator__grid">
                <label>
                  Länge
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
                  Großbuchstaben
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
                  Kleinbuchstaben
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={passwordOptions.useDigits}
                    onChange={(event) =>
                      handlePasswordOptionChange("useDigits", event.target.checked)
                    }
                  />
                  Ziffern
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
                  Sonderzeichen
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
                  Ähnliche Zeichen vermeiden
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
                >
                  Abbrechen
                </button>
              )}
              <button
                type="button"
                className="vault-button primary"
                onClick={handleSaveEntry}
              >
                {editingEntryId ? "Änderungen speichern" : "Zugang speichern"}
              </button>
            </div>
          </div>
          <div className="vault-card vault-summary">
            <h3>Überblick</h3>
            <div className="vault-summary__stats">
              <div>
                <span className="vault-summary__value">{vault.entries.length}</span>
                <span className="vault-summary__label">Gespeicherte Einträge</span>
              </div>
              <div>
                <span className="vault-summary__value">
                  {vault.entries.filter(
                    (entry) => entry.exposure?.status === "breached",
                  ).length}
                </span>
                <span className="vault-summary__label">Breach Warnungen</span>
              </div>
            </div>
            <div className="vault-meta">
              <span>Zuletzt entsperrt: {formatTimestamp(meta?.lastUnlockedAt)}</span>
              <span>Aktualisiert: {formatTimestamp(meta?.updatedAt)}</span>
            </div>
          </div>
          <div className="vault-card vault-security">
            <h3>Master-Passwort</h3>
            <p>Wähle regelmäßig ein neues Master-Passwort für maximale Sicherheit.</p>
            <div className="vault-form__group">
              <label htmlFor="master-new">Neues Master-Passwort</label>
              <input
                id="master-new"
                type="password"
                autoComplete="new-password"
                value={masterChange.next}
                onChange={(event) => handleMasterChangeInput("next", event.target.value)}
                placeholder="Mindestens 12 Zeichen"
              />
            </div>
            <div className="vault-form__group">
              <label htmlFor="master-confirm">Bestätigung</label>
              <input
                id="master-confirm"
                type="password"
                autoComplete="new-password"
                value={masterChange.confirm}
                onChange={(event) =>
                  handleMasterChangeInput("confirm", event.target.value)
                }
                placeholder="Neues Master-Passwort wiederholen"
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
                Master-Passwort aktualisieren
              </button>
            </div>
            <p className="vault-security__hint">
              Auto-Lock aktiv: Nach {AUTO_LOCK_MINUTES} Minuten Inaktivität wird der Tresor
              automatisch gesperrt.
            </p>
          </div>
        </aside>
        <section className="vault-content">
          <header className="vault-content__header">
            <div>
              <h1>Meine Zugangsdaten</h1>
              <p>Alle Daten sind nur lokal verschlüsselt gespeichert.</p>
            </div>
            <button
              type="button"
              className="vault-button subtle"
              onClick={() => lockVault()}
            >
              Sperren
            </button>
          </header>
          {sortedEntries.length === 0 ? (
            <div className="vault-empty">
              <h2>Noch keine Einträge</h2>
              <p>
                Lege deinen ersten Eintrag an. Jeder Eintrag wird direkt gegen mehrere
                Leak-Datenbanken geprüft.
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
                        <span className="vault-entry__timestamp">
                          Aktualisiert: {formatTimestamp(entry.updatedAt)}
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
                        <span className="label">Benutzername</span>
                        <div className="value">
                          <span>{entry.username || "—"}</span>
                          {entry.username && (
                            <button
                              type="button"
                              className="vault-button ghost"
                              onClick={() =>
                                handleCopyToClipboard(entry.username, "Benutzername kopiert.")
                              }
                            >
                              Kopieren
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="vault-entry__row">
                        <span className="label">Passwort</span>
                        <div className="value">
                          <span className="vault-entry__password">
                            {revealed ? entry.password : "•••••••••"}
                          </span>
                          <div className="vault-entry__actions">
                            <button
                              type="button"
                              className="vault-button ghost"
                              onClick={() => handleToggleReveal(entry.id)}
                            >
                              {revealed ? "Verbergen" : "Anzeigen"}
                            </button>
                            <button
                              type="button"
                              className="vault-button ghost"
                              onClick={() =>
                                handleCopyToClipboard(entry.password, "Passwort kopiert.")
                              }
                            >
                              Kopieren
                            </button>
                          </div>
                        </div>
                      </div>
                      {entry.notes && (
                        <div className="vault-entry__row">
                          <span className="label">Notizen</span>
                          <div className="value notes">{entry.notes}</div>
                        </div>
                      )}
                    </div>
                    <footer className="vault-entry__footer">
                      <div className="vault-exposure">
                        <span>Zuletzt geprüft: {formatTimestamp(exposure?.lastChecked)}</span>
                        <div className="vault-exposure__sources">
                          {exposure?.sources?.length ? (
                            exposure.sources.map((source) => (
                              <span key={source.provider} className="source-chip">
                                {source.provider} · {source.matches} Treffer
                              </span>
                            ))
                          ) : (
                            <span className="source-chip muted">Keine Treffer protokolliert.</span>
                          )}
                        </div>
                        {exposure?.errors?.length ? (
                          <details className="vault-exposure__errors">
                            <summary>Fehlerdetails</summary>
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
                        >
                          {editingEntryId === entry.id ? "In Bearbeitung" : "Bearbeiten"}
                        </button>
                        <button
                          type="button"
                          className="vault-button secondary"
                          disabled={isChecking(entry.id)}
                          onClick={() => handleRecheckEntry(entry)}
                        >
                          {isChecking(entry.id) ? "Prüfe…" : "Leak-Check"}
                        </button>
                        <button
                          type="button"
                          className="vault-button danger"
                          onClick={() => handleDeleteEntry(entry.id)}
                        >
                          Löschen
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
      <div className="vault-toasts">
        {toasts.map((toast) => (
          <div key={toast.id} className={classNames("toast", toast.kind)}>
            {toast.text}
          </div>
        ))}
      </div>
    </main>
  );
}
