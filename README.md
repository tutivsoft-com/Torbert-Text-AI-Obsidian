# Torbert Text AI

Version: 5.8.49. Validated for publication; release pending.

Torbert applies Markdown cleanup and text transformations in Obsidian, including summaries, folder classification, and reading highlights.


Canonical public repository: [`tutivsoft-com/Torbert-Text-AI-Obsidian`](https://github.com/tutivsoft-com/Torbert-Text-AI-Obsidian).

## Features

- Transform selected text, the current note, Markdown files, or folders.
- Use Markdown cleanup tools such as formatting conversion, URL tools, duplicate-line removal, numbering repair, and title checks.
- Run optional AI transformations through OpenRouter.
- Apply folder changes when launched and restore the last operation with Undo.
- Inspect active AI requests and clear waiting actions.

## AI provider

AI requests go directly from the plugin to OpenRouter. An optional personal key takes priority; when the key setting is blank, Torbert uses its existing encrypted Pattern B key manifest. Advanced settings retain provider preferences; the actual request model is fixed to `~openai/gpt-luna-latest`. Constance does not proxy AI requests or choose the model.

## Billing

Constance handles account authentication, free and purchased character entitlements, usage debits, and Paddle checkout. Before an AI request, Torbert checks the account's available characters. It records the usage debit through Constance before applying the result. A failed provider request does not submit a usage debit, and an uncertain billing event is retried with the same event ID.

The current offers are 20,000, 60,000, 180,000, and 450,000 characters. Purchase settings load current Paddle prices, descriptions, and availability from Constance; the client submits only the selected configured price ID. Prices are not hard-coded in the plugin. Payment fulfillment is confirmed through Paddle's verified webhook and the account balance is refreshed from Constance.

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


### Getting started with your account

Select text or open a Markdown note, then choose a Torbert transformation. You can undo the changes. Create an account or sign in in the plugin settings, verify your email if requested, then connect. Free AI usage requires a registered, connected account to help prevent abuse. The default lifetime allowance is 2,000 AI characters per account as our thank-you for trying the app; settings check the current policy and account balance. You can add credits at affordable prices once you are ready; the current offers and prices load in settings. Setup guidance stays visible until connected, and the welcome appears only once.

## Account lifetime allowance

2,000 characters lifetime per account. Characters in the completed operation. Existing allowance consumption survives upgrades and reinstalls; lifetime allowances do not refill daily. Free units are used first and purchased units cover the remainder of the same operation. Native writes retain reserve, write, verify and finalize safeguards. Uncertain results retain the original event for recovery. The app retains its existing review and result-authorization workflow.

The allowance belongs to the account and does not reset daily or after reinstalling. Free units are consumed first; purchased units cover the remainder. Current prices and available offers load from Constance in settings.
