# Torbert Text AI

Apply local text and Markdown transformations, with optional AI reading highlights, summaries, classification and custom prompts.

Current version: **5.8.60**.

## First use

Enable the plugin and use its settings page. Simple is the default settings mode; Advanced exposes optional configuration. Select text or open a Markdown note and run Text Cleanup / Bold to Highlight, or choose another transformation.

Local transformations run on selected or file text. AI transformations send the chosen text to OpenRouter. Review before applying is optional and off by default. Folder classification, weak-title/duplicate-note reports, custom prompts and Restore last change have separate command/menu entry points.

## Account and processing

AI requests go directly to OpenRouter using the fixed request model `~openai/gpt-luna-latest`. Torbert retains an optional personal OpenRouter key with its existing managed-key fallback. Constance handles account and billing operations.

Torbert meters input characters for AI actions using JavaScript string length. Charging order differs across editor, file, folder, classification and report workflows; a later failure can follow usage consumption. Stable event IDs are retained for debit recovery. Local transformations keep their existing local workflow.

Connect the existing Constance account in settings; registration can require email verification before signing in again. Billing account passwords are sent for authentication and are not persisted. Access/refresh session data and a stable installation identity are saved locally. Account free usage and purchased balance are determined by Constance; cached values and checkout return URLs do not create entitlement. Catalog displays current formatted names, prices, availability and exact price IDs. Unknown usage and checkout results retain their original identities for recovery.

## Diagnostics

Help is available in settings and through Open documentation. Open plugin settings and Copy full debug log are command-palette fallbacks. Debug logging defaults off for a new installation; failures and full Error objects/stacks still appear in the local developer console. Timed information is enabled by the debug preference. The copyable diagnostic buffer keeps at most 1,000 summarized events and excludes raw error text, stacks, note text, paths and credentials. Full console exceptions can contain whatever the failed operation placed in its error. Logs are not uploaded automatically.

## Documentation

- [User guide](docs/USER_GUIDE.md)
- [Implemented transformations](docs/TRANSFORMATIONS.md)

License terms are in LICENSE.
