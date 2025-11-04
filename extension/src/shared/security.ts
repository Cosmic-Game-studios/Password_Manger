export interface SecurityState {
  failedAttempts: number;
  totalFailures: number;
  shieldLevel: number;
  lockUntil: number;
  lastFailure: number;
  requiresReset: boolean;
}

export const SECURITY_KEY = "vaultlight.securityShield";

export const DEFAULT_SECURITY_STATE: SecurityState = {
  failedAttempts: 0,
  totalFailures: 0,
  shieldLevel: 0,
  lockUntil: 0,
  lastFailure: 0,
  requiresReset: false,
};

export function computeBackoffMillis(shieldLevel: number): number {
  const baseSeconds = Math.pow(2, Math.min(shieldLevel, 6) + 2) * 5;
  const clampedSeconds = Math.min(baseSeconds, 15 * 60);
  return clampedSeconds * 1000;
}

export function deriveFailure(previous: SecurityState, now: number): SecurityState {
  const next: SecurityState = {
    ...previous,
    failedAttempts: previous.failedAttempts + 1,
    totalFailures: previous.totalFailures + 1,
    lastFailure: now,
  };

  let shieldLevel = next.shieldLevel;
  if (next.failedAttempts >= 3) {
    shieldLevel = Math.min(shieldLevel + 1, 10);
    next.shieldLevel = shieldLevel;
    next.failedAttempts = 0;
    next.lockUntil = now + computeBackoffMillis(shieldLevel);
  }

  if (next.totalFailures >= 10) {
    next.requiresReset = true;
    next.lockUntil = Math.max(next.lockUntil, now + 60 * 60 * 1000);
  }

  return next;
}

export function deriveSuccess(): SecurityState {
  return { ...DEFAULT_SECURITY_STATE };
}

export async function loadSecurityState(): Promise<SecurityState> {
  const stored = await chrome.storage.local.get([SECURITY_KEY]);
  const raw = stored[SECURITY_KEY];
  if (!raw) {
    return { ...DEFAULT_SECURITY_STATE };
  }
  return {
    ...DEFAULT_SECURITY_STATE,
    ...(raw as SecurityState),
  };
}

export async function storeSecurityState(state: SecurityState): Promise<void> {
  await chrome.storage.local.set({
    [SECURITY_KEY]: state,
  });
}

export async function resetSecurityState(): Promise<SecurityState> {
  const next = deriveSuccess();
  await storeSecurityState(next);
  return next;
}
