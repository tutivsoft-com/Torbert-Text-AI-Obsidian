> **Source status (2026-10-02):** Local metadata is now 5.8.40; this version-only update changes no runtime behavior and has not been built, reviewed, or released. The last prepared candidate remains 5.8.39 at `release/5.8.39-source` / `52808ba0b5b266cde136b801b5bd6d1bd50f663b` from validated source tag `v5.8.39`; its exact-SHA Community preview is still pending. See [the current source status](docs/release-evidence/metadata-only-2026-10-02.md).

# Torbert Text AI

Torbert applies Markdown cleanup and text transformations in Obsidian, including summaries, folder classification, and reading highlights.

Version: `5.8.40` · [Complete user guide](./docs/USER_GUIDE.md) · [Transformation reference](./docs/TRANSFORMATIONS.md)

Canonical public repository: [`tutivsoft-com/Torbert-Text-AI-Obsidian`](https://github.com/tutivsoft-com/Torbert-Text-AI-Obsidian).

## Features

- Transform selected text, the current note, Markdown files, or folders.
- Use Markdown cleanup tools such as formatting conversion, URL tools, duplicate-line removal, numbering repair, and title checks.
- Run optional AI transformations through OpenRouter.
- Apply folder changes when launched and restore the last operation with Undo.
- Inspect active AI requests and clear waiting actions.

## AI provider

AI requests go directly from the plugin to OpenRouter. An optional personal key takes priority; when the key setting is blank, Torbert uses its existing encrypted Pattern B key manifest. Advanced settings contain the provider model controls. Constance does not proxy AI requests or choose the model.

## Billing

Constance handles account authentication, free and purchased character entitlements, usage debits, and Paddle checkout. Before an AI request, Torbert checks the account's available characters. It records the usage debit through Constance before applying the result. A failed provider request does not submit a usage debit, and an uncertain billing event is retried with the same event ID.

The current offers are 50,000, 150,000, 450,000, and 1,200,000 characters. Purchase settings load current Paddle prices, descriptions, and availability from Constance; the client submits only the selected configured price ID. Prices are not hard-coded in the plugin. Payment fulfillment is confirmed through Paddle's verified webhook and the account balance is refreshed from Constance.

## Usage

1. Install and enable Torbert Text AI.
2. Open the editor, file explorer, or folder context menu.
3. Choose **Torbert Text AI** and select a transformation, or search the command palette for `Torbert Text AI:`.
4. Choose Simple for everyday controls or Advanced for provider, menu, and diagnostic settings.

AI actions send the selected text or note content directly to OpenRouter. Torbert reads and modifies Markdown files in the current vault. It does not use analytics, advertising, or automatic updates. Optional debug logging is off by default.

## Workflow defaults (v5.8.40)

AI output is applied when the user launches a transformation. Before-and-after previews are optional and off by default.

## Development and release

The private repository contains complete source, tests, build scripts, and internal documentation. `npm run typecheck`, `npm test`, and `npm run build` validate and produce the Obsidian assets in `publish/`. Release assets are `main.js`, `manifest.json`, and `styles.css`.

Before upload, record SHA-256 hashes for all three release assets and verify the uploaded files against those hashes. The public repository contains only the approved publication surface; keep tests and internal documentation private.

## License

MIT. See [`LICENSE`](./LICENSE).

<!-- RA1-CODEBASE-SNAPSHOT:START -->
## Local Codebase Snapshot

Updated: `2026-10-02`

Source scanned from: `C:\Users\Rahul\Desktop\ghrepos\desktop-app-torbert-text-ai`
Category: `Local repositories`
Current branch: `main`

### Detected Stack

- `TypeScript` (24)
- `JavaScript` (6)
- `CSS` (2)
- `Shell` (1)

### Source Map

- Code files scanned: `33`
- Markdown/docs files scanned: `37`
- Manifest/deploy files scanned: `2`
- Main source areas: `publish/` (24), `/` (22), `src/` (12), `docs/` (8), `tests/` (4), `Archive/` (2)

### Main Entry Points

- `publish\main.js`
- `publish\src\main.ts`
- `src\main.ts`

### Manifests And Deploy Files

- `package.json`
- `tsconfig.json`

### Documentation Files

- `AGENTS.md`
- `ai_model.md`
- `ai_model_change_20260910224059.md`
- `architecture.md`
- `Archive\ARCHIVE_MANIFEST.md`
- `Archive\historical-billing-review\BILLING_REVIEW_2026-09-30.md`
- `BILLING_REVIEW_2026-09-30.md`
- `CHANGE_IN_MODEL_20260817102257.md`
- `CHANGELOG.md`
- `chatgpt_sol_analysis_20260920141546.md`
- `CONSTANCE_BILLING_CONTRACT_2026-09-20.md`
- `CONTRIBUTORS.md`
- `docs\END_TO_END_OBSIDIAN_RELEASE_WORKFLOW.md`
- `docs\OBSIDIAN_RELEASE_RUNBOOK.md`
- `docs\release-evidence\metadata-only-2026-10-02.md`
- `docs\release-evidence\obsidian-community-5.8.32.md`
- `docs\release-evidence\validation-2026-10-02-resume.md`
- `docs\RELEASE_STATUS_2026-09-12.md`
- ... 19 more

### Detected Routes Or App Handlers

- No framework route declarations detected by the scanner.

### Detected Package Commands

- `npm run build`
- `npm run test`
- `npm run typecheck`

### Maintenance Rule

When source files, routes, user flows, manifests, Docker/compose settings, or deployment behavior change, refresh this managed block with:

```bash
python "C:/Users/Rahul/Desktop/ghrepos/RA1/MAIN/40 Common/Scripts/refresh_local_repo_docs.py" --repo "desktop-app-torbert-text-ai"
```
<!-- RA1-CODEBASE-SNAPSHOT:END -->
