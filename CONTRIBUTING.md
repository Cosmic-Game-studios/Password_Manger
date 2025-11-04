# Contributing to Vaultlight

Thanks for taking the time to contribute! This guide describes how to set up your environment, follow our conventions, and submit high-quality changes.

## Development Setup

1. Fork the repository and clone your fork locally.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Build the browser extension when needed:
   ```bash
   npm run build:extension
   ```

We recommend using the latest LTS version of Node.js.

## Branching & Workflow

- Create a feature branch from `main` for every change: `feat/my-awesome-improvement`.
- Keep branches focused and small. Prefer multiple PRs over one large one.
- Rebase on top of `main` frequently to avoid merge conflicts.

## Coding Standards

- The project uses TypeScript and Next.js; keep new code type-safe.
- Run linting before pushing: `npm run lint`.
- Add or update tests and documentation alongside code changes.
- Follow the existing file and folder structure; place reusable logic in `src/core` or `src/server` when appropriate.

## Commit Messages

- Use conventional commit prefixes where possible (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, etc.).
- Keep messages concise and descriptive (max ~72 characters in the subject).

## Pull Request Checklist

Before opening a PR, please confirm:

- [ ] The branch is rebased on the latest `main`.
- [ ] Linting passes locally (`npm run lint`).
- [ ] New or updated behavior is covered by tests or manual QA notes.
- [ ] Documentation and screenshots were updated if user-facing changes were made.
- [ ] The PR description clearly explains the problem and solution.

## Reporting Issues

Use the GitHub issue tracker. Include:

- Environment details (OS, browser, Node.js version).
- Steps to reproduce the issue.
- Expected vs. actual behavior.
- Logs or screenshots when available.

## Security Disclosures

For vulnerabilities, please follow the instructions in [`SECURITY.md`](SECURITY.md) instead of filing a public issue.

We appreciate your time and effort—welcome to the Vaultlight community!
