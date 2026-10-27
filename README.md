# Touchstone 3 Companion

An offline-capable study companion PWA for the Touchstone 3 ESL course, built for Farsi-speaking learners: bilingual vocabulary flashcards (English ⇄ Farsi, RTL), matching, gap-fill, grammar with Farsi explanations, readings with tap-to-translate, writing prompts, and spaced-repetition review. No build step — plain HTML/JS/CSS served as-is on GitHub Pages.

## Release notes

### 2026-10-26 — V2 vocabulary, all 12 lessons (ts3-v4.0)

- V2 vocab schema live across all 12 lessons (240 entries): `{en, type, fa, ex, collocations:[{en,fa}×2], chunks:[{en,fa}×2]}`. Every vocabulary flashcard back now shows a Collocations group and a Chunks group, two EN→FA pairs each, rendered right-to-left in Farsi; empty groups are hidden.
- Farsi translations (`translationFa`) present on all 24 reading texts plus grammar passages.
- Data validator: fail-soft in production — violations are logged to the console naming lesson/index/field, unrenderable items are skipped, and the app boots normally. Fail-loud in dev only (`?dev=1` query param, or `DEV_MODE=true` in index.html — committed as `false`): red overlay + throw.
- PWA refresh prompt: when a new service-worker version installs, an in-app banner ("نسخهٔ جدید آماده است / به‌روزرسانی") lets the user reload into the updated version. First-ever visits do not see a false banner.
- Service worker cache version bumped to `ts3-v4.1` (from `ts3-v4.0` for the 3C pilot — conversation card type + section-aware buildSession + flashcard-add from chunks). Cache strategy unchanged.

**TODO(fa-review): 1137 drafted Farsi strings** — 22 passage translations + 960 vocabulary collocation/chunk pairs across all 12 lessons + 152 conversation chunk Farsi translations (3C pilot, Part A/B/C) + 3 conversation part titles (3C) — are awaiting native-speaker review (tracked on a string basis; the SW update banner adds 2 more tagged strings in index.html). This count must reach zero before public release.
