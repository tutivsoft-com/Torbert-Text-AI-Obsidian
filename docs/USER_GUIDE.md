# Torbert Text AI — user guide

## What Torbert does

Torbert provides Markdown cleanup and optional AI transformations for notes and folders. A chosen transformation applies when launched, and the latest applied operation can be restored.

## Choose an action

- In the editor, right-click selected text or the current note.
- In the file explorer, right-click a Markdown file or folder.
- In the command palette, search `Torbert Text AI:`.

The context menu groups actions under **AI**, **Text Cleanup**, and **Markdown Notes**. Saved prompt presets appear under their own group.

## Text cleanup

Text cleanup includes case conversion, sorting, duplicate and blank-line removal, keyword highlighting, URL encoding and decoding, slug creation, and quote conversion.

## Markdown notes

Markdown actions include heading and list conversion, numbering repair, structure cleanup, checkboxes, action items, URL extraction, weak-title detection, and likely duplicate-note detection.

## AI features

AI actions include reading highlights, summaries, summary prefixes, folder classification, and saved prompt presets. For frontmatter and tags use Tundra; for note renaming use Denali; for proofreading use Culebra.

Torbert sends the selected text or note content directly to OpenRouter when an AI action runs. The optional personal API key takes priority. If that setting is blank, Torbert retrieves its managed key from the established encrypted Pattern B manifest. Provider and model controls are in Advanced settings. Constance does not proxy AI requests or select the model.

The AI request queue shows the submitted text excerpt, elapsed time, batch progress, and completion status. Actions run one at a time; clear waiting actions while the active request finishes.

## Account and billing

Connect a billing account in plugin settings. Verify the email link if requested, then connect again. Constance supplies free and purchased character balances and processes usage debits and Paddle checkouts. Torbert offers 50,000, 150,000, 450,000, and 1,200,000 characters per purchase. Current Paddle amounts, descriptions, and availability load through Constance. An AI result is charged before it is applied; a failed provider request does not submit a usage debit.

## Restore and safe workflow

If a note changes while an action is running, Torbert keeps the newer text. Use **Restore last change** to undo the latest applied operation.

1. Test a transformation on a copied note.
2. Check dates, names, links, code blocks, and frontmatter.
3. Restore the latest operation if the result is not wanted.

<!-- one-click-workflow:start -->
## Workflow defaults (v5.8.41)

AI output is applied when the user launches a transformation. Before-and-after previews are optional and off by default.
<!-- one-click-workflow:end -->
