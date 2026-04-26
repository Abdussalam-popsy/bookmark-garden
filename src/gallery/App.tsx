import React, { useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";
import type { Bookmark, ContentType } from "@/lib/db";

/** Read all bookmarks via raw IndexedDB — bypasses Dexie which has a
 *  known issue reading from extension pages when written by a service worker. */
function readAllBookmarks(): Promise<Bookmark[]> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("BookmarkGarden");
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      req.transaction?.abort();
      resolve([]);
    };
    req.onsuccess = () => {
      const idb = req.result;
      try {
        const tx = idb.transaction("bookmarks", "readonly");
        const all = tx.objectStore("bookmarks").getAll();
        all.onerror = () => {
          idb.close();
          reject(all.error);
        };
        all.onsuccess = () => {
          idb.close();
          resolve(all.result as Bookmark[]);
        };
      } catch (e) {
        idb.close();
        reject(e);
      }
    };
  });
}

function exportBookmarks(bookmarks: Bookmark[]) {
  const json = JSON.stringify(bookmarks, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `bookmark-garden-${date}.bookmarkgarden`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const CONTENT_TYPES: Array<ContentType | "all"> = [
  "all",
  "article",
  "video",
  "design",
  "thread",
  "code",
  "note",
];

const TYPE_COLOURS: Record<ContentType, string> = {
  article: "bg-blue-100 text-blue-700",
  video: "bg-red-100 text-red-700",
  design: "bg-purple-100 text-purple-700",
  thread: "bg-amber-100 text-amber-700",
  code: "bg-emerald-100 text-emerald-700",
  note: "bg-gray-100 text-gray-600",
};

type SortKey = "newest" | "oldest" | "indexed";

const SORT_LABELS: Record<SortKey, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  indexed: "Recently indexed",
};

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function sortBookmarks(bookmarks: Bookmark[], sort: SortKey): Bookmark[] {
  return [...bookmarks].sort((a, b) => {
    if (sort === "oldest")
      return new Date(a.bookmarkedAt).getTime() - new Date(b.bookmarkedAt).getTime();
    if (sort === "indexed")
      return new Date(b.indexedAt).getTime() - new Date(a.indexedAt).getTime();
    return new Date(b.bookmarkedAt).getTime() - new Date(a.bookmarkedAt).getTime();
  });
}

interface ImportPending {
  bookmarks: Bookmark[];
  suggestedName: string;
}

export default function App() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ContentType | "all">("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [collectionFilter, setCollectionFilter] = useState<string | null>(null);
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [filterMonth, setFilterMonth] = useState<number | null>(null);
  const [activeCard, setActiveCard] = useState<Bookmark | null>(null);
  const [importPending, setImportPending] = useState<ImportPending | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  function load() {
    setLoading(true);
    setError(null);
    readAllBookmarks()
      .then((data) => {
        setBookmarks(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(String(err));
        setLoading(false);
      });
  }

  useEffect(() => {
    load();
  }, []);

  function applyTagUpdate(id: string, tags: string[]) {
    setBookmarks((prev) => prev.map((b) => (b.id === id ? { ...b, tags } : b)));
    setActiveCard((prev) => (prev?.id === id ? { ...prev, tags } : prev));
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const suggestedName = file.name.replace(/\.bookmarkgarden$/, "");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!Array.isArray(data)) throw new Error("Invalid format: expected an array");
        setImportPending({ bookmarks: data as Bookmark[], suggestedName });
      } catch {
        alert("Could not read file. Make sure it is a valid .bookmarkgarden file.");
      }
    };
    reader.readAsText(file);
  }

  function applyImport(imported: Bookmark[], collectionName: string) {
    setBookmarks((prev) => {
      const map = new Map(prev.map((b) => [b.id, b]));
      for (const b of imported) map.set(b.id, b);
      return [...map.values()];
    });
    setImportSuccess(`Imported ${imported.length} bookmarks into "${collectionName}"`);
    setTimeout(() => setImportSuccess(null), 6000);
  }

  const allTags = useMemo(() => {
    const set = new Set<string>();
    bookmarks.forEach((b) => b.tags.forEach((t) => set.add(t)));
    return [...set].sort();
  }, [bookmarks]);

  const allCollections = useMemo(() => {
    const set = new Set<string>();
    bookmarks.forEach((b) => b.collections?.forEach((c) => set.add(c)));
    return [...set].sort();
  }, [bookmarks]);

  const allYears = useMemo(() => {
    const set = new Set<number>();
    bookmarks.forEach((b) => set.add(new Date(b.bookmarkedAt).getFullYear()));
    return [...set].sort((a, b) => b - a); // newest year first
  }, [bookmarks]);

  const availableMonths = useMemo(() => {
    if (filterYear === null) return [];
    const set = new Set<number>();
    bookmarks.forEach((b) => {
      const d = new Date(b.bookmarkedAt);
      if (d.getFullYear() === filterYear) set.add(d.getMonth() + 1);
    });
    return [...set].sort((a, b) => a - b);
  }, [bookmarks, filterYear]);

  const sorted = sortBookmarks(bookmarks, sort);

  const fuse = useMemo(
    () =>
      new Fuse(sorted, {
        keys: ["text", "authorHandle", "authorName", "tags", "notes"],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [sorted]
  );

  const searched = query.trim() ? fuse.search(query).map((r) => r.item) : sorted;
  const tagFiltered = tagFilter ? searched.filter((b) => b.tags.includes(tagFilter)) : searched;
  const collectionFiltered = collectionFilter
    ? tagFiltered.filter((b) => b.collections?.includes(collectionFilter))
    : tagFiltered;
  const dateFiltered =
    filterYear !== null
      ? collectionFiltered.filter((b) => {
          const d = new Date(b.bookmarkedAt);
          if (d.getFullYear() !== filterYear) return false;
          if (filterMonth !== null && d.getMonth() + 1 !== filterMonth) return false;
          return true;
        })
      : collectionFiltered;
  const filtered =
    filter === "all" ? dateFiltered : dateFiltered.filter((b) => b.contentType === filter);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-sm">Loading your garden…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-sm font-semibold text-red-600">Failed to load bookmarks</p>
          <p className="mt-1 text-xs text-gray-500 font-mono">{error}</p>
          <button
            onClick={load}
            className="mt-4 rounded bg-emerald-600 px-3 py-1 text-sm text-white"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (bookmarks.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <span className="text-5xl">🌿</span>
          <h1 className="mt-4 text-xl font-semibold text-gray-900">No bookmarks yet</h1>
          <p className="mt-2 text-sm text-gray-500">
            Go to x.com/i/bookmarks and click <b>Index bookmarks</b> in the popup.
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Or import a <b>.bookmarkgarden</b> file from another device.
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button onClick={load} className="rounded bg-gray-200 px-3 py-1 text-sm text-gray-700">
              Refresh
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              className="rounded bg-sky-600 px-3 py-1 text-sm text-white hover:bg-sky-700"
            >
              Import .bookmarkgarden
            </button>
          </div>
          {importSuccess && (
            <p className="mt-3 text-sm text-emerald-600 font-medium">{importSuccess}</p>
          )}
          <input
            ref={importInputRef}
            type="file"
            accept=".bookmarkgarden"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
        {importPending && (
          <ImportModal
            pending={importPending}
            onClose={() => setImportPending(null)}
            onImport={(imported, collectionName) => {
              setImportPending(null);
              applyImport(imported, collectionName);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur px-6 py-3 space-y-2">
        {/* Row 1: title + search + sort + export/import */}
        <div className="mx-auto max-w-7xl flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xl">🌿</span>
            <h1 className="font-semibold text-gray-900">Bookmark Garden</h1>
            <span className="text-xs text-gray-400 ml-1">
              {filtered.length === bookmarks.length
                ? `${bookmarks.length} bookmarks`
                : `${filtered.length} of ${bookmarks.length}`}
            </span>
            <button
              onClick={load}
              disabled={loading}
              className="ml-2 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-40"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search bookmarks…"
            className="rounded-md border border-gray-200 bg-white px-3 py-1 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-56"
          />

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>

          <select
            value={filterYear ?? ""}
            onChange={(e) => {
              const y = e.target.value ? Number(e.target.value) : null;
              setFilterYear(y);
              setFilterMonth(null);
            }}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All years</option>
            {allYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          {filterYear !== null && (
            <>
              <select
                value={filterMonth ?? ""}
                onChange={(e) => setFilterMonth(e.target.value ? Number(e.target.value) : null)}
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">All months</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {MONTH_NAMES[m - 1]}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  setFilterYear(null);
                  setFilterMonth(null);
                }}
                className="text-xs text-gray-400 hover:text-gray-600 px-1"
                title="Clear date filter"
              >
                ×
              </button>
            </>
          )}

          <div className="ml-auto flex items-center gap-2">
            {importSuccess && (
              <span className="text-xs text-emerald-600 font-medium">{importSuccess}</span>
            )}
            <button
              onClick={() => exportBookmarks(bookmarks)}
              className="rounded-md border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Export
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              className="rounded-md border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Import
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".bookmarkgarden"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        </div>

        {/* Row 2: content-type filter + tag filter */}
        <div className="mx-auto max-w-7xl flex flex-wrap gap-1">
          {CONTENT_TYPES.map((type) => {
            const count =
              type === "all"
                ? bookmarks.length
                : bookmarks.filter((b) => b.contentType === type).length;
            if (type !== "all" && count === 0) return null;
            return (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  filter === type
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {type} ({count})
              </button>
            );
          })}

          {allTags.length > 0 && (
            <>
              <span className="self-center text-gray-300 text-xs mx-1">|</span>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    tagFilter === tag
                      ? "bg-violet-600 text-white"
                      : "bg-violet-50 text-violet-700 hover:bg-violet-100"
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Row 3: collections filter — only shown when imported collections exist */}
        {allCollections.length > 0 && (
          <div className="mx-auto max-w-7xl flex flex-wrap gap-1 items-center">
            <span className="text-xs text-gray-400 mr-1">Collections:</span>
            <button
              onClick={() => setCollectionFilter(null)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                collectionFilter === null
                  ? "bg-sky-600 text-white"
                  : "bg-sky-50 text-sky-700 hover:bg-sky-100"
              }`}
            >
              All
            </button>
            {allCollections.map((col) => (
              <button
                key={col}
                onClick={() => setCollectionFilter(collectionFilter === col ? null : col)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  collectionFilter === col
                    ? "bg-sky-600 text-white"
                    : "bg-sky-50 text-sky-700 hover:bg-sky-100"
                }`}
              >
                {col}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Grid */}
      <main className="mx-auto max-w-7xl p-6">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-gray-400 mt-12">
            {query.trim() ? `No results for "${query}"` : `No ${filter} bookmarks yet.`}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((bookmark) => (
              <BookmarkCard
                key={bookmark.id}
                bookmark={bookmark}
                onTagClick={() => setActiveCard(bookmark)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Tag modal */}
      {activeCard && (
        <TagModal
          bookmark={activeCard}
          onClose={() => setActiveCard(null)}
          onSave={(tags) => applyTagUpdate(activeCard.id, tags)}
        />
      )}

      {/* Import modal */}
      {importPending && (
        <ImportModal
          pending={importPending}
          onClose={() => setImportPending(null)}
          onImport={(imported, collectionName) => {
            setImportPending(null);
            applyImport(imported, collectionName);
          }}
        />
      )}
    </div>
  );
}

// ── BookmarkCard ──────────────────────────────────────────────────────────────

function BookmarkCard({ bookmark, onTagClick }: { bookmark: Bookmark; onTagClick: () => void }) {
  const { authorName, authorHandle, authorAvatar, text, media, externalLink, contentType } =
    bookmark;

  const heroImage =
    media.find((m) => m.type === "video")?.posterUrl ??
    media.find((m) => m.type === "image")?.url ??
    externalLink?.image;

  const isVideo = media.some((m) => m.type === "video");

  return (
    <a
      href={`https://x.com/${authorHandle}/status/${bookmark.id}`}
      target="_blank"
      rel="noreferrer"
      className="group flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden hover:shadow-md transition-shadow no-underline"
    >
      {/* Hero image */}
      {heroImage && (
        <div className="relative aspect-video overflow-hidden bg-gray-100">
          <img
            src={heroImage}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {isVideo && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60">
                <span className="ml-0.5 text-white text-base">▶</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Card body */}
      <div className="flex flex-1 flex-col p-3 gap-2">
        {/* Author row */}
        <div className="flex items-center gap-2">
          {authorAvatar ? (
            <img
              src={authorAvatar}
              alt={authorName}
              className="h-8 w-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="h-8 w-8 shrink-0 rounded-full bg-gray-200" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900 leading-tight">
              {authorName}
            </p>
            <p className="truncate text-xs text-gray-400">@{authorHandle}</p>
          </div>
          <TypeBadge type={contentType} />
        </div>

        {/* Tweet text */}
        {text && <p className="text-sm text-gray-700 line-clamp-3 leading-snug">{text}</p>}

        {/* Link card title */}
        {externalLink?.title && (
          <p className="text-xs text-blue-600 truncate">{externalLink.title}</p>
        )}

        {/* Existing tags */}
        {bookmark.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {bookmark.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-violet-50 text-violet-700 px-2 py-0.5 text-[10px] font-medium"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer: date + tag button */}
        <div className="mt-auto pt-1 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {new Date(bookmark.bookmarkedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onTagClick();
            }}
            className="text-xs text-gray-400 hover:text-violet-600 transition-colors px-1"
            title="Add / edit tags"
          >
            {bookmark.tags.length > 0 ? `#${bookmark.tags.length}` : "+ tag"}
          </button>
        </div>
      </div>
    </a>
  );
}

// ── ImportModal ───────────────────────────────────────────────────────────────

function ImportModal({
  pending,
  onClose,
  onImport,
}: {
  pending: ImportPending;
  onClose: () => void;
  onImport: (bookmarks: Bookmark[], collectionName: string) => void;
}) {
  const [name, setName] = useState(pending.suggestedName);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  async function handleImport() {
    const collectionName = name.trim() || pending.suggestedName;
    setImporting(true);
    setImportError(null);

    const withCollection: Bookmark[] = pending.bookmarks.map((b) => ({
      ...b,
      collections: [`Imported from ${collectionName}`],
    }));

    try {
      const res = (await chrome.runtime.sendMessage({
        type: "IMPORT_BOOKMARKS",
        payload: withCollection,
      })) as { ok?: boolean; count?: number; error?: string } | undefined;

      if (res?.error) throw new Error(res.error);
      onImport(withCollection, collectionName);
    } catch (err) {
      setImportError(String(err));
      setImporting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-base font-semibold text-gray-900">Name this collection</h2>
          <p className="mt-1 text-xs text-gray-500">
            {pending.bookmarks.length} bookmarks will be imported. They will be grouped under a
            collection you can browse separately.
          </p>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleImport();
          }}
          placeholder={pending.suggestedName}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        />

        {importError && <p className="text-xs text-red-600">{importError}</p>}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {importing ? "Importing…" : `Import ${pending.bookmarks.length} bookmarks`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── TagModal ──────────────────────────────────────────────────────────────────

function TagModal({
  bookmark,
  onClose,
  onSave,
}: {
  bookmark: Bookmark;
  onClose: () => void;
  onSave: (tags: string[]) => void;
}) {
  const [tags, setTags] = useState<string[]>(bookmark.tags);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function commitInput() {
    const t = input.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setInput("");
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = (await chrome.runtime.sendMessage({
        type: "UPDATE_BOOKMARK_TAGS",
        payload: { id: bookmark.id, tags },
      })) as { ok?: boolean; error?: string } | undefined;
      if (res?.error) throw new Error(res.error);
      onSave(tags);
      onClose();
    } catch (err) {
      setSaveError(String(err));
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Author */}
        <div className="flex items-center gap-2">
          {bookmark.authorAvatar ? (
            <img
              src={bookmark.authorAvatar}
              alt={bookmark.authorName}
              className="h-9 w-9 rounded-full object-cover"
            />
          ) : (
            <div className="h-9 w-9 rounded-full bg-gray-200" />
          )}
          <div>
            <p className="text-sm font-semibold text-gray-900">{bookmark.authorName}</p>
            <p className="text-xs text-gray-400">@{bookmark.authorHandle}</p>
          </div>
        </div>

        {/* Tweet text preview */}
        {bookmark.text && (
          <p className="text-sm text-gray-700 line-clamp-4 leading-snug">{bookmark.text}</p>
        )}

        {/* Tag chips */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Tags</p>
          <div className="flex flex-wrap gap-1 min-h-6">
            {tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-full bg-violet-100 text-violet-700 px-2.5 py-0.5 text-xs font-medium"
              >
                #{tag}
                <button
                  onClick={() => removeTag(tag)}
                  className="hover:text-red-500 leading-none"
                  aria-label={`Remove ${tag}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Tag input */}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commitInput();
            }
            if (e.key === "Backspace" && !input) setTags((prev) => prev.slice(0, -1));
          }}
          onBlur={commitInput}
          placeholder="Type a tag and press Enter…"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />

        {saveError && <p className="text-xs text-red-600">{saveError}</p>}

        {/* Actions */}
        <div className="flex items-center justify-between pt-1">
          <a
            href={`https://x.com/${bookmark.authorHandle}/status/${bookmark.id}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            View on X ↗
          </a>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save tags"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: ContentType }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${TYPE_COLOURS[type]}`}
    >
      {type}
    </span>
  );
}
