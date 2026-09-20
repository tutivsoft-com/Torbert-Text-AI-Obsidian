# Release Notes

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

Checkout fix: the plugin's Constance `app_id` (`torbert-text-ai`) collided
with the unrelated `saas-python-python-torbert-text-ai` webapp's own app_id,
so every $1/$5/$15 character-pack purchase failed with "That price id is
not allowed for this app." Renamed this plugin's app_id to
`torbert-text-ai-obsidian` and provisioned it on the Constance side; the
webapp's own billing was untouched. All three packs verified working live.

## 5.7.1 - 2026-08-20

- Patch release: bumped the published plugin version to `5.7.1` (`manifest.json`, `package.json`, `VERSION`, `publish/manifest.json`) and synchronized the RA1 metadata surface (`rahul_manifest.yaml`, `architecture.md`, `HISTORY.md`, `package-lock.json`) to `5.6.4`. No application source or feature changes from `5.7.0`.

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
