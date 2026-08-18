# Torbert Text AI

Apply Markdown cleanup and text transformations in Obsidian, including AI-assisted correction, summaries, tags, filenames, frontmatter, folder classification, and reading highlights.

## Features

- Transform selected text, the current note, Markdown files, or folders.
- Use non-AI Markdown cleanup tools such as formatting conversion, URL tools, duplicate-line removal, numbering repair, and title checks.
- Use OpenRouter for optional AI transformations.
- Preview recursive folder changes before applying them.
- Restore recent plugin changes from the command palette.
- Store API keys in Obsidian's local plugin settings.

## Usage

1. Install and enable Torbert Text AI.
2. Open the editor, file explorer, or folder context menu.
3. Choose **Torbert Text AI** and select a transformation, or use the command palette.
4. Configure the provider and API credentials in **Settings > Community plugins > Torbert Text AI**.

Folder operations show a preview before writing changes. Review AI-generated results before relying on them.

## Network Use and Privacy

AI transformations require network access to the provider selected in settings:

- OpenRouter requests use the configured base URL, normally `https://openrouter.ai/api/v1`, and send the selected note text or sampled note content to the chosen model.
- API keys are entered by the user and stored in Obsidian's local plugin data. They are sent only to the selected AI provider for requests.
- The plugin does not use client-side telemetry, Google Analytics, Matomo, advertising, self-updating, or dependency installation.
- The plugin reads and modifies Markdown files inside the current Obsidian vault only. It does not access files outside the vault.
- Optional debug logging writes operation details to `plugin.log` in the plugin directory. Disable it in the plugin settings if not needed.

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

## Public Repository Checklist

This folder is the complete public repository staging folder. Copy its contents
into the public repository root, including the complete `src/` tree and
`.github/workflows/`. Do not upload credentials, logs, `node_modules`, or
private project metadata.

For each release, upload only `main.js`, `manifest.json`, and `styles.css` as
release assets. The release tag must exactly match the `version` in
`manifest.json`.
