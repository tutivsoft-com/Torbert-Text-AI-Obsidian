# Torbert Text AI

Apply Markdown cleanup and text transformations in Obsidian, including AI-assisted correction, summaries, tags, filenames, frontmatter, folder classification, and reading highlights.

Version: `5.8.2` · [Complete user guide](./docs/USER_GUIDE.md) · [Transformation reference](./docs/TRANSFORMATIONS.md)

Canonical public repository: [`tutivsoft-com/Torbert-Text-AI-Obsidian`](https://github.com/tutivsoft-com/Torbert-Text-AI-Obsidian). This checkout is the private/source mirror.

## Features

- Transform selected text, the current note, Markdown files, or folders.
- Use non-AI Markdown cleanup tools such as formatting conversion, URL tools, duplicate-line removal, numbering repair, and title checks.
- Use OpenRouter for optional AI transformations.
- Preview recursive folder changes before applying them.
- Restore recent plugin changes from the command palette.
- Store a manually entered API key in Obsidian's local plugin settings; a built-in encrypted fallback may be available when the field is blank.

## Usage

1. Install and enable Torbert Text AI.
2. Open the editor, file explorer, or folder context menu.
3. Choose **Torbert Text AI** and select a transformation. You can also search the command palette for `Torbert Text AI:` to find every transformation, restore the latest change, rename/classify the current note, or inspect the current folder.
4. Configure the provider and API credentials in **Settings > Community plugins > Torbert Text AI**.

Folder operations show a preview before writing changes. Review AI-generated results before relying on them.

## Network Use and Privacy

AI transformations require network access to the provider selected in settings:

- OpenRouter requests use the configured base URL, normally `https://openrouter.ai/api/v1`, and send the selected note text or sampled note content to the chosen model.
- A manually entered API key takes precedence and is stored in Obsidian's local plugin data. When blank, Torbert may use its built-in encrypted fallback. The active key is sent only to the selected AI provider for requests.
- The plugin does not use client-side telemetry, Google Analytics, Matomo, advertising, self-updating, or dependency installation.
- The plugin reads and modifies Markdown files inside the current Obsidian vault only. It does not access files outside the vault.
- Optional debug logging writes operation details to `plugin.log` in the plugin directory. Disable it in the plugin settings if not needed.

## Billing

Torbert Text AI uses Constance (TutivSoft central billing) for one-time
character packs — no subscriptions. Packs are $1 (20,000 characters), $5
(160,000 characters), and $15 (640,000 characters), provisioned live in the
Constance catalog (`App_Active=Yes`, `App_Environment=live`). Buy buttons in
the settings tab open a real Constance `/buy` checkout.

Spend is character-based: each AI call costs `ceil(chars/1000)` credits. New
installs get a local-only grant of 2,000 free characters; once that pool is
spent, calls draw from the Constance-backed purchased balance via the unsigned
same-install browser endpoints (`/api/v1/public/browser/entitlements` for
balance reads, `/api/v1/public/browser/credits/spend` for spends; the
`torbert-text-ai` catalog row has `App_Allow_Unsigned_Browser_Credit_Spend=Yes`).
Network errors fail open; a confirmed insufficient balance (HTTP 402/404)
blocks the call with a notice.

## Development

```bash
npm install
npm run typecheck
npm run build
npm test
```

The release assets are `main.js`, `manifest.json`, and `styles.css`.

## License

This plugin is licensed under the MIT License. See [`LICENSE`](./LICENSE).

## Source

The plugin source is in [`src/`](./src/), with [`src/main.ts`](./src/main.ts)
as the entry point. The production bundle is generated from that source with
esbuild. Release assets are `main.js`, `manifest.json`, and `styles.css`.

GitHub release assets are attested by the repository workflow so their
provenance can be verified independently.

## Public Repository Workflow

This checkout is the private/source repository. Copy the contents of
[`publish/`](./publish/) into the root of the separate public GitHub repository.
Never copy API keys, credentials, `plugin.log`, `node_modules`, or private
project metadata.

The public root needs `README.md`, `LICENSE`, `manifest.json`, the complete
`src/` source tree, `main.js`, `styles.css`, and
`.github/workflows/release-attestations.yml`. For each release, upload only
`main.js`, `manifest.json`, and `styles.css` as release assets. The release tag
must exactly match the `version` in `manifest.json`.
