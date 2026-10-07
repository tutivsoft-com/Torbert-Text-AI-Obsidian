## 5.8.61 — 2026-10-08

- Refresh the public product documentation and synchronize release metadata.
- Preserve the existing plugin behavior.

## 5.8.60 — loyalty offer copy flow (2026-10-07, published)

A static coupon offer includes a Copy code action. Server catalog prices and checkout remain authoritative.

## 5.8.54 — settings layout, 2026-10-06 (historical source update)


## 5.8.53 — documentation and version synchronization (2026-10-06)

- Replace contradictory current-state documentation with references derived from the current code, commands, settings and dependency closure.
- Remove superseded guidance and unsupported model/source inferences; retain dated validation evidence with its original version.

## 5.8.52 — error recovery (2026-10-06, private/local)

- Guard host callbacks and detached background work against synchronous errors and Promise rejections; preserve internal transaction failure propagation.
- Print full error objects/stacks in the local console, retain bounded summary-only copied logs, and avoid assimilating fluent Setting values as Promises.
- Add fault-injection tests and scope global runtime reports to their originating plugin.

## 5.8.51 — diagnostic logging (2026-10-06)



Short first-use guidance, direct Help/account navigation, optional Advanced settings, and clearer recovery/removal instructions.

# Release notes

## 5.8.49 — Source preparation (2026-10-05)

- Incremented source metadata from 5.8.48 and synchronized the existing version surfaces.
- Reconciled current documentation with the model, account/billing path and release state in code.

## 5.8.43 — Transformation guide version correction

- Correct the current transformation reference version; its content was checked against the matching unchanged implementation.


## 5.8.42 — Constance account recovery

- Save successful account sessions before installation linking; preserve sessions when billing is temporarily unavailable and clear tokens rejected by the server.
- Preserve structured account error codes and show accurate sign-in and email-verification guidance.

## 5.8.40 — Release packaging update (2026-10-02)

- Synchronized source version metadata and current documentation only; no runtime implementation changed.
- Rebuilt and validated this release package at 5.8.40. No runtime behavior changed.

## 5.8.39 — Billing balance refresh and checkout settlement

- Load the authenticated entitlement balance on settings open and refresh the visible balance when checkout settles.
- Show the approved 50,000, 150,000, 450,000, and 1,200,000 character offers using current Paddle prices and descriptions from Constance; submit the selected exact price ID.

## 5.8.34 — Billing session and verification fixes

- Persist and rotate refresh tokens before access expiry; clear and revoke the complete session on sign out.
- Registration requiring verification stays pending and cannot link an installation.
- Lock the signed-in email until sign out and expose central password recovery.

## 5.8.38 — Direct OpenRouter and billing boundary

- Restore direct OpenRouter requests using Torbert's established managed-key manifest or an optional personal key.
- Keep Constance focused on account access, character balances and usage debits, and Paddle checkout.
- Validate blank input and preserve the existing charge and write order.
- Display current Paddle offer details and submit the configured price ID through authenticated Constance checkout.


## 5.8.32 — Account and credit clarity

- Moved account and billing controls to the top of settings.
- Simplified account controls to email, password, Register, Sign in, Sign out, balance refresh, and purchase buttons.
- Registration now explains that the user must confirm the email link and then sign in.
- Credit balances stay visible, and metered work reports usage and the remaining balance.

## 5.8.23 - 2026-09-25

- Synchronized version metadata and the packaged runtime across the source and public release repositories.


## 5.8.22 - 2026-09-25

- Added a live AI action queue with text excerpts, elapsed time, batch progress, completion status, and a control to clear waiting actions.


## 5.8.14 - 2026-09-23

- Torbert commands now have short, clear names in Obsidian's command palette and context menus.
- Startup errors now identify Torbert correctly.

## 5.8.13 - 2026-09-23

- Focused Torbert on text transformations, summaries, reading highlights, folder classification, and reports. AI metadata and tags, note renaming, and proofreading now belong to their dedicated plugins.
- Corrected character billing documentation and aligned checkout pack codes with the live catalog.
- Made checkout retries resumable using a stable idempotency key.

## 5.8.12 - 2026-09-21

Billing compatibility patch: one-time character packs now use Constance's
authenticated server-resolved pack codes, idempotent checkout creation, and
checkout settlement polling. Paid credit spends include the required
idempotency key.

## 5.8.5 - 2026-09-20

Metadata-only patch preparation: synchronized all version surfaces and the
current release documentation. No runtime behavior changed.

## 5.8.4 - 2026-09-20

Metadata-only release: synchronized the source and public bundle version
surfaces for the next Obsidian Community release.

## 5.8.3 - 2026-09-12

Metadata-only release bump: canonical, package, manifest, and publish version surfaces are synchronized. No runtime behavior changed.
## 5.8.10 - 2026-09-21

- Incremented the release version and synchronized the source-inclusive public artifact.
- Verified build, tests, syntax, and release metadata before publication.


## 5.8.2 - 2026-09-11

Maintenance release: includes the complete TypeScript source in the TutivSoft release repository and preserves the verified `main.js`, `manifest.json`, and `styles.css` assets. Obsidian's automated checks completed; an immediate automated recheck request is open as of 2026-09-11.

## 5.8.1 - 2026-09-11

Usability patch: organized commands and menus, added complete examples and user documentation, improved preview safety, and synchronized published assets.

## 5.8.0 - 2026-08-22

Built-in AI key fallback: when no OpenRouter API key is manually configured
in settings, the plugin now automatically fetches and decrypts its own
dedicated key from an encrypted manifest hosted on GitHub, instead of
requiring every user to bring their own key. A manually-configured key
still always takes priority. No change to the OpenRouter endpoint or model.

## 5.7.2 - 2026-08-20

- Corrected a billing-catalog identity mismatch that prevented character-pack checkout.
## 5.7.1 - 2026-08-20

- Updated plugin version metadata while preserving the feature behavior from 5.7.0.

## 5.6.0 - 2026-08-18

- Uses OpenRouter Chat Completions with `openai/gpt-5-mini` and the user-configured Torbert credential.
- The OpenRouter credential is stored in local plugin settings.

## 5.5.1

This patch release hardens the full-text AI workflow:

- Large note edits now chunk on paragraph or line boundaries where possible and stitch only the returned chunk bodies.
- Full-text commands use the large-content model setting, while sampled commands stay on the normal model.
- AI requests now log token and character usage, plus suspicious character-delta warnings for debugging.

## 5.5.0

This release adds configurable OpenRouter AI support:

- Configure OpenRouter from the AI settings.
- Configure the OpenRouter key, base URL, and model fields in one place.
- Keep the same transformation set and menu layout while switching providers.

## 5.4.2

This patch release cleans up the menu structure and wording so the plugin is easier to scan in Obsidian:

- Reorganized the shared menu model into `AI`, `Text Cleanup`, and `Markdown Notes`.
- Shortened the AI action labels and kept the inverse AI summary-prefix helper in the AI bucket.
- Aligned the menu naming with the Python mirror and added a local handoff note for future maintenance.

## 5.4.1

This patch release keeps the current feature set stable while syncing versioned metadata:

- Updated the package manifest, lockfile, `VERSION`, and docs to `5.4.1`.
- No functional behavior changes from `5.4.0`.

## 5.4.0

This release expands the plugin into a broader note cleanup and organization toolkit:

- Generate concise AI note summaries and AI-only tag updates from note content.
- Classify notes into target folders, preview batch changes before applying them, and write batch report notes after folder operations.
- Detect weak titles, surface likely duplicate notes, clean Markdown structure, extract action items, and run custom named AI prompt presets.

## 5.3.0

This release adds file organization features:

- Rename Markdown files from their contents with AI-generated, searchable filenames.
- Create or update useful YAML frontmatter from sampled note content.
- Restore the last Torbert Text AI operation from a saved history stack.

## 5.2.0

This release adds batch-ready text cleanup tools:

- Transform Markdown files directly from file menus or recursively from folder menus.
- Highlight configured keywords, remove all highlights, clean accidental extra new lines, fix Markdown ordered-list numbering, and remove 90% similar duplicate lines.
- Use OpenAI-powered cleanup for meaning-preserving correction and stricter spelling/casing/grammar-only correction after adding an API key in settings.

## 5.1.1

This release keeps the plugin behavior unchanged while making the codebase much easier to work on:

- `main.js` is now generated from TypeScript source in `src/`.
- The text transformations are documented with sample inputs and outputs.
- The generated bundle was compared against the original bundle with sample cases, and the outputs matched.

## Workflow defaults

Torbert applies transformations directly by default. Before-and-after batch previews are optional and off by default in Settings.

## MVP selection update — 6 October 2026

5.8.58: Reviewed recursive file/folder/mixed-selection handling and overlap deduplication. No functional source change was needed in this app.
