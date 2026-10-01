<!-- SETTINGS-CURRENT-2026-09-30 -->
## Current local settings implementation

The local working tree uses persisted **Simple** and **Advanced** modes; new installs default to Simple. Simple shows everyday workflow and account/billing controls; Advanced adds customization and diagnostics. Review-before-apply remains off by default in current source; explicit saved preferences remain in effect.

Managed AI runs through Constance with a server-selected model and bounded output. The plugin never fetches or decrypts a provider key. Guest previews remain in memory while open; sign up, verify email and authorize the displayed allowance split to reveal the exact result. Later apply/save of that result incurs no second charge. Prices and quantities refresh from Paddle through Constance. Lifetime starter use does not refill daily.

This describes local source changes, not a published release or verified live deployment.
Managed AI runs through Constance with a server-selected model and bounded output. The plugin never fetches or decrypts a provider key. Guest previews remain in memory while open; sign up, verify email and authorize the displayed allowance split to reveal the exact result. Later apply/save of that result incurs no second charge. Prices and quantities refresh from Paddle through Constance. Lifetime starter use does not refill daily.

<!-- SETTINGS-CURRENT-2026-09-30:END -->

<!-- BILLING-CURRENT-2026-09-30 -->
## Current local account and billing behavior

Use **Connect** with your email and password. A new account is registered; an existing account is authenticated. New users must follow the emailed verification link and Connect again. Incorrect passwords offer password recovery; passwords are never saved. Paid purchases and free allowances belong to the authenticated account, not a locally entered email or an editable cached balance. Reinstalling does not replenish the same account's allowance.

Constance is the billing authority. Credit units remain app-specific: characters, OCR pages, searches, conversions, repair/protection batches, or captures. Checkout return URLs and cached balances never grant credits. Payment fulfillment comes from the server’s verified Paddle webhook, and balances refresh from authenticated entitlements. Unknown usage or checkout results reuse the persisted operation ID; they must not create a new debit or alternative checkout.


See [local billing changes](../BILLING_REVIEW_2026-09-30.md). This section describes the current local source; older release walkthroughs below apply to their dated artifacts. Constance must support `/api/v1/auth/connect` before these clients are released.
<!-- BILLING-CURRENT-2026-09-30:END -->

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

The AI request queue opens automatically when an AI action starts. It shows the submitted text excerpt, elapsed seconds, batch progress, and completion status. Overlapping AI actions run one at a time; clear waiting actions from the queue while the active action finishes. Reopen it from Settings or the command palette.

## Restore and billing

Torbert applies a user-initiated transformation without a second preview dialog. If a note changes during processing, Torbert keeps the newer text. Use **Restore last change** to undo the latest applied operation.

Account and billing controls appear at the top of plugin settings. Select Connect with your email and password; verify the emailed link if requested, then Connect again. Settings keep balance refresh, sign-out, and one-time character packs together; metered AI actions report usage and the remaining balance. Constance selects the managed model; menu preferences, privacy details and debug logging are in Advanced.

## Safe workflow

1. Test a transformation on a copied note.
2. Let Torbert apply the result.
3. Check dates, names, links, code blocks, and frontmatter.
4. Restore the latest operation if the result is not wanted.

<!-- one-click-workflow:start -->
## Workflow defaults (v5.8.36)

Torbert requires authorization before revealing a full result or applying a transformation. Before-and-after batch previews are optional and off by default in Settings.
<!-- one-click-workflow:end -->
