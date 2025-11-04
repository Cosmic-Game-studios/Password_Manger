export interface PasswordOptions {
  length: number;
  useUppercase: boolean;
  useLowercase: boolean;
  useDigits: boolean;
  useSymbols: boolean;
  avoidAmbiguous: boolean;
}

const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.<>/?";
const AMBIGUOUS = "Il1O0";

function filterAmbiguous(source: string, avoid: boolean): string {
  if (!avoid) {
    return source;
  }
  const ambiguous = new Set(AMBIGUOUS.split(""));
  return source
    .split("")
    .filter((char) => !ambiguous.has(char))
    .join("");
}

export function generatePassword(options: PasswordOptions): string {
  const pools: string[] = [];
  if (options.useLowercase) {
    pools.push(filterAmbiguous(LOWERCASE, options.avoidAmbiguous));
  }
  if (options.useUppercase) {
    pools.push(filterAmbiguous(UPPERCASE, options.avoidAmbiguous));
  }
  if (options.useDigits) {
    pools.push(filterAmbiguous(DIGITS, options.avoidAmbiguous));
  }
  if (options.useSymbols) {
    pools.push(filterAmbiguous(SYMBOLS, options.avoidAmbiguous));
  }

  const filteredPools = pools.filter((pool) => pool.length > 0);
  if (filteredPools.length === 0) {
    throw new Error("At least one character group must be selected.");
  }

  const cryptoObj = (() => {
    if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
      return window.crypto;
    }
    if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
      return globalThis.crypto;
    }
    throw new Error("Could not locate a cryptographically secure random source.");
  })();
  const combined = filteredPools.join("");
  const indices = new Uint32Array(options.length);
  cryptoObj.getRandomValues(indices);

  const chars: string[] = [];
  for (let i = 0; i < options.length; i += 1) {
    const index = indices[i] % combined.length;
    chars.push(combined[index]);
  }

  // Ensure each selected pool contributes at least one char when feasible
  filteredPools.forEach((pool, poolIndex) => {
    if (poolIndex >= chars.length) {
      return;
    }
    const hasChar = chars.some((char) => pool.includes(char));
    if (!hasChar) {
      const randomIndex = indices[poolIndex] % pool.length;
      const slot = poolIndex % chars.length;
      chars[slot] = pool[randomIndex];
    }
  });

  return chars.join("");
}

export type StrengthLevel = "weak" | "medium" | "strong" | "very-strong";

export interface StrengthAssessment {
  score: number;
  level: StrengthLevel;
  crackTime: string;
  suggestions: string[];
}

export function assessStrength(password: string): StrengthAssessment {
  let score = 0;
  if (password.length >= 20) {
    score += 3;
  } else if (password.length >= 14) {
    score += 2;
  } else if (password.length >= 10) {
    score += 1;
  }

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const characterSets = [hasUpper, hasLower, hasDigit, hasSymbol].filter(Boolean)
    .length;
  score += characterSets;

  if (!/(.)\1{2,}/.test(password)) {
    score += 1;
  }

  let level: StrengthLevel = "weak";
  if (score >= 6) {
    level = "very-strong";
  } else if (score === 5) {
    level = "strong";
  } else if (score >= 3) {
    level = "medium";
  }

  const suggestions: string[] = [];
  if (password.length < 16) {
    suggestions.push("Increase the password length to at least 16 characters.");
  }
  if (characterSets < 3) {
    suggestions.push("Use a mix of uppercase, lowercase, digits, and symbols.");
  }
  if (/(.)\1{2,}/.test(password)) {
    suggestions.push("Avoid repeated character sequences.");
  }

  const crackTime = (() => {
    if (score >= 6) return "> millennia";
    if (score === 5) return "> decades";
    if (score >= 3) return "several months";
    return "seconds";
  })();

  return {
    score,
    level,
    crackTime,
    suggestions,
  };
}
