# Torbert Text AI 5.8.86 desktop UI verification

Tested on 24 November 2026 in Windows Obsidian 1.15.1, with a small provider follow-up on 26 November. The plugin ran in a separate profile with a synthetic Markdown vault. The runner clicked the rendered Obsidian controls and checked editor text, saved files, plugin preferences, action notices, and responses to synthetic account and checkout requests.

## Release identity

The installed files, GitHub downloads, public primary blobs, and immutable `5.8.86` tag blobs matched byte for byte. The public tag resolves to `a6c649adc79851fbf5267e4d81ab9cdc77eadf1a`. The starting primary was `dfbbacfd76cb95ab30f719f20d7f8ded970199d8`. [GitHub release](https://github.com/tutivsoft-com/Torbert-Text-AI-Obsidian/releases/tag/5.8.86).

| File | SHA-256 |
| --- | --- |
| `main.js` | `a2b24ca9c28ae015bed1d5e280a35009ceb89ea64b15be54680239c85be98f73` |
| `manifest.json` | `7e4c4a1da8453df1e8dedbba0a5c8bcd67f1f264df3a4a5ac2bb59972180f527` |
| `styles.css` | `3acb0dd8335dbf481d44bc3099ff93f8aaf890feb69f0c7e92b1a2f4ccf3a54f` |

## Results

| Area | Desktop result |
| --- | --- |
| Startup and settings | Passed the first-vault enable prompt, Simple and Advanced modes, saving keywords, allowed classification folders and a custom preset, six preferences and both states of all 32 transformation toggles. |
| Help and diagnostics | Open Help, its account and command actions, settings and account palette shortcuts, both copy-log entries and the debug toggle operated. The captured diagnostic text included the version and omitted the synthetic account and fixture path. |
| Editor | Passed 28 standalone transformation commands plus the selected-text Bold to Highlight and restore cases. Invalid URL decoding preserved the original text and showed an error. |
| Explorer and batch | The file menu edited and restored one note. The folder menu changed two notes, showed a two-file count, restored both notes and preserved the untouched note. |
| Reports | The weak-title report opened and listed the fixture note. The initial duplicate-report check generated a file, but its fixture assertion did not pass. |
| Account | Invalid-account registration, pending verification, connection, password omission from saved data, and successful reset and verification request notices passed with synthetic responses. |
| Credits | Unavailable catalog hid purchase buttons. Signed-out pricing disabled purchase, and unavailable offers stayed disabled. In the signed-in fixture, payment-status refresh, cancellation, new purchase, canonical fulfillment, and balance refresh passed. |
| AI queue | The Settings button opened the empty queue and Close dismissed it. |
| AI summary | A single synthetic provider request used a 12-character note, a 60-character user message and an 18-character reply. The editor added the summary and restored the original note. After sign-out, the same command preserved the note and issued no provider request. |

The 28 local palette results covered keyword highlights, removing highlights, title/upper/lower/sentence case, both sort orders, checkboxes, duplicate/blank/similar lines, extra newlines, joining lines, trim, increasing/decreasing headings, bullets, numbering, Markdown cleanup, extracting actions and URLs, removing an AI summary prefix, slugs, straight quotes, and URL encoding and decoding.

## Confirmed issues

On 5.8.86, open Settings > Account and billing and click **Send email** under **Forgot password?**. A controlled HTTP 503 caused one request and produced no inline error or notice. The successful fixture showed the queued-email notice. This leaves the user without feedback when recovery fails. The finding was handed to the Torbert source maintainer for correction before a future public release.

The **OpenRouter API key** field in Advanced settings is an unmasked text input. Entered synthetic characters remained visible in the rendered control. No real key was entered or captured. This finding was also handed to the source maintainer.

While signed out, **AI Note Summary** shows “The transformation could not be applied” without identifying that the user needs to connect an account. The note stayed intact and the provider request count stayed fixed.

Live account verification, payments, production OpenRouter, and mobile remain outside this verified pass. The nested editor menu, duplicate-note result, custom prompt execution, and active queue behavior require follow-up. This commit adds audit evidence only.

## Screenshots

The ten WebP files are original Obsidian viewport captures from the same Windows run and recovery session. They show synthetic text and account data.

1. [Simple settings](screens/01-simple-settings.webp)
2. [Help](screens/02-help.webp)
3. [Advanced settings](screens/03-advanced-settings.webp)
4. [Command palette](screens/04-command-palette.webp)
5. [Selected text transformed](screens/05-selection-transformed.webp)
6. [Account verification pending](screens/06-account-verification.webp)
7. [Synthetic checkout pending](screens/07-checkout-pending.webp)
8. [File explorer context menu](screens/08-file-context.webp)
9. [Weak titles report](screens/09-weak-titles-report.webp)
10. [Empty AI request queue](screens/10-ai-queue.webp)
