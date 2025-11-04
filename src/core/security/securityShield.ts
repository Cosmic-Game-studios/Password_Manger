export interface SecurityState {
  failedAttempts: number;
  totalFailures: number;
  shieldLevel: number;
  lockUntil: number;
  lastFailure: number;
  requiresReset: boolean;
}

const SECURITY_STORAGE_KEY = "vaultlight.security-shield";

const DEFAULT_SECURITY_STATE: SecurityState = {
  failedAttempts: 0,
  totalFailures: 0,
  shieldLevel: 0,
  lockUntil: 0,
  lastFailure: 0,
  requiresReset: false,
};

function cloneState(state: SecurityState): SecurityState {
  return { ...state };
}

function readState(): SecurityState {
  if (typeof window === "undefined") {
    return cloneState(DEFAULT_SECURITY_STATE);
  }
  try {
    const raw = window.localStorage.getItem(SECURITY_STORAGE_KEY);
    if (!raw) {
      return cloneState(DEFAULT_SECURITY_STATE);
    }
    const parsed = JSON.parse(raw) as SecurityState;
    return {
      ...DEFAULT_SECURITY_STATE,
      ...parsed,
    };
  } catch (error) {
    console.error("Vaultlight SecurityShield: konnte Zustand nicht laden", error);
    return cloneState(DEFAULT_SECURITY_STATE);
  }
}

function writeState(state: SecurityState) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SECURITY_STORAGE_KEY, JSON.stringify(state));
}

export function getSecurityState(): SecurityState {
  return readState();
}

export function resetSecurityState(): SecurityState {
  const next = cloneState(DEFAULT_SECURITY_STATE);
  writeState(next);
  return next;
}

function computeBackoffMillis(shieldLevel: number): number {
  const baseSeconds = Math.pow(2, Math.min(shieldLevel, 6) + 2) * 5;
  const clampedSeconds = Math.min(baseSeconds, 15 * 60);
  return clampedSeconds * 1000;
}

export function recordUnlockSuccess(): SecurityState {
  const next = cloneState(DEFAULT_SECURITY_STATE);
  writeState(next);
  return next;
}

export function recordUnlockFailure(): SecurityState {
  const state = readState();
  const now = Date.now();

  const next: SecurityState = {
    ...state,
    failedAttempts: state.failedAttempts + 1,
    totalFailures: state.totalFailures + 1,
    lastFailure: now,
  };

  let shieldLevel = next.shieldLevel;
  if (next.failedAttempts >= 3) {
    shieldLevel = Math.min(next.shieldLevel + 1, 10);
    next.shieldLevel = shieldLevel;
    next.failedAttempts = 0;
    next.lockUntil = now + computeBackoffMillis(shieldLevel);
  }

  if (next.totalFailures >= 12) {
    next.requiresReset = true;
    next.lockUntil = Math.max(next.lockUntil, now + 60 * 60 * 1000);
  }

  writeState(next);
  return next;
}
