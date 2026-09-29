# Torbert Text AI

Apply Markdown cleanup and text transformations in Obsidian, including summaries, folder classification, and reading highlights.

Version: `5.8.32` · [Complete user guide](./docs/USER_GUIDE.md) · [Transformation reference](./docs/TRANSFORMATIONS.md)

Canonical public repository: [`tutivsoft-com/Torbert-Text-AI-Obsidian`](https://github.com/tutivsoft-com/Torbert-Text-AI-Obsidian).

## Features

- Transform selected text, the current note, Markdown files, or folders.
- Use non-AI Markdown cleanup tools such as formatting conversion, URL tools, duplicate-line removal, numbering repair, and title checks.
- Use OpenRouter for optional AI transformations.
- Apply folder changes when launched and restore the last operation with Undo.
- Restore recent plugin changes from the command palette.
- Store a manually entered API key in Obsidian's local plugin settings; the configured provider is used when the field is blank.
- Inspect the active AI text excerpt and elapsed time in the request queue, and clear waiting actions while the current one finishes.

## Usage

1. Install and enable Torbert Text AI.
2. Open the editor, file explorer, or folder context menu.
3. Choose **Torbert Text AI** and select a transformation. You can also search the command palette for `Torbert Text AI:` to find every transformation, restore the latest change, classify the current note, or inspect the current folder.
4. Optionally change the provider and API credentials in **Settings > Community plugins > Torbert Text AI**.

Folder operations run when launched and can be restored with Undo. Before/after approval windows are off by default; enable **Review before applying** in settings when you want them. For AI metadata and tags use Tundra; for AI note renaming use Denali; for proofreading use Culebra.

## Network Use and Privacy

AI transformations require network access to the provider selected in settings:

- OpenRouter requests use the configured base URL, normally `https://openrouter.ai/api/v1`, and send the selected note text or sampled note content to the chosen model.
- A manually entered API key takes precedence and is stored in Obsidian's local plugin data. When no personal key is entered, Torbert may use a limited service-managed key. The active key is sent only to the selected AI provider for requests.
- The plugin does not use client-side telemetry, Google Analytics, Matomo, advertising, self-updating, or dependency installation.
- The plugin reads and modifies Markdown files inside the current Obsidian vault only. It does not access files outside the vault.
- Optional debug logging writes operation details to `plugin.log` in the plugin directory. Disable it in the plugin settings if not needed.

## Billing

Torbert Text AI uses Constance for optional account-linked character credits and one-time packs. Sign in from plugin settings to check your balance and make purchases. Before sending text for an AI transformation, Torbert checks that account usage can be verified and stops if it cannot. Usage is claimed or spent only when you accept a result for applying. Current prices appear during checkout.

## License

This plugin is licensed under the MIT License. See [`LICENSE`](./LICENSE).

## Workflow defaults (v5.8.32)

Torbert applies transformations directly by default. Before-and-after batch previews are optional and off by default in Settings.
<!-- one-click-workflow:end -->
