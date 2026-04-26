# Bookmark Garden — In Progress

Last updated: 2026-04-26 (session 4)

---

## Current state

Extension is functional end-to-end. Indexing pipeline scrolls x.com/i/bookmarks, parses tweets into typed Bookmark records, flushes to IndexedDB every 25 tweets, and the gallery React app reads and renders them. Roughly ~1500 bookmarks indexed across runs (including a partial mid-session run reaching Sep 2025). No tagging, search, or sort yet. Next session starts immediately on resumable indexing — approach approved and fully documented in BACKLOG.md.

---

## What works

- Scroll loop with live overlay (Found N · Saved N, errors surfaced in red)
- DOM scraper: ID, handle, display name, avatar, text, media, link card, timestamp, content type
- IndexedDB writes via `bulkPut` — re-indexing is safe (upsert by tweet ID)
- Gallery: 4-column card grid, content-type filter tabs, Refresh button
- Build: `npm run dev` = `vite build --watch`, ~400ms rebuilds
- Load workflow: always **remove + reload** (not refresh) to avoid stale service worker

---

## Active blockers

None. Gallery is rendering. No known broken flows.

---

## Next session's focus

Resumable indexing is shipped. Test it: remove+reload extension, open x.com/i/bookmarks, click "Index bookmarks" (first run = full scan). After completion, popup should show "Index new bookmarks" + "Reindex all". Next feature: sort by date dropdown in gallery.

---

## Data shape reference

### Bookmark record fields

| Field | Type | Indexed? | Notes |
|---|---|---|---|
| `id` | `string` | **primary key** | Tweet ID — stable, used for upsert |
| `authorHandle` | `string` | yes | e.g. `"naval"` |
| `authorName` | `string` | no | Display name |
| `authorAvatar` | `string` | no | Profile image URL |
| `text` | `string` | no | Full tweet text |
| `media` | `MediaItem[]` | no | Array of image/video objects |
| `externalLink` | `ExternalLink \| null` | no | Link card data |
| `contentType` | `ContentType` | yes | `"article" \| "video" \| "design" \| "thread" \| "code" \| "note"` |
| `tags` | `string[]` | yes (multi-entry) | Each tag indexed separately |
| `collections` | `string[]` | yes (multi-entry) | Each collection indexed separately |
| `notes` | `string` | no | Freeform user notes |
| `bookmarkedAt` | `Date` | yes | When bookmarked on X |
| `indexedAt` | `Date` | yes | When we scraped it |
| `xFolder` | `string \| null` | no | X's native folder name, if any |

**`MediaItem`** — `{ type: "image"|"video", url, width?, height?, posterUrl?, duration? }`

**`ExternalLink`** — `{ url, title?, description?, image?, siteName? }`

### What "indexed" means in practice

**Indexed fields** (`authorHandle`, `contentType`, `bookmarkedAt`, `indexedAt`, `tags`, `collections`) can be queried directly and cheaply:
```ts
db.bookmarks.where("contentType").equals("video").toArray()
db.bookmarks.where("authorHandle").equals("naval").toArray()
db.bookmarks.where("bookmarkedAt").between(start, end).toArray()
db.bookmarks.where("tags").equals("typography").toArray()
```

**Unindexed fields** (`text`, `authorName`, `media`, `externalLink`, `notes`, `xFolder`) require a full scan — load all records then filter in JS. Fine for 978 records, worth noting for search.

Date range filters (`bookmarkedAt`, `indexedAt`) are cheap and ideal for sort/filter UI. Author filtering is also cheap. Full-text search on `text` requires JS-side Fuse.js (full scan, acceptable at this scale).
