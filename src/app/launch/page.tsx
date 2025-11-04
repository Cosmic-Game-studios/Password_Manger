import Link from "next/link";

export const metadata = {
  title: "Vaultlight | Launch",
  description:
    "Launch Vaultlight, the zero-backend password manager with client-side encryption and live breach monitoring.",
};

export default function LaunchPage() {
  return (
    <main className="launcher">
      <header className="launcher__hero">
        <span className="launcher__pill">Vaultlight 0.1.0</span>
        <h1>A vault-first password manager that actually stays on your device.</h1>
        <p>
          Vaultlight encrypts everything locally, keeps your master key in memory only, and
          monitors credentials against live breach intelligence. Launch the app to unlock airtight
          security in seconds.
        </p>
        <div className="launcher__actions">
          <Link href="/" className="launcher__cta">
            Launch Vault
          </Link>
          <Link href="#features" className="launcher__secondary">
            Explore features
          </Link>
        </div>
        <div className="launcher__stats">
          <div>
            <strong>256-bit</strong>
            <span>AES-GCM client-side crypto</span>
          </div>
          <div>
            <strong>5 min</strong>
            <span>Auto-lock inactivity window</span>
          </div>
          <div>
            <strong>Zero Cloud</strong>
            <span>No backend storage — ever</span>
          </div>
        </div>
      </header>

      <section className="launcher__panel" id="features">
        <h2>Built for security teams and solo operators alike</h2>
        <div className="launcher__grid">
          <article>
            <h3>Client-only encryption</h3>
            <p>
              Derive keys with PBKDF2, encrypt with AES-GCM, and keep the vault entirely in
              `localStorage`. Nothing leaves the browser except anonymized breach lookups.
            </p>
          </article>
          <article>
            <h3>Live breach intelligence</h3>
            <p>
              Each entry runs through Have I Been Pwned plus curated dark web datasets, so you know
              which credentials need rotation before attackers do.
            </p>
          </article>
          <article>
            <h3>Adaptive security shield</h3>
            <p>
              Failed attempts trigger exponential lockouts, forced resets, and sanitization of synced
              extension copies to keep account takeovers at bay.
            </p>
          </article>
          <article>
            <h3>Powerful generator</h3>
            <p>
              Ship complex credentials in one click with entropy-driven suggestions, ambiguity
              filters, and instant strength scoring.
            </p>
          </article>
          <article>
            <h3>Chrome autofill extension</h3>
            <p>
              Sync the encrypted vault to the companion extension, unlock with your master password,
              and autofill only when you approve it.
            </p>
          </article>
          <article>
            <h3>Offline-first by design</h3>
            <p>
              Vaultlight boots without a backend. You can audit the code, host it yourself, or run it
              locally for air-gapped environments.
            </p>
          </article>
        </div>
      </section>

      <section className="launcher__panel">
        <h2>Three steps to a locked-down workflow</h2>
        <ol className="launcher__steps">
          <li>
            <strong>Launch Vaultlight</strong>
            <span>Hit the button above and create your master password — it never hits disk.</span>
          </li>
          <li>
            <strong>Add and audit credentials</strong>
            <span>
              Save entries, trigger breach scans instantly, and rotate risky passwords with the
              generator.
            </span>
          </li>
          <li>
            <strong>Stay in control</strong>
            <span>
              Let auto-lock and the security shield guard against shoulder surfing, brute force, and
              stale sessions.
            </span>
          </li>
        </ol>
      </section>

      <section className="launcher__cta-block">
        <div>
          <h2>Ready to safeguard your secrets?</h2>
          <p>
            Launch the vault now or read the docs to customize, self-host, and contribute. Vaultlight
            is open-source and welcomes security-minded builders.
          </p>
        </div>
        <div className="launcher__cta-buttons">
          <Link href="/" className="launcher__cta launcher__cta--wide">
            Launch Vaultlight
          </Link>
          <Link href="https://github.com/Cosmic-Game-studios/Password_Manger" className="launcher__secondary">
            View on GitHub
          </Link>
        </div>
      </section>
    </main>
  );
}
