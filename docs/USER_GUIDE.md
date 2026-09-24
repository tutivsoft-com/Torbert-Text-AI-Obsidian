# Torbert Text AI — user guide

## What Torbert does

Torbert provides small, predictable Markdown transformations plus optional AI actions for notes and folders. A chosen transformation applies when launched, and the latest applied operation can be restored.

## Choose an action

- In the editor, right-click selected text or the current note.
- In the file explorer, right-click a Markdown file or folder.
- In the command palette, search `Torbert Text AI:`. Every registered transformation has its own categorized entry.

The **Torbert Text AI** context submenu is organized into **AI**, **Text Cleanup**, and **Markdown Notes**. Saved prompt presets are grouped under **Saved prompt presets**.

## Text Cleanup examples

- **Title Case**, **UPPERCASE**, **lowercase**, and **Sentence Case** normalize text.
- **Sort Lines A-Z** and **Sort Lines Z-A** reorder lines.
- **Remove Duplicate Lines**, **Remove Similar Lines**, **Remove Blank Lines**, and **Clean Extra Newlines** tidy notes.
- **Highlight Keywords** uses the keywords configured in settings.
- **Slugify**, **Straight Quotes**, **URL Encode**, and **URL Decode** prepare text for links and systems.

Example:

```text
Urgent:  https://example.com
Urgent:  https://example.com
```

After **Remove Duplicate Lines** and **Clean Extra Newlines**:

```text
Urgent: https://example.com
```

## Markdown Notes examples

- Convert lines to bullets or bullets to numbers.
- Increase/decrease heading levels.
- Fix Markdown numbering and structure.
- Toggle checkboxes.
- Extract action items or URLs.
- On a folder, find weak titles or likely duplicate notes.

Example:

```markdown
Follow up with Maya by Friday
Review contract
```

**Extract Actions** creates an `## Action Items` section so the next steps are easy to find.

## AI features

AI actions include reading highlights, summaries, summary prefixes, folder classification, and saved prompt presets. AI metadata and tags belong in Tundra, note renaming in Denali, and proofreading in Culebra.

AI actions send selected or note content to the configured provider when launched. Use Restore last change if you need to undo the result.

## Restore and billing

Torbert applies a user-initiated transformation without a second preview dialog. If a note changes during processing, Torbert keeps the newer text. Use **Restore last change** to undo the latest applied operation.

AI actions use character-based credits. Settings show the balance, one-time packs, provider configuration, privacy explanation, and optional debug logging.

## Safe workflow

1. Test a transformation on a copied note.
2. Let Torbert apply the result.
3. Check dates, names, links, code blocks, and frontmatter.
4. Restore the latest operation if the result is not wanted.
5. Restore the latest operation if needed.

<!-- one-click-workflow:start -->
## Workflow defaults (v5.8.21)

Torbert applies transformations directly by default. Before-and-after batch previews are optional and off by default in Settings.
<!-- one-click-workflow:end -->
