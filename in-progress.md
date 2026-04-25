# Bookmark Garden — In Progress

Last updated: 2026-04-25

---

## What's been built

### Infrastructure
- Vite 8 + CRXJS 2.0.0 + React 19 + TypeScript (strict) + Tailwind CSS 3
- ESLint + Prettier configured
- `npm run dev` runs `vite build --watch` — rebuilds in ~400ms on every save
- Load workflow: remove extension from chrome://extensions → Load unpacked → select `dist/`

### Extension structure
```
src/
  background/background.ts   Service worker — routes messages, thin router only
  content/content.ts         Content script — runs on x.com/i/bookmarks
  content/scraper.ts         DOM parser — parseTweetElement(), parseAllVisibleTweets()
  gallery/                   Placeholder React app (gallery.html)
  popup/                     React popup with Index + Open gallery buttons
  lib/
    db.ts                    Dexie schema + TypeScript interfaces (not wired yet)
    messaging.ts             Typed message union (ExtensionMessage)
    env.ts                   isDev guard (tree-shaken in prod)
manifest.json                MV3, read by CRXJS at build time
```

### Message flow (working)
```
Popup → background.ts → content.ts (on x.com/i/bookmarks) → back up the chain
```
- "Index bookmarks" button sends `START_INDEXING` → background routes it to the bookmarks tab → content script parses visible tweets → count returned to popup
- "Open gallery" button opens `gallery.html` in a new tab
- Popup shows inline status (green = ok, red = error)

### Scraper (`src/content/scraper.ts`)
Parses `article[data-testid="tweet"]` into typed `Bookmark` objects:
- Tweet ID → from `/username/status/ID` permalink (stable anchor)
- Author handle → same permalink, split on `/`
- Display name → `[data-testid="User-Name"] a[href="/handle"] span span`
- Avatar → `img[src*="profile_images"]`
- Tweet text → `[data-testid="tweetText"]` textContent
- Images → `[data-testid="tweetPhoto"] img` filtered to `pbs.twimg.com/media`
- Video → `<video>` element + poster attribute
- Link card → `[data-testid="card.wrapper"]` → first anchor URL + detail spans
- Timestamp → `time[datetime]`
- Content type classifier: video > code > design > article > thread > note

### Dexie schema (`src/lib/db.ts`)
Defined but not wired to any writes yet:
- `bookmarks` — primary key `id`, indexed on authorHandle, indexedAt, bookmarkedAt, contentType, *tags, *collections
- `tags` — auto-increment id, unique name
- `collections` — auto-increment id, unique name
- `settings` — key/value store

---

## Bugs fixed
- **CRXJS service worker bundle mixup** — both entry files named `index.ts` caused CRXJS to load the content script bundle (with `document`) as the service worker. Fixed by renaming to `background.ts` / `content.ts`.
- **Dev mode CORS error** — `vite dev` causes service worker CORS failure (CRXJS + Vite 8 incompatibility). Fixed by switching `npm run dev` to `vite build --watch`.

---

## Current status

Message bus is confirmed working end-to-end. Popup shows "Found N tweet(s)" after clicking Index. Console output from the content script appears in the x.com/i/bookmarks DevTools under Warnings (filter must be enabled).

Only 1 tweet showing — expected. x.com lazy-renders tweets so only viewport-visible articles are in the DOM when Index is clicked. The scroll loop will fix this.

---

## What's next

### Immediate (next session)
1. **Verify scraper output** — confirm parsed Bookmark objects have correct shape in console (ID, handle, text, contentType, media, externalLink all populated)
2. **Scroll loop** (`src/content/scraper.ts`) — auto-scroll the bookmarks page, capture new tweets after each scroll, stop when N consecutive scrolls produce no new tweets
3. **Dexie writes** — wire `SAVE_BOOKMARK` message: content script sends each parsed tweet to background, background writes to IndexedDB via `db.bookmarks.put()`
4. **Progress overlay** — floating indicator on the x.com page showing count + current date position

### After that
5. Gallery — read from Dexie, render a list of bookmarks (before masonry)
6. Masonry grid — replace list with `react-masonry-css`, card variants per content type
7. Rule-based classification improvements — test against real bookmarks, tune selectors
8. Search + filter sidebar — Fuse.js fuzzy search, type/tag/date filters
9. Tagging UI — add/remove tags inline, keyword dictionary in settings
10. Collections — create, assign, view
11. OG metadata fetch — article link previews via background worker fetch
12. Export — JSON, CSV, per-collection HTML

### V2 (later)
- LLM tagging via Claude API or local Ollama (~$0.003/bookmark with Haiku)

---

## Known issues / watch list
- X changes their DOM structure 2–4x/year — selectors will break, especially class-based ones. We use `data-testid` attributes where possible to reduce frequency.
- Media URLs from X are sometimes signed and rotate — store tweet ID as the durable key, re-index to refresh.
- Reload (not remove+re-add) in chrome://extensions sometimes leaves stale service worker state — always remove+re-add during development.
