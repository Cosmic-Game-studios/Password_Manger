import type {
  ExposureSource,
  PasswordExposure,
} from "../crypto/cryptoClient";
import { DARK_WEB_SAMPLE } from "./darkWebSample";

const textEncoder = new TextEncoder();

function ensureCrypto(): Crypto {
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    return window.crypto;
  }
  if (typeof globalThis !== "undefined" && globalThis.crypto?.subtle) {
    return globalThis.crypto as Crypto;
  }
  throw new Error("Web Crypto API nicht verfügbar.");
}

async function digestHex(text: string, algorithm: "SHA-1" | "SHA-256"): Promise<string> {
  const crypto = ensureCrypto();
  const buffer = textEncoder.encode(text);
  const hash = await crypto.subtle.digest(algorithm, buffer);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function checkHaveIBeenPwned(password: string): Promise<ExposureSource | null> {
  const hash = (await digestHex(password, "SHA-1")).toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const endpoint = `https://api.pwnedpasswords.com/range/${prefix}`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Add-Padding": "true",
      "User-Agent": "Vaultlight Password Manager",
    },
  });

  if (!response.ok) {
    throw new Error(`HIBP Anfrage fehlgeschlagen (${response.status})`);
  }

  const text = await response.text();
  const matchLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith(suffix));

  if (!matchLine) {
    return null;
  }

  const count = parseInt(matchLine.split(":")[1] ?? "0", 10);
  return {
    provider: "HaveIBeenPwned",
    description: "Gefunden in der Pwned Passwords Datenbank",
    matches: Number.isNaN(count) ? 0 : count,
    severity: count > 1000 ? "high" : "medium",
  };
}

async function checkDarkWebSample(password: string): Promise<ExposureSource | null> {
  const hash = await digestHex(password, "SHA-256");
  const match = DARK_WEB_SAMPLE.find((entry) => entry.hash === hash);
  if (!match) {
    return null;
  }
  return {
    provider: match.source,
    description: match.description,
    matches: 1,
    severity: match.severity,
  };
}

async function requestBackendExposure(password: string): Promise<PasswordExposure> {
  const sha1Hash = (await digestHex(password, "SHA-1")).toUpperCase();
  const sha1Prefix = sha1Hash.slice(0, 5);
  const sha1Suffix = sha1Hash.slice(5);
  const sha256Hash = await digestHex(password, "SHA-256");

  const response = await fetch("/api/leaks/check", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sha1Prefix,
      sha1Suffix,
      sha256Hash,
      passwordLength: password.length,
    }),
  });

  if (!response.ok) {
    throw new Error(`Leak-Backend antwortete mit ${response.status}`);
  }

  const data = (await response.json()) as {
    success: boolean;
    exposure?: PasswordExposure;
    error?: string;
  };

  if (!data.success || !data.exposure) {
    throw new Error(data.error ?? "Leak-Backend lieferte keine gültige Antwort.");
  }

  return data.exposure;
}

async function fallbackExposure(password: string, upstreamError?: string): Promise<PasswordExposure> {
  const errors: string[] = [];
  if (upstreamError) {
    errors.push(upstreamError);
  }
  const exposures: ExposureSource[] = [];

  const tasks = [checkHaveIBeenPwned(password), checkDarkWebSample(password)].map(
    (task) =>
      task.catch((error) => {
        errors.push(error instanceof Error ? error.message : String(error));
        return null;
      }),
  );

  const results = await Promise.all(tasks);
  results.forEach((result) => {
    if (result) {
      exposures.push(result);
    }
  });

  let status: PasswordExposure["status"] = "safe";
  if (exposures.some((source) => source.severity === "high")) {
    status = "breached";
  } else if (exposures.length > 0 || errors.length > 0) {
    status = "warning";
  }

  return {
    status,
    sources: exposures,
    lastChecked: Date.now(),
    errors,
  };
}

export async function checkPasswordAgainstLeaks(password: string): Promise<PasswordExposure> {
  try {
    return await requestBackendExposure(password);
  } catch (error) {
    console.warn("Vaultlight Leak-Backend nicht erreichbar, benutze Fallback.", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return fallbackExposure(password, errorMessage);
  }
}
