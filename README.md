# Bookmark Garden

A Chrome extension that scrapes your X/Twitter bookmarks via DOM inspection, stores them locally in IndexedDB, and renders them in a Pinterest-style gallery you control.

**Local-first. No backend. No telemetry.**

---

## Status

`v0.1.0` — scaffold only. Scraper and gallery UI coming next.

---

## Development

### Prerequisites

- Node ≥ 18
- Chrome (for loading the unpacked extension)

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

Output goes to `dist/`.

### Dev mode (HMR)

```bash
npm run dev
```

CRXJS serves a hot-reloading build. Load `dist/` as an unpacked extension (see below), then changes to source files update the extension live without needing to reload it manually.

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked**
4. Select the `dist/` folder inside this project
5. The "Bookmark Garden" extension appears in your toolbar

> After a `npm run build` or while `npm run dev` is running and you make changes, click the refresh icon on the extension card in `chrome://extensions` to pick up the latest build (or reload the affected tab if only a content script changed).

---

## Project structure

```
src/
  background/   Service worker — coordinates indexing, OG fetches, storage writes
  content/      Content script — runs on x.com/i/bookmarks, DOM scraper goes here
  gallery/      Full-page React app (gallery.html) — masonry grid, search, filters
  popup/        Extension popup (popup.html) — indexing controls
  lib/
    db.ts         Dexie schema and typed interfaces
    messaging.ts  Typed message-passing helpers
    env.ts        Dev/prod guards
manifest.json     Extension manifest (read by CRXJS at build time)
vite.config.ts    Build config
```

---

## Known issues / notes

- The `rollup` transitive dependency of `@crxjs/vite-plugin@2.0.0` has a [high-severity advisory](https://github.com/advisories/GHSA-mw96-cpmx-2vgc). This is a **build-time dev dependency** — it is not shipped in the extension and is not exploitable via normal use. The fix would require downgrading CRXJS to 1.x, which drops Vite 5 support. Accepted risk for now; revisit when CRXJS cuts a patch.

---

## When you are ready

Ideas for future improvements noted for the gallery at https://abdussalam-popsy.github.io/project-365/:

- Auto-populate the project catalog (catalog.json) when a new project is pushed, so the gallery updates without manual edits.

---

## License

MIT
