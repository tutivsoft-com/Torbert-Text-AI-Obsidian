# Changelog

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
- Recorded the historical successful-release layout and the expected private-source connection.
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

- **Fixed checkout**: every `/buy` call (all three packs) was failing with `That price id is not allowed for this app.` Root cause: `APP_ID` in `src/billing.ts` was `"torbert-text-ai"`, which collides with the unrelated `saas-python-python-torbert-text-ai` webapp's own Constance app_id — that webapp's subscription catalog row was the one actually live in production, so this plugin's one-time-pack pricing (added in 5.7.0) had never been reachable under that app_id. Changed `APP_ID` to `"torbert-text-ai-obsidian"` and rebuilt `publish/main.js`. Constance was updated on its side with a matching catalog row for the new app_id (data-only there, no Constance code changed); the webapp's own billing was untouched. Verified live: `GET /buy?app_id=torbert-text-ai-obsidian&price_id=...` now returns a real Paddle transaction redirect for all three packs. Full incident writeup: `CONSTANCE_BILLING_ROLLOUT.md` in the Constance repo.

## 5.7.1 - 2026-08-20

- Patched the published plugin metadata (`manifest.json`, `package.json`, `VERSION`, `publish/manifest.json`) to `5.7.1` and aligned the RA1 metadata surface (`rahul_manifest.yaml`, `architecture.md`, `HISTORY.md`, `package-lock.json`) to `5.6.4`. No functional source changes from `5.7.0`; the rebuilt `publish/main.js` is byte-equivalent except for the version comment trail.

## 5.7.0 - 2026-08-19

- Replaced the subscription flow with one-time character packs ($1 / 20k, $5 / 160k, $15 / 640k characters) provisioned in Paddle via Constance.
- Added character-based spend tracking: `ceil(chars/1000)` credits per AI call, 2,000 free characters on new installs, Constance-backed purchased balance with unsigned same-install endpoints, fail-open on network errors, block on confirmed insufficient balance.
- Settings tab now shows the character balance, one-time pack buy buttons, and a refresh-balance action.

## 5.6.3 - 2026-08-18

- Prepared the complete public repository package for the Obsidian Community review.
- Added source, README, license, corrected manifest metadata, and release attestations.

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
