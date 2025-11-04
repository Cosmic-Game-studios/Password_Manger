export function normalizeHost(value: string): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = value.includes("://") ? new URL(value) : new URL(`https://${value}`);
    const host = url.hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    const sanitized = value.trim().toLowerCase();
    if (!sanitized) {
      return null;
    }
    const host = sanitized.replace(/^[^a-z0-9]+/i, "");
    return host.startsWith("www.") ? host.slice(4) : host || null;
  }
}

export function extractDisplayUrl(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    const host = url.hostname;
    const pathname = url.pathname === "/" ? "" : url.pathname;
    return `${host}${pathname}`;
  } catch {
    return value;
  }
}
