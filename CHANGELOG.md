# Changelog

## 5.8.49 — Source preparation (2026-10-05)

- Incremented source metadata from 5.8.48 and synchronized the existing version surfaces.
- Reconciled current documentation with the model, account/billing path and release state in code.
- Built and validated version 5.8.49 for publication; release pending. Earlier receipts remain tied to their original source.

## 5.8.44 — 2026-10-04

Display each Paddle price name with its live description and amount. Private build validated; store publication remains separate.

## 5.8.43 — Transformation guide version correction

- Correct the current transformation reference version; the implementation is unchanged from 5.8.41.


## 5.8.42 — Constance account recovery

- Save successful account sessions before installation linking; preserve sessions when billing is temporarily unavailable and clear tokens rejected by the server.
- Preserve structured account error codes and show accurate sign-in and email-verification guidance.

## 5.8.40 — Release packaging update (2026-10-02)

- Synchronized source version metadata and current documentation only; no runtime implementation changed.
- Rebuilt and validated this release package at 5.8.40. No runtime behavior changed.

## 5.8.39 (2026-10-02)

- Refresh the displayed native-unit balance when billing settings open and after checkout reaches a terminal result.
- Preserve provider catalog pricing and checkout selection by exact configured Paddle price ID.

## 5.8.38 (2026-10-02)

- Restore direct OpenRouter requests with Torbert's existing managed-key manifest and optional personal key; Constance remains responsible for billing only.
- Validate blank AI input, preserve timeout handling, and retain existing character charge and write ordering.
- Keep purchase details current from Constance's Paddle metadata and verify the configured exact price ID before checkout.

## 5.8.37 (2026-10-02)

- Show current one-time offers from Constance provider prices, joined to each app's native billing units by exact price ID; submit checkout with that ID and preserve pending checkout recovery.


- Persist and rotate refresh tokens before access expiry; clear and revoke the complete session on sign out.
- Registration requiring verification stays pending and cannot link an installation.
- Lock the signed-in email until sign out and expose central password recovery.

## 5.8.32 — Account and credit clarity

- Moved account and billing controls to the top of settings.
- Simplified account controls to email, password, Register, Sign in, Sign out, balance refresh, and purchase buttons.
- Registration now explains that the user must confirm the email link and then sign in.
- Credit balances stay visible, and metered work reports usage and the remaining balance.

## 5.8.27 (2026-09-26)

- Published the complete TypeScript source needed to review the generated bundle; no plugin behavior changed.

## 5.8.26 (2026-09-26)

- Updated version metadata and raised the development-only esbuild dependency to 0.28.2 to resolve the low severity npm advisory. No plugin behavior changed.


## 5.8.25 (2026-09-25)

- Updated app version metadata.

## 5.8.24 (2026-09-25)

- Added privacy-safe, copyable session diagnostics in settings and the command palette, with command and runtime error logging.

## 5.8.23 (2026-09-25)

- Synchronized version metadata and the packaged runtime across the source and public release repositories.


## 5.8.22 (2026-09-25)

- Show AI actions in a live queue with submitted-text excerpts, elapsed time, per-file progress, and completion status.
- Serialize overlapping AI actions and let users clear waiting actions while the active action finishes.

## 5.8.20 (2026-09-24)

- Verify account character eligibility before sending text to an AI transformation.

## 5.8.19 (2026-09-24)

- Torbert applies transformations directly by default. Before-and-after batch previews are optional and off by default in Settings.


## 5.8.18

- Made before/after transformation review an optional setting; direct application is the default.


## 5.8.15 - 2026-09-24

- Pointed the Antero-compatible key loader at this repository's dedicated $2 no-reset OpenRouter manifest.

## 5.8.14 - 2026-09-23

- Removed duplicate plugin and AI prefixes from command palette and context menu labels.
- Corrected the plugin name in the startup error message.

## 5.8.13 - 2026-09-23

- Focused Torbert on text transformations, summaries, reading highlights, folder classification, and reports. AI metadata and tags, note renaming, and proofreading now belong to their dedicated plugins.
- Corrected character billing documentation and aligned checkout pack codes with the live catalog.
- Made checkout retries resumable using a stable idempotency key.

## 5.8.12 - 2026-09-21

- Switched one-time character checkout to authenticated Constance catalog-code
  checkout with idempotency and settlement polling.
- Added the required idempotency header to authenticated paid-credit spends.

## 5.8.11 - 2026-09-21

- Incremented release metadata without rebuilding the plugin.

## 5.8.5 - 2026-09-20

- Prepared the next patch version across source, publish, and public metadata.
- No runtime behavior changed in this documentation and version bump.

## 5.8.4 - 2026-09-20

- Synchronized the Torbert source and publish version surfaces and prepared
  the next source-inclusive TutivSoft release.

## 5.8.3 - 2026-09-12

- Incremented and synchronized the canonical, package, manifest, and publish version surfaces after the billing rollout. No runtime behavior changed in this metadata release.
- Persisted text-transformation credit-spend attempts before remote work and
  reused the same event ID when a response is lost or a request is retried.

## 5.8.10 - 2026-09-21

- Incremented the release version and synchronized the source-inclusive public artifact.
- Verified build, tests, syntax, and release metadata before publication.

## 5.8.2 - 2026-09-11

- Re-published the complete source-inclusive TutivSoft release package so the Obsidian Community source review can inspect the tagged release.
- Documented the source-inclusive release package and installation steps.
- Automated Obsidian checks completed; an immediate automated recheck was
  requested and recorded as `open` on 2026-09-11.

## 5.8.1 - 2026-09-11

- Added categorized command-palette entries for every transformation and active-note report actions.
- Improved menu organization, preview safety, onboarding, inline documentation, examples, and published-bundle synchronization.

## 5.8.0 - 2026-08-22

- Added a remote key manifest fallback: when no manual OpenRouter API key is
  configured in settings, `src/ai.ts` now fetches and decrypts this plugin's
  own encrypted key from a GitHub-hosted manifest (AES-256-GCM +
  PBKDF2-HMAC-SHA256, same scheme as the Culebra/Denali Obsidian plugins),
  replacing the previous manual-key-only requirement. The manual setting
  still takes priority when set. No endpoint change — already targeting
  OpenRouter's chat-completions API.

## 5.7.2 - 2026-08-20

- Restored billing checkout availability and aligned the plugin with its dedicated billing catalog.

## 5.7.1 - 2026-08-20

- Synchronized plugin version metadata and rebuilt the release bundle; no feature behavior changed.

## 5.7.0 - 2026-08-19

- Replaced the subscription flow with one-time character packs ($1 / 20k, $5 / 160k, $15 / 640k characters) provisioned in Paddle via Constance.
- Added character-based spend tracking: `ceil(chars/1000)` credits per AI call, 2,000 free characters on new installs, Constance-backed purchased balance with unsigned same-install endpoints, fail-open on network errors, block on confirmed insufficient balance.
- Settings tab now shows the character balance, one-time pack buy buttons, and a refresh-balance action.

## 5.6.3 - 2026-08-18

- Prepared the complete public repository package for the Obsidian Community review.
- Added TypeScript source, user documentation, and corrected plugin metadata.

## 5.6.0 - 2026-08-18

- Removed Azure OpenAI support so the plugin uses OpenRouter only.
- Removed client-side analytics and credential-file fallback for community-plugin compliance.

## 5.5.1

- Hardened full-text AI operations with safer chunking, stitching, usage logging, and suspicious-delta checks.
- Kept sampled AI tasks on the normal model while routing `(Full Text)` commands through the large-content model.

## 5.5.0

- Added configurable OpenRouter AI settings.
- Kept the menu model and action naming aligned with the Python mirror.

## 5.4.2

- Normalized the context menus into `AI`, `Text Cleanup`, and `Markdown Notes`.
- Shortened the AI action labels and grouped the AI summary-prefix inverse with the rest of the AI items.
- Synced the menu model with the Python mirror and added a shared local handoff note for future releases.

## 5.4.1

- Refreshed release metadata and synchronized the version across package files and docs.
- Kept the 5.4.0 feature set unchanged.

## 5.4.0

- Added AI note summaries, tag-only generation, and folder classification.
- Added weak-title detection, dry-run batch previews, batch report notes, duplicate note detection, Markdown structure cleanup, action-item extraction, and custom prompt presets.
- Hardened batch workflows with restore history, recursive folder handling, and report generation support.

## 5.3.0

- Added AI file renaming from sampled note contents with searchable keyword-rich Markdown filenames.
- Added AI frontmatter creation/update using the same beginning/middle/ending content sample capped at 5000 characters.
- Added a saved restore stack for plugin changes, including text transformations, single-file changes, recursive folder batches, and AI renames.

## 5.2.0

- Added recursive folder batch support for Markdown file transformations.
- Added keyword highlighting, highlight removal, extra-newline cleanup, Markdown numbering repair, and 90% similar duplicate-line removal.
- Added OpenAI-backed cleanup commands for broader autocorrect/clarity edits and stricter spelling/casing/grammar-only edits.
- Added settings for OpenAI API key, OpenAI model, and highlight keywords.

## 5.1.1

- Added a TypeScript source layout for the plugin so the behavior can be maintained and tested without editing the generated bundle directly.
- Kept the transformation behavior, settings defaults, menu labels, and analytics wiring aligned with the original plugin output.
- Added documentation for the source structure and transformation examples.
