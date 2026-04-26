# Bookmark Garden — Changelog

Append-only. Most recent at top. Add entries when features ship.

---

## 2026-04-26 — Session 4

- **note: mid-flight partial index** — ran indexing during session; reached ~533 found / 514 saved at Sep 2025 before session close. Total bookmarks across all runs roughly ~1500. No resumable indexing yet — first run of that feature (next session) will fill any gaps from this partial run.
- **docs: restructure project docs** — split `in-progress.md` into current-state-only; created `BACKLOG.md` (prioritized feature queue) and `CHANGELOG.md` (this file). Added data shape reference to `in-progress.md`.
- **docs: approve resumable indexing design** — full approach documented in BACKLOG.md under "Resumable indexing." No code written yet; implementation is next session's first task.

---

## 2026-04-26 — Session 3

- **fix: gallery bundle not building** — `gallery.html` was only declared in `web_accessible_resources`, which CRXJS v2 copies verbatim without processing. Added `gallery.html` to `build.rollupOptions.input` in `vite.config.ts`. Vite now bundles the React app and rewrites the script src to `/assets/gallery-*.js`. Gallery mounts correctly. 978 bookmarks confirmed rendering.

---

## 2026-04-25 — Session 2

- **fix: gallery reads via raw IndexedDB** — bypassed Dexie in gallery context to avoid cross-context issues; reads directly via `indexedDB.open("BookmarkGarden")`.
- **fix: gallery sort and error state** — uses `toArray()` + JS sort (newest first), shows error state in UI instead of silently failing.
- **fix: overlay shows Found vs Saved separately** — surface flush errors visibly in the overlay (red), not just console.
- **fix: flush every 25 tweets** — previously saved all bookmarks in one shot at end of run. Now flushes to IndexedDB every 25 tweets. Progress is preserved if the tab is closed mid-run.
- **feat: gallery Refresh button** — gallery only loads on mount; Refresh button lets user reload after indexing completes.

---

## 2026-04-24 — Session 1

- **chore: dev script uses `vite build --watch`** — `vite dev` caused service worker CORS failures (CRXJS + Vite 8 incompatibility). Switched to `vite build --watch` for ~400ms incremental rebuilds.
- **feat: scroll loop, IndexedDB writes, gallery** — full end-to-end pipeline: scroll x.com/i/bookmarks, parse tweets, write to IndexedDB, render in gallery.
- **fix: rename entry files for CRXJS** — both entry files named `index.ts` caused CRXJS to load the content script bundle as the service worker. Renamed to `background.ts` / `content.ts`.
- **feat: wire message bus** — popup buttons (Index, Open gallery) are functional via typed `ExtensionMessage` union.
- **feat: DOM scraper** — `parseTweetElement()` extracts: tweet ID, author handle, display name, avatar, text, media (images + video + poster), link card, timestamp, content type classifier.
- **feat: Dexie schema + typed messaging** — `BookmarkGarden` DB with `bookmarks`, `tags`, `collections`, `settings` tables. Indexed fields: `authorHandle`, `indexedAt`, `bookmarkedAt`, `contentType`, `*tags`, `*collections`.
- **feat: popup and gallery React entry points** — popup with Index + Open Gallery buttons; gallery with card grid and content-type filter tabs.
- **feat: content script and background service worker stubs** — MV3 message routing scaffolded.
- **feat: Manifest V3** — permissions: `storage`, `tabs`, `scripting`. Host permissions: `x.com/*`, `twitter.com/*`.
- **chore: project scaffold** — Vite 8 + CRXJS 2.0.0 + React 19 + TypeScript strict + Tailwind CSS 3 + ESLint + Prettier.
