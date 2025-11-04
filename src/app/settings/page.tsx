import Link from "next/link";

export const metadata = {
  title: "Vaultlight | Settings",
  description:
    "Preview upcoming Vaultlight capabilities, including encrypted cloud sync and multi-device support.",
};

const comingSoonItems = [
  {
    title: "End-to-end encrypted cloud sync",
    badge: "Coming soon",
    description:
      "Opt-in replication to personal storage providers with client-held keys. Vaultlight will encrypt before upload and never ship plaintext.",
    details: [
      "Self-hosted S3, Azure Blob, and GCS integrations",
      "Per-device key derivation to keep escrow out of the loop",
      "On-demand wipe when a device is reported missing",
    ],
  },
  {
    title: "Trusted device linking",
    badge: "Planned",
    description:
      "Pair laptops, desktops, and the Chrome extension with short-lived QR codes. Approvals stay in your control—no central trust server.",
    details: [
      "Mutual verification using WebAuthn/resident keys",
      "Independent unlock policies per device",
      "Hardware-backed counters to resist replay attacks",
    ],
  },
  {
    title: "Secure vault export & recovery kit",
    badge: "Researching",
    description:
      "Generate paper-friendly recovery shards and offline snapshots so you can back up without surrendering privacy.",
    details: [
      "Shamir-based key splitting with configurable quorum",
      "Encrypted archive exports for cold storage",
      "Rotatable recovery codes tied to master password rotations",
    ],
  },
];

export default function SettingsPage() {
  return (
    <main className="settings">
      <header className="settings__hero">
        <span className="settings__pill">Vision</span>
        <h1>Upcoming Vaultlight capabilities focused on uncompromising security.</h1>
        <p>
          We&apos;re building optional cloud sync and recovery workflows that never sacrifice
          on-device encryption. Expect zero-knowledge architecture, user-owned keys, and auditability
          from day one.
        </p>
        <div className="settings__links">
          <Link href="/" className="settings__cta">
            Back to vault
          </Link>
          <Link href="https://github.com/Cosmic-Game-studios/Password_Manger/issues" className="settings__secondary">
            Request a feature
          </Link>
        </div>
      </header>

      <section className="settings__roadmap">
        {comingSoonItems.map((item) => (
          <article key={item.title} className="settings__card">
            <header>
              <span className="settings__badge">{item.badge}</span>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
            </header>
            <ul>
              {item.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="settings__note">
        <h2>Security-first roadmap</h2>
        <p>
          Every upcoming feature is designed to keep secrets on your hardware. That means client-held
          encryption keys, transparent threat models, and opt-in workflows you can audit. No silent
          telemetry, no vendor lock-in.
        </p>
        <p>
          Have ideas, questions, or security insights? Open a discussion or contribute via{" "}
          <Link href="https://github.com/Cosmic-Game-studios/Password_Manger">GitHub</Link>. Vaultlight
          grows with feedback from operators like you.
        </p>
      </section>
    </main>
  );
}
