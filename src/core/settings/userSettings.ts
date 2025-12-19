export interface UserSettings {
  autoLockMinutes: number;
  generatorLength: number;
  generatorUppercase: boolean;
  generatorLowercase: boolean;
  generatorDigits: boolean;
  generatorSymbols: boolean;
  generatorAvoidAmbiguous: boolean;
  clipboardAutoClear: boolean;
  leakChecksEnabled: boolean;
  paranoidMode: boolean;
}

export const SETTINGS_STORAGE_KEY = "vaultlight.settings";

export const DEFAULT_SETTINGS: UserSettings = {
  autoLockMinutes: 5,
  generatorLength: 20,
  generatorUppercase: true,
  generatorLowercase: true,
  generatorDigits: true,
  generatorSymbols: true,
  generatorAvoidAmbiguous: true,
  clipboardAutoClear: true,
  leakChecksEnabled: true,
  paranoidMode: false,
};

export function loadSettings(): UserSettings {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS;
  }

  try {
    const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) {
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(stored) as Partial<UserSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
  } catch (error) {
    console.warn("Vaultlight settings: failed to parse settings, falling back to defaults.", error);
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: UserSettings) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("Vaultlight settings: unable to persist settings.", error);
  }
}

export function updateSettings(partial: Partial<UserSettings>): UserSettings {
  const next = {
    ...DEFAULT_SETTINGS,
    ...loadSettings(),
    ...partial,
  };
  saveSettings(next);
  return next;
}
