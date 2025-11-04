import { NextResponse } from "next/server";
import { DARK_WEB_SAMPLE } from "../../../../core/leaks/darkWebSample";
import { VAULT_INTEL_SAMPLE } from "../../../../server/leaks/providers/vaultIntel";
import type {
  ExposureSource,
  PasswordExposure,
} from "../../../../core/crypto/cryptoClient";

interface LeakCheckRequest {
  sha1Prefix: string;
  sha1Suffix: string;
  sha256Hash: string;
  passwordLength?: number;
}

interface LeakCheckResponse {
  success: boolean;
  exposure?: PasswordExposure;
  error?: string;
}

const HIBP_ENDPOINT = "https://api.pwnedpasswords.com/range/";

async function queryHaveIBeenPwned(prefix: string, suffix: string): Promise<ExposureSource | null> {
  const response = await fetch(`${HIBP_ENDPOINT}${prefix}`, {
    method: "GET",
    headers: {
      "Add-Padding": "true",
      "User-Agent": "Vaultlight Password Manager",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`HIBP HTTP ${response.status}`);
  }

  const text = await response.text();
  const matchLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith(suffix.toUpperCase()));

  if (!matchLine) {
    return null;
  }

  const count = parseInt(matchLine.split(":")[1] ?? "0", 10);

  return {
    provider: "HaveIBeenPwned",
    description: "Detected in the Pwned Passwords dataset",
    matches: Number.isNaN(count) ? 0 : count,
    severity: count > 1000 ? "high" : "medium",
  };
}

function lookupLocalDatasets(hash: string): ExposureSource[] {
  const normalized = hash.toLowerCase();
  const hits: ExposureSource[] = [];

  const darkMatch = DARK_WEB_SAMPLE.find((record) => record.hash === normalized);
  if (darkMatch) {
    hits.push({
      provider: darkMatch.source,
      description: darkMatch.description,
      matches: darkMatch.matches ?? 1,
      severity: darkMatch.severity,
    });
  }

  const vaultMatch = VAULT_INTEL_SAMPLE.find((record) => record.hash === normalized);
  if (vaultMatch) {
    hits.push({
      provider: vaultMatch.source,
      description: vaultMatch.description,
      matches: vaultMatch.matches,
      severity: vaultMatch.severity,
    });
  }

  return hits;
}

function buildExposure(sources: ExposureSource[], errors: string[]): PasswordExposure {
  let status: PasswordExposure["status"] = "safe";

  if (sources.some((source) => source.severity === "high")) {
    status = "breached";
  } else if (sources.length > 0) {
    status = "warning";
  } else if (errors.length > 0) {
    status = "warning";
  }

  return {
    status,
    sources,
    errors,
    lastChecked: Date.now(),
  };
}

export async function POST(request: Request) {
  let body: LeakCheckRequest;
  try {
    body = (await request.json()) as LeakCheckRequest;
  } catch (error) {
    return NextResponse.json<LeakCheckResponse>(
      {
        success: false,
        error: "Invalid request body.",
      },
      { status: 400 },
    );
  }

  const { sha1Prefix, sha1Suffix, sha256Hash } = body;
  if (!sha1Prefix || !sha1Suffix || !sha256Hash) {
    return NextResponse.json<LeakCheckResponse>(
      {
        success: false,
        error: "Missing hash values for the leak check.",
      },
      { status: 400 },
    );
  }

  const sources: ExposureSource[] = [];
  const errors: string[] = [];

  try {
    const hibpExposure = await queryHaveIBeenPwned(sha1Prefix, sha1Suffix);
    if (hibpExposure) {
      sources.push(hibpExposure);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    const localSources = lookupLocalDatasets(sha256Hash);
    sources.push(...localSources);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return NextResponse.json<LeakCheckResponse>({
    success: true,
    exposure: buildExposure(sources, errors),
  });
}
