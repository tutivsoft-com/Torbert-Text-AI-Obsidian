# Torbert Text AI user guide

Current version: **5.8.61**.

## Start

1. Enable the plugin in Obsidian Community plugins.
2. Open its settings and configure the destination or operation as appropriate. Simple is the default; Advanced is optional.
3. Connect the account when the chosen operation needs account authorization.
4. Select text or open a Markdown note and run Text Cleanup / Bold to Highlight, or choose another transformation.

Local transformations run on selected or file text. AI transformations send the chosen text to OpenRouter. Review before applying is optional and off by default. Folder classification, weak-title/duplicate-note reports, custom prompts and Restore last change have separate command/menu entry points.

## Account and usage

Connect the existing Constance account in settings; registration can require email verification before signing in again. Billing account passwords are sent for authentication and are not persisted. Access/refresh session data and a stable installation identity are saved locally. Account free usage and purchased balance are determined by Constance; cached values and checkout return URLs do not create entitlement. Catalog displays current formatted names, prices, availability and exact price IDs. Unknown usage and checkout results retain their original identities for recovery.

Torbert meters input characters for AI actions using JavaScript string length. Charging order differs across editor, file, folder, classification and report workflows; a later failure can follow usage consumption. Stable event IDs are retained for debit recovery. Local transformations keep their existing local workflow.

## Troubleshooting

Help is available in settings and through Open documentation. Open plugin settings and Copy diagnostic log are command-palette fallbacks. Debug logging defaults off for a new installation; failures and full Error objects/stacks still appear in the local developer console. Timed information is enabled by the debug preference. The copyable diagnostic buffer keeps at most 1,000 summarized events and excludes raw error text, stacks, note text, paths and credentials. Full console exceptions can contain whatever the failed operation placed in its error. Logs are not uploaded automatically.

Use the console's plugin-name prefix and version to identify the failing stage. A catchable failure stops its affected action; retry after resolving the underlying problem. Historical build/install results apply to their recorded versions.

## Removal

Removing a plugin does not undo earlier file edits or recover an encryption password. Preserve any originals, backups, queues and recovery data you need before removing it. Account purchases remain associated with the account.

See plugin settings for implemented commands, settings defaults and privacy controls.
## MVP selection update — 6 October 2026

5.8.58: Reviewed recursive file/folder/mixed-selection handling and overlap deduplication. No functional source change was needed in this app.
