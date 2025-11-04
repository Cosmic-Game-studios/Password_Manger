"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  loadSettings,
  saveSettings,
  type UserSettings,
} from "../../core/settings/userSettings";

export const metadata = {
  title: "Vaultlight | Settings",
  description:
    "Adjust Vaultlight default security, password generation, and privacy preferences from anywhere.",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const initial = loadSettings();
    setSettings(initial);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SETTINGS_STORAGE_KEY) {
        setSettings(loadSettings());
        setSavedAt(Date.now());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const handleUpdate = useCallback(<K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      setSavedAt(Date.now());
      return next;
    });
  }, []);

  const handleToggle = useCallback(
    (key: keyof UserSettings) => (event: ChangeEvent<HTMLInputElement>) => {
      handleUpdate(key, event.target.checked as UserSettings[typeof key]);
    },
    [handleUpdate],
  );

  const handleReset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    setSavedAt(Date.now());
  }, []);

  const savedMessage = useMemo(() => {
    if (!savedAt) return null;
    const formatted = new Date(savedAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `Settings saved · ${formatted}`;
  }, [savedAt]);

  return (
    <main className="settings">
      <header className="settings__hero">
        <span className="settings__pill">Settings</span>
        <h1>Control how Vaultlight secures and generates your credentials.</h1>
        <p>
          Tune auto-lock sensitivity, password generator defaults, and privacy protections. Changes
          apply instantly across the app and extension, and they&apos;re always encrypted locally.
        </p>
        {savedMessage && <p className="settings__status">{savedMessage}</p>}
        <div className="settings__links">
          <Link href="/" className="settings__cta">
            Back to vault
          </Link>
          <button type="button" className="settings__secondary" onClick={handleReset} disabled={!loaded}>
            Restore defaults
          </button>
        </div>
      </header>

      <section className="settings__grid">
        <article className="settings__card">
          <header className="settings__group">
            <h2>Vault security</h2>
            <p>Adjust how quickly Vaultlight locks itself and how it handles clipboard data.</p>
          </header>
          <div className="settings__group">
            <div className="settings__control">
              <label htmlFor="auto-lock">Auto-lock timeout</label>
              <div className="settings__range">
                <input
                  id="auto-lock"
                  type="range"
                  min={1}
                  max={60}
                  step={1}
                  value={settings.autoLockMinutes}
                  onChange={(event) => handleUpdate("autoLockMinutes", Number(event.target.value))}
                  disabled={!loaded}
                />
                <span className="settings__range-value">
                  {settings.autoLockMinutes} {settings.autoLockMinutes === 1 ? "minute" : "minutes"}
                </span>
              </div>
            </div>
            <div className="settings__checkbox">
              <input
                id="clipboard-auto-clear"
                type="checkbox"
                checked={settings.clipboardAutoClear}
                onChange={handleToggle("clipboardAutoClear")}
                disabled={!loaded}
              />
              <div>
                <label htmlFor="clipboard-auto-clear">
                  <strong>Auto-clear clipboard entries</strong>
                </label>
                <span>
                  Clear copied passwords after 30 seconds to reduce exposure if another app monitors your
                  clipboard.
                </span>
              </div>
            </div>
            <div className="settings__checkbox">
              <input
                id="leak-checks"
                type="checkbox"
                checked={settings.leakChecksEnabled}
                onChange={handleToggle("leakChecksEnabled")}
                disabled={!loaded}
              />
              <div>
                <label htmlFor="leak-checks">
                  <strong>Run breach checks automatically</strong>
                </label>
                <span>Submit hashed passwords to Have I Been Pwned and local intel feeds.</span>
              </div>
            </div>
          </div>
        </article>

        <article className="settings__card">
          <header className="settings__group">
            <h2>Password generator defaults</h2>
            <p>Set the baseline for generated credentials. You can override options per entry.</p>
          </header>
          <div className="settings__group">
            <div className="settings__control">
              <label htmlFor="generator-length">Default length</label>
              <div className="settings__range">
                <input
                  id="generator-length"
                  type="range"
                  min={8}
                  max={64}
                  step={1}
                  value={settings.generatorLength}
                  onChange={(event) => handleUpdate("generatorLength", Number(event.target.value))}
                  disabled={!loaded}
                />
                <span className="settings__range-value">{settings.generatorLength} characters</span>
              </div>
            </div>
            <div className="settings__checkbox">
              <input
                id="generator-upper"
                type="checkbox"
                checked={settings.generatorUppercase}
                onChange={handleToggle("generatorUppercase")}
                disabled={!loaded}
              />
              <div>
                <label htmlFor="generator-upper">
                  <strong>Include uppercase letters</strong>
                </label>
                <span>Add A-Z characters for additional entropy.</span>
              </div>
            </div>
            <div className="settings__checkbox">
              <input
                id="generator-lower"
                type="checkbox"
                checked={settings.generatorLowercase}
                onChange={handleToggle("generatorLowercase")}
                disabled={!loaded}
              />
              <div>
                <label htmlFor="generator-lower">
                  <strong>Include lowercase letters</strong>
                </label>
                <span>Keep a-z characters for balanced readability and strength.</span>
              </div>
            </div>
            <div className="settings__checkbox">
              <input
                id="generator-digits"
                type="checkbox"
                checked={settings.generatorDigits}
                onChange={handleToggle("generatorDigits")}
                disabled={!loaded}
              />
              <div>
                <label htmlFor="generator-digits">
                  <strong>Include digits</strong>
                </label>
                <span>Allow numbers 0-9 in generated passwords.</span>
              </div>
            </div>
            <div className="settings__checkbox">
              <input
                id="generator-symbols"
                type="checkbox"
                checked={settings.generatorSymbols}
                onChange={handleToggle("generatorSymbols")}
                disabled={!loaded}
              />
              <div>
                <label htmlFor="generator-symbols">
                  <strong>Include symbols</strong>
                </label>
                <span>Mix in special characters for stronger brute-force resistance.</span>
              </div>
            </div>
            <div className="settings__checkbox">
              <input
                id="generator-ambiguous"
                type="checkbox"
                checked={settings.generatorAvoidAmbiguous}
                onChange={handleToggle("generatorAvoidAmbiguous")}
                disabled={!loaded}
              />
              <div>
                <label htmlFor="generator-ambiguous">
                  <strong>Avoid ambiguous characters</strong>
                </label>
                <span>Exclude characters like O/0 and I/l to simplify manual entry.</span>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="settings__note">
        <h2>Security-first roadmap</h2>
        <p>
          These preferences stay encrypted in your browser and sync to the extension when it is
          connected. Cloud sync and recovery exports are being designed with the same zero-knowledge
          principles.
        </p>
        <p>
          Have questions or want to influence the roadmap? Open a discussion on{" "}
          <Link href="https://github.com/Cosmic-Game-studios/Password_Manger">GitHub</Link> and share
          your security requirements.
        </p>
      </section>
    </main>
  );
}
