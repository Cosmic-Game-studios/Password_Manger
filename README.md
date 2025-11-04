# Vaultlight - Local Password Manager

[![License: MIT](https://img.shields.io/badge/License-MIT-success.svg)](LICENSE)
[![Built with TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

Vaultlight is a Next.js powered password manager that runs entirely in the browser. Credentials never leave the client: they are encrypted with AES-GCM (256 bit) and stored in the user's browser. Every entry triggers an automatic breach scan across public APIs and curated dark web data so you get ahead of compromised secrets immediately.

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Security and Architecture](#security-and-architecture)
- [Chrome Extension (Autofill)](#chrome-extension-autofill)
- [Scripts](#scripts)
- [Notes](#notes)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Features

- **End-to-end encryption** with PBKDF2 (210k iterations) and AES-GCM; nothing leaves the browser.
- **Master-password vault** that can be created, unlocked, or rotated at any time without leaving residue on disk.
- **Automated breach scans** combining Have I Been Pwned (k-anonymity) and curated threat intel feeds.
- **Configurable password generator** with strength analysis to encourage healthy credentials.
- **Entry management** for editing, rechecking, or securely deleting vault items in one click.
- **Auto-lock and tab hardening** that closes the vault after five minutes of inactivity or when the tab loses focus.
- **Chrome autofill extension** that unlocks with the master password and syncs the encrypted vault on demand.
- **Security shield** that tracks failed attempts, increases lockout durations, and blocks suspected attacks.
- **Desktop-first interface** focused on clarity, quick copy actions, and breach visibility.

## Quick Start

1. Install the dependencies.
   ```bash
   npm install
   ```
2. Start the development server.
   ```bash
   npm run dev
   ```
3. Visit `http://localhost:3000` in your browser.
4. Set a master password on first launch. It is never stored; losing it means the vault cannot be recovered.

## Security and Architecture

- **Storage:** Encrypted vault data lives in `localStorage` under `vaultlight.encrypted-vault`.
- **Cryptography:** PBKDF2 with 210,000 iterations (SHA-256) derives the vault key; payloads are encrypted with 256-bit AES-GCM.
- **Breach checks:**
  - Serverless endpoint `/api/leaks/check` aggregates Have I Been Pwned and Vaultlight threat intel feeds.
  - Offline fallback uses the curated dataset in `src/core/leaks/darkWebSample.ts`.
- **Session protection:** The vault auto-locks after five minutes idle or when the tab is hidden; the master key only resides in memory.
- **Master password rotation:** Changing the master password immediately re-encrypts the vault with the new key.
- **Offline-first:** The application works fully offline; breach lookups simply require network connectivity when available.
- **Security shield:** Failed attempts trigger exponential backoff, temporary lockouts, and emergency safeguards inside the extension.

## Chrome Extension (Autofill)

Deploy the optional extension to securely autofill credentials:

1. Unlock the vault and run `npm run build:extension`. The build outputs to `extension/dist`.
2. Open `chrome://extensions` (or the Edge equivalent), enable Developer Mode, and choose **Load unpacked**.
3. Select the `extension/dist` folder. The extension registers as **Vaultlight Autofill**.
4. Open the Vaultlight web app and click **Synchronize** inside the extension popup to copy the encrypted vault.
5. Enter the master password in the popup to reveal entries, then click **Autofill** on the target tab.

Extension safeguards:

- The vault remains encrypted at rest; unlock requires the master password each time.
- Automatic relock occurs after five minutes of inactivity or manual locking.
- Autofill happens only when explicitly triggered; credentials are never stored in the popup.
- Synchronization works solely with tabs that have the Vaultlight vault open.

## Scripts

- `npm run dev` - start the development server.
- `npm run build` - create a production build.
- `npm run start` - run the production server.
- `npm run lint` - lint the project with Next.js defaults.

## Notes

- Clearing browser data deletes the vault; export and backup are not yet implemented.
- Production deployments should integrate a dedicated breach intelligence backend.
- Clipboard actions rely on the browser allowing clipboard access.

## Project Structure

```
├─ src/app          # Next.js app router pages, layout, and UI
├─ src/core         # Browser-side crypto, leak detection, password generation
├─ src/server       # API-facing helpers and threat intelligence providers
├─ extension        # Chromium extension (background worker + popup UI)
└─ public           # Static assets
```

## Contributing

We welcome contributions! Please review the [contribution guide](CONTRIBUTING.md) for setup instructions, coding standards, and the pull request checklist. By participating you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

If you discover a vulnerability, please follow the responsible disclosure process outlined in [SECURITY.md](SECURITY.md). For general questions feel free to open an issue, but never post sensitive details publicly.

## License

Vaultlight is available under the [MIT License](LICENSE).

Happy testing! Issues and feature requests are welcome.
