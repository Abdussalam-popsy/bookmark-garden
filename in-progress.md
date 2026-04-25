# Bookmark Garden — In Progress

Last updated: 2026-04-25 (session 2)

---

## What's been built

### Infrastructure
- Vite 8 + CRXJS 2.0.0 + React 19 + TypeScript (strict) + Tailwind CSS 3
- ESLint + Prettier configured
- `npm run dev` runs `vite build --watch` — rebuilds in ~400ms on every save
- Load workflow: **remove** extension from chrome://extensions → Load unpacked → select `dist/`
  (Reload button alone leaves stale service worker state — always remove+re-add)

### Extension structure
```
src/
  background/background.ts   Service worker — routes START_INDEXING, handles SAVE_BOOKMARKS_BATCH
  content/content.ts         Content script — scroll loop, progress overlay, flush to background
  content/scraper.ts         DOM parser — parseTweetElement(), parseAllVisibleTweets()
  gallery/                   React gallery app — reads from Dexie, card grid, filter tabs
  popup/                     React popup with Index + Open gallery buttons
  lib/
    db.ts                    Dexie schema + TypeScript interfaces
    messaging.ts             Typed message union (ExtensionMessage)
    env.ts                   isDev guard (tree-shaken in prod builds)
manifest.json                MV3, read by CRXJS at build time
```

### Message flow (working end-to-end)
```
Popup → background → content (on x.com/i/bookmarks)
Content → background (SAVE_BOOKMARKS_BATCH every 25 tweets)
background → IndexedDB (db.bookmarks.bulkPut)
```

### Scroll loop (`src/content/content.ts`)
- Auto-scrolls x.com/i/bookmarks, parses new tweets after each scroll step
- Deduplicates by tweet ID using a `Set<string>` — re-running is safe (no duplicates)
- Flushes to IndexedDB every 25 tweets so progress is saved even if tab is closed mid-run
- Stops after 4 consecutive scrolls with no new tweets
- Progress overlay injected into the x.com page: shows `Found N · Saved N` + date position
- Overlay shows `Done — N bookmarks saved ✓` at completion, fades after 5s
- Flush errors appear in the overlay (red), not just console

### Scraper (`src/content/scraper.ts`)
Parses `article[data-testid="tweet"]` into typed `Bookmark` objects:
- Tweet ID → from `/username/status/ID` permalink
- Author handle → same permalink, split on `/`
- Display name → `[data-testid="User-Name"] a[href="/handle"] span span`
- Avatar → `img[src*="profile_images"]`
- Tweet text → `[data-testid="tweetText"]` textContent
- Images → `[data-testid="tweetPhoto"] img` filtered to `pbs.twimg.com/media`
- Video → `<video>` element + poster attribute
- Link card → `[data-testid="card.wrapper"]` → first anchor URL + detail spans
- Timestamp → `time[datetime]`
- Content type classifier: video > code > design > article > thread > note

### Dexie schema (`src/lib/db.ts`) — wired and writing
- `bookmarks` — primary key `id`, indexed on authorHandle, indexedAt, bookmarkedAt, contentType, *tags, *collections
- `tags` — auto-increment id, unique name
- `collections` — auto-increment id, unique name
- `settings` — key/value store
- Background uses `db.bookmarks.bulkPut()` — upsert by tweet ID, safe to re-index

### Gallery (`src/gallery/App.tsx`)
- Reads all bookmarks from Dexie via `toArray()` + JS sort (newest first)
- Responsive 4-column card grid — hero image, author row, type badge, tweet text, date
- Content-type filter tabs: All / Article / Video / Design / Thread / Code / Note
- Refresh button in header (gallery only loads on mount — must refresh manually after indexing)
- Error state renders in UI if DB query fails (not just console)

---

## Bugs fixed (session 1)
- **CRXJS service worker bundle mixup** — both entry files named `index.ts` caused CRXJS to load the content script bundle as the service worker. Fixed by renaming to `background.ts` / `content.ts`.
- **Dev mode CORS error** — `vite dev` causes service worker CORS failure (CRXJS + Vite 8 incompatibility). Fixed by switching `npm run dev` to `vite build --watch`.

## Bugs fixed (session 2)
- **Single end-of-run batch save** — originally saved all bookmarks in one shot at the end. If the user navigated away mid-run, nothing was saved. Fixed: flush every 25 tweets.
- **Gallery empty after indexing** — gallery loads once on mount. If opened before or during indexing it shows nothing. Fixed: Refresh button + error display. Data confirmed in IndexedDB (308 entries). Gallery display still not working — see open bug below.

---

## Open bug (blocked — next session priority)

### Gallery shows "No bookmarks yet" despite 308 records in IndexedDB
**What we know:**
- IndexedDB → BookmarkGarden → bookmarks: **308 entries confirmed** (visible in DevTools)
- Background `bulkPut` is definitely running (overlay shows `Saved N` incrementing)
- Gallery query `db.bookmarks.toArray()` returns 0 records despite data being present

**Theories to investigate:**
1. The gallery tab's `db` instance is opening a *different* database — check if there are multiple `BookmarkGarden` databases under different origins (unlikely but possible if the extension ID changed between builds)
2. Dexie 4 + `EntityTable` has a quirk where `toArray()` on the extension page context doesn't see data written by the service worker — look for open Dexie issues on this
3. The gallery is reading correctly but React state isn't updating — add a raw `console.log(data)` immediately after `toArray()` resolves to confirm the array is populated before setState
4. Try bypassing Dexie entirely: open IndexedDB directly with `indexedDB.open("BookmarkGarden")` in the gallery DevTools console to confirm the data is reachable from that page

**Quickest diagnostic (do this first thing):**
Open the gallery tab → DevTools Console → paste:
```js
const req = indexedDB.open("BookmarkGarden");
req.onsuccess = e => {
  const db = e.target.result;
  const tx = db.transaction("bookmarks", "readonly");
  const store = tx.objectStore("bookmarks");
  store.count().onsuccess = r => console.log("count:", r.target.result);
};
```
If this logs `count: 308`, Dexie is the issue. If it logs `count: 0`, wrong origin.

---

## Current status

Indexing pipeline is working:
- Scroll loop runs, finds bookmarks, overlay shows progress
- Data is being written to IndexedDB (confirmed 308 records)
- **Gallery display is broken** — data is there but not rendering

---

## What's next

### Immediate (next session)
1. **Fix gallery** — run the raw IndexedDB diagnostic above, identify root cause, fix
2. **Verify scraper field quality** — expand a record in IndexedDB DevTools, check text/media/contentType fields are populated correctly

### After gallery is working
3. Search — `db.bookmarks.toArray()` + client-side Fuse.js fuzzy search on text + handle
4. Masonry grid — replace CSS grid with `react-masonry-css`, card variants per content type
5. Rule-based classification improvements — inspect real records, tune selectors
6. Tagging UI — add/remove tags inline on cards
7. Collections — create, assign, view
8. OG metadata fetch — background worker fetches article `og:` tags for richer link cards
9. Export — JSON, CSV, per-collection HTML

### V2 (later)
- Resume from last indexed position (track oldest saved tweet ID, scroll to it on re-run)
- LLM tagging via Claude API or local Ollama (~$0.003/bookmark with Haiku)

---

## Known issues / watch list
- X changes their DOM structure 2–4x/year — selectors will break. We use `data-testid` attributes where possible.
- Media URLs from X are sometimes signed and expire — store tweet ID as the durable key, re-index to refresh.
- `isDev` is always `false` in both `npm run build` and `npm run dev` (`vite build --watch` is a production build). All `console.warn` calls guarded by `isDev` are invisible. Use the service worker DevTools panel to debug background issues.
- Re-indexing is safe (bulkPut upserts) but always re-scans from the top — no resume yet.
