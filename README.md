# Torbert Text AI

Version: 5.8.42 — release source validated.

Torbert applies Markdown cleanup and text transformations in Obsidian, including summaries, folder classification, and reading highlights.


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

## Workflow defaults

AI output is applied when the user launches a transformation. Before-and-after previews are optional and off by default.

## License

MIT. See [`LICENSE`](./LICENSE).


## Manual installation

Download `main.js`, `manifest.json`, and `styles.css` from the matching published release and place them in `.obsidian/plugins/torbert-text-ai/`, then enable the plugin in Obsidian.
