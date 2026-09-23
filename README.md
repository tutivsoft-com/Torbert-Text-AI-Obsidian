# Torbert Text AI

Apply Markdown cleanup and text transformations in Obsidian, including summaries, folder classification, and reading highlights.

Version: `5.8.14` · [Complete user guide](./docs/USER_GUIDE.md) · [Transformation reference](./docs/TRANSFORMATIONS.md)

Canonical public repository: [`tutivsoft-com/Torbert-Text-AI-Obsidian`](https://github.com/tutivsoft-com/Torbert-Text-AI-Obsidian). This checkout contains the public release source and assets.

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
3. Choose **Torbert Text AI** and select a transformation. You can also search the command palette for `Torbert Text AI:` to find every transformation, restore the latest change, classify the current note, or inspect the current folder.
4. Configure the provider and API credentials in **Settings > Community plugins > Torbert Text AI**.

Folder operations show a preview before writing changes. Review AI-generated results before relying on them. For AI metadata and tags use Tundra; for AI note renaming use Denali; for proofreading use Culebra.

## Network Use and Privacy

AI transformations require network access to the provider selected in settings:

- OpenRouter requests use the configured base URL, normally `https://openrouter.ai/api/v1`, and send the selected note text or sampled note content to the chosen model.
- A manually entered API key takes precedence and is stored in Obsidian's local plugin data. When blank, Torbert may use its built-in encrypted fallback. The active key is sent only to the selected AI provider for requests.
- The plugin does not use client-side telemetry, Google Analytics, Matomo, advertising, self-updating, or dependency installation.
- The plugin reads and modifies Markdown files inside the current Obsidian vault only. It does not access files outside the vault.
- Optional debug logging writes operation details to `plugin.log` in the plugin directory. Disable it in the plugin settings if not needed.

## Billing

Torbert Text AI uses Constance (TutivSoft central billing) for one-time
character packs — no subscriptions. The current source uses app ID
`torbert-text-ai-obsidian`, account authentication, a stable linked
installation ID, server-authoritative free usage, and authenticated paid
spend. See the billing contract in the private source repository for the exact contract.

Each AI call charges its input character count (minimum one character). The plugin claims account free
usage through `/api/v1/billing/free-usage/claim`, spends purchased characters
through `/api/v1/billing/credits/spend`, and persists pending events so a lost
response is retried with the same event ID. Checkout uses a server-resolved
pack code and polls `/api/v1/billing/checkouts/{checkout_id}` after webhook
settlement. Do not document the old unsigned same-install spend route as the
current source behavior.

## Development

The private source repository contains the build scripts and tests. This public repository provides the complete reviewable source and release assets.

The release assets are `main.js`, `manifest.json`, and `styles.css`.

## License

This plugin is licensed under the MIT License. See [`LICENSE`](./LICENSE).

## Source

The plugin source is in [`src/`](./src/), with [`src/main.ts`](./src/main.ts)
as the entry point. The production bundle is generated from that source with
esbuild. Release assets are `main.js`, `manifest.json`, and `styles.css`.

GitHub release assets are attested by the repository workflow so their
provenance can be verified independently.

## Release source

This public checkout includes the reviewable TypeScript source and the built `main.js`. Development, tests, and release preparation take place in the private source repository before the public snapshot is updated.
