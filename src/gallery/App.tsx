import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
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
  const date = new Date().toISOString().slice(0, 10);
  downloadAsBookmarkgarden(bookmarks, `bookmark-garden-${date}`);
}

function downloadAsBookmarkgarden(items: Bookmark[], filename: string) {
  const json = JSON.stringify(items, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.bookmarkgarden`;
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

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAddToCollectionModal, setShowAddToCollectionModal] = useState(false);
  const [exportModalPending, setExportModalPending] = useState<{
    defaultName: string;
    items: Bookmark[];
  } | null>(null);
  const [deleteCollectionTarget, setDeleteCollectionTarget] = useState<string | null>(null);

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

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && selectionMode) {
        setSelectionMode(false);
        setSelectedIds(new Set());
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectionMode]);

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

  // ── Selection helpers ──────────────────────────────────────────────────────

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    if (!selectionMode) setSelectionMode(true);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(filtered.map((b) => b.id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  async function handleDeleteConfirmed() {
    const ids = [...selectedIds];
    const res = (await chrome.runtime.sendMessage({
      type: "DELETE_BOOKMARKS",
      payload: { ids },
    })) as { ok?: boolean; error?: string } | undefined;
    if (res?.error) throw new Error(res.error);
    setBookmarks((prev) => prev.filter((b) => !ids.includes(b.id)));
    setShowDeleteModal(false);
    exitSelectionMode();
  }

  async function handleAddToCollection(collection: string) {
    const updates = [...selectedIds].map((id) => {
      const bm = bookmarks.find((b) => b.id === id)!;
      const existing = bm.collections ?? [];
      return {
        id,
        collections: existing.includes(collection) ? existing : [...existing, collection],
      };
    });
    const res = (await chrome.runtime.sendMessage({
      type: "BATCH_UPDATE_COLLECTIONS",
      payload: { updates },
    })) as { ok?: boolean; error?: string } | undefined;
    if (res?.error) throw new Error(res.error);
    setBookmarks((prev) =>
      prev.map((b) => {
        const upd = updates.find((u) => u.id === b.id);
        return upd ? { ...b, collections: upd.collections } : b;
      })
    );
    setShowAddToCollectionModal(false);
  }

  async function handleDeleteCollectionConfirmed(collection: string) {
    const affected = bookmarks.filter((b) => (b.collections ?? []).includes(collection));
    const updates = affected.map((b) => ({
      id: b.id,
      collections: (b.collections ?? []).filter((c) => c !== collection),
    }));
    const res = (await chrome.runtime.sendMessage({
      type: "BATCH_UPDATE_COLLECTIONS",
      payload: { updates },
    })) as { ok?: boolean; error?: string } | undefined;
    if (res?.error) throw new Error(res.error);
    setBookmarks((prev) =>
      prev.map((b) => {
        const upd = updates.find((u) => u.id === b.id);
        return upd ? { ...b, collections: upd.collections } : b;
      })
    );
    if (collectionFilter === collection) setCollectionFilter(null);
    setDeleteCollectionTarget(null);
  }

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
              onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
              className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                selectionMode
                  ? "border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {selectionMode ? "Cancel" : "Select"}
            </button>
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
            {allCollections.map((col) => {
              const isActive = collectionFilter === col;
              return (
                <div
                  key={col}
                  className={`flex items-center rounded-full overflow-hidden border ${
                    isActive ? "border-sky-500" : "border-sky-200"
                  }`}
                >
                  <button
                    onClick={() => setCollectionFilter(isActive ? null : col)}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-sky-600 text-white hover:bg-sky-700"
                        : "bg-sky-50 text-sky-700 hover:bg-sky-100"
                    }`}
                  >
                    {col}
                  </button>
                  <button
                    onClick={() =>
                      setExportModalPending({
                        defaultName: `${col}-${new Date().toISOString().slice(0, 10)}`,
                        items: bookmarks.filter((b) => (b.collections ?? []).includes(col)),
                      })
                    }
                    className={`px-1.5 py-1 border-l text-xs transition-colors ${
                      isActive
                        ? "border-sky-400 text-sky-100 hover:text-white hover:bg-sky-700"
                        : "border-sky-200 text-sky-400 hover:text-sky-600 hover:bg-sky-100"
                    }`}
                    title={`Export "${col}"`}
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => setDeleteCollectionTarget(col)}
                    className={`px-1.5 py-1 border-l text-xs transition-colors ${
                      isActive
                        ? "border-sky-400 text-sky-100 hover:text-white hover:bg-sky-700"
                        : "border-sky-200 text-sky-400 hover:text-red-500 hover:bg-red-50"
                    }`}
                    title={`Delete "${col}"`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
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
          <VirtualGrid
            items={filtered}
            onTagClick={(bookmark) => setActiveCard(bookmark)}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
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

      {/* Selection action bar */}
      {selectionMode && (
        <SelectionActionBar
          count={selectedIds.size}
          total={filtered.length}
          onSelectAll={selectAll}
          onDeselectAll={deselectAll}
          onAddToCollection={() => setShowAddToCollectionModal(true)}
          onExportSelected={() =>
            setExportModalPending({
              defaultName: `selection-${new Date().toISOString().slice(0, 10)}`,
              items: bookmarks.filter((b) => selectedIds.has(b.id)),
            })
          }
          onDelete={() => setShowDeleteModal(true)}
          onCancel={exitSelectionMode}
        />
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <DeleteModal
          count={selectedIds.size}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleDeleteConfirmed}
        />
      )}

      {/* Add to collection modal */}
      {showAddToCollectionModal && (
        <AddToCollectionModal
          count={selectedIds.size}
          existingCollections={allCollections}
          onClose={() => setShowAddToCollectionModal(false)}
          onConfirm={handleAddToCollection}
        />
      )}

      {/* Export naming modal (shared: export selected + per-collection export) */}
      {exportModalPending && (
        <ExportNamingModal
          defaultName={exportModalPending.defaultName}
          items={exportModalPending.items}
          onClose={() => setExportModalPending(null)}
        />
      )}

      {/* Delete collection modal */}
      {deleteCollectionTarget !== null && (
        <DeleteCollectionModal
          collection={deleteCollectionTarget}
          count={
            bookmarks.filter((b) => (b.collections ?? []).includes(deleteCollectionTarget)).length
          }
          onClose={() => setDeleteCollectionTarget(null)}
          onConfirm={() => handleDeleteCollectionConfirmed(deleteCollectionTarget)}
        />
      )}
    </div>
  );
}

// ── VirtualGrid ───────────────────────────────────────────────────────────────

/** Derive column count from the container's rendered pixel width, mirroring
 *  the Tailwind breakpoints used for the grid: sm=2, lg=3, xl=4. */
function getColumnCount(width: number): number {
  if (width >= 1280) return 4;
  if (width >= 1024) return 3;
  if (width >= 640) return 2;
  return 1;
}

function VirtualGrid({
  items,
  onTagClick,
  selectionMode,
  selectedIds,
  onToggleSelect,
}: {
  items: Bookmark[];
  onTagClick: (b: Bookmark) => void;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(1);

  // Track container width and update column count
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.offsetWidth;
      setCols(getColumnCount(width));
    });
    ro.observe(el);
    setCols(getColumnCount(el.offsetWidth));
    return () => ro.disconnect();
  }, []);

  // Chunk items into rows
  const rows = useMemo(() => {
    if (cols === 0) return [];
    const result: Bookmark[][] = [];
    for (let i = 0; i < items.length; i += cols) {
      result.push(items.slice(i, i + cols));
    }
    return result;
  }, [items, cols]);

  const rowVirtualizer = useWindowVirtualizer({
    count: rows.length,
    // Over-estimate: cards with images are ~220px tall + body; 400px prevents
    // scroll-position jumps before real heights are measured.
    estimateSize: () => 400,
    overscan: 3,
    scrollMargin: containerRef.current?.offsetTop ?? 0,
  });

  const measureRef = useCallback(
    (el: HTMLElement | null) => {
      if (el) rowVirtualizer.measureElement(el);
    },
    [rowVirtualizer]
  );

  return (
    <div ref={containerRef}>
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const rowItems = rows[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={measureRef}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start - rowVirtualizer.options.scrollMargin}px)`,
                paddingBottom: "1rem", // matches gap-4
              }}
            >
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
              >
                {rowItems.map((bookmark) => (
                  <BookmarkCard
                    key={bookmark.id}
                    bookmark={bookmark}
                    onTagClick={() => onTagClick(bookmark)}
                    selectionMode={selectionMode}
                    isSelected={selectedIds.has(bookmark.id)}
                    onToggleSelect={() => onToggleSelect(bookmark.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── BookmarkCard ──────────────────────────────────────────────────────────────

function BookmarkCard({
  bookmark,
  onTagClick,
  selectionMode,
  isSelected,
  onToggleSelect,
}: {
  bookmark: Bookmark;
  onTagClick: () => void;
  selectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
}) {
  const { authorName, authorHandle, authorAvatar, text, media, externalLink, contentType } =
    bookmark;

  const heroImage =
    media.find((m) => m.type === "video")?.posterUrl ??
    media.find((m) => m.type === "image")?.url ??
    externalLink?.image;

  const isVideo = media.some((m) => m.type === "video");
  const isTextOnly = !heroImage;

  let faviconUrl: string | null = null;
  if (externalLink?.url) {
    try {
      faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(externalLink.url).hostname}&sz=16`;
    } catch {
      faviconUrl = null;
    }
  }

  return (
    <div className="relative group">
      {/* Selection checkbox — visible on hover, always visible in selection mode */}
      <div
        className={`absolute top-2 left-2 z-10 transition-opacity ${
          selectionMode ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleSelect();
        }}
      >
        <div
          className={`h-5 w-5 rounded border-2 flex items-center justify-center cursor-pointer transition-colors ${
            isSelected
              ? "bg-emerald-500 border-emerald-500"
              : "bg-white/90 border-gray-300 hover:border-emerald-400"
          }`}
        >
          {isSelected && (
            <svg
              className="h-3 w-3 text-white"
              fill="none"
              viewBox="0 0 12 12"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
            </svg>
          )}
        </div>
      </div>

      <a
        href={`https://x.com/${authorHandle}/status/${bookmark.id}`}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => {
          if (selectionMode) {
            e.preventDefault();
            onToggleSelect();
          }
        }}
        className={`flex flex-col h-[340px] rounded-xl border bg-white overflow-hidden hover:shadow-md transition-shadow no-underline ${
          isSelected ? "border-emerald-400 ring-2 ring-emerald-200" : "border-gray-200"
        }`}
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

          {/* Tweet text — larger and less clamped when text is the only visual */}
          {text && (
            <p
              className={`leading-snug text-gray-700 ${
                isTextOnly ? "text-[15px] line-clamp-5" : "text-sm line-clamp-3"
              }`}
            >
              {text}
            </p>
          )}

          {/* Article link preview block — always shown for articles */}
          {contentType === "article" && externalLink && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2 flex items-start gap-2">
              {faviconUrl && (
                <img
                  src={faviconUrl}
                  alt=""
                  className="mt-0.5 h-4 w-4 shrink-0"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              <div className="min-w-0">
                {externalLink.siteName && (
                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400 truncate">
                    {externalLink.siteName}
                  </p>
                )}
                {externalLink.title && (
                  <p className="text-xs font-medium text-gray-800 leading-snug line-clamp-2">
                    {externalLink.title}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Non-article external link title */}
          {contentType !== "article" && externalLink?.title && (
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
    </div>
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

// ── SelectionActionBar ────────────────────────────────────────────────────────

function SelectionActionBar({
  count,
  total,
  onSelectAll,
  onDeselectAll,
  onAddToCollection,
  onExportSelected,
  onDelete,
  onCancel,
}: {
  count: number;
  total: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onAddToCollection: () => void;
  onExportSelected: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-between border-t border-gray-200 bg-white px-6 py-3 shadow-lg">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-700">
          {count === 0 ? "None selected" : `${count} selected`}
        </span>
        {count < total ? (
          <button
            onClick={onSelectAll}
            className="text-xs text-emerald-600 hover:text-emerald-700 hover:underline"
          >
            Select all {total}
          </button>
        ) : (
          <button
            onClick={onDeselectAll}
            className="text-xs text-gray-400 hover:text-gray-600 hover:underline"
          >
            Deselect all
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onAddToCollection}
          disabled={count === 0}
          className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Add to collection
        </button>
        <button
          onClick={onExportSelected}
          disabled={count === 0}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Export selected
        </button>
        <button
          onClick={onDelete}
          disabled={count === 0}
          className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Delete{count > 0 ? ` ${count}` : ""}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── AddToCollectionModal ──────────────────────────────────────────────────────

function AddToCollectionModal({
  count,
  existingCollections,
  onClose,
  onConfirm,
}: {
  count: number;
  existingCollections: string[];
  onClose: () => void;
  onConfirm: (collection: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleAdd() {
    const col = name.trim();
    if (!col) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onConfirm(col);
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
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-base font-semibold text-gray-900">Add to collection</h2>
          <p className="mt-1 text-xs text-gray-500">
            {count} {count === 1 ? "bookmark" : "bookmarks"} will be added to the collection.
          </p>
        </div>

        {existingCollections.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {existingCollections.map((col) => (
              <button
                key={col}
                onClick={() => setName(col)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  name === col
                    ? "bg-sky-600 text-white"
                    : "bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200"
                }`}
              >
                {col}
              </button>
            ))}
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          placeholder="Collection name…"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        />

        {saveError && <p className="text-xs text-red-600">{saveError}</p>}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!name.trim() || saving}
            className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Adding…" : "Add to collection"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ExportNamingModal ─────────────────────────────────────────────────────────

function ExportNamingModal({
  defaultName,
  items,
  onClose,
}: {
  defaultName: string;
  items: Bookmark[];
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  function handleExport() {
    downloadAsBookmarkgarden(items, name.trim() || defaultName);
    onClose();
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
          <h2 className="text-base font-semibold text-gray-900">Export bookmarks</h2>
          <p className="mt-1 text-xs text-gray-500">
            {items.length} {items.length === 1 ? "bookmark" : "bookmarks"}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleExport();
            }}
            className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <span className="text-xs text-gray-400 shrink-0">.bookmarkgarden</span>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={!name.trim()}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DeleteCollectionModal ─────────────────────────────────────────────────────

function DeleteCollectionModal({
  collection,
  count,
  onClose,
  onConfirm,
}: {
  collection: string;
  count: number;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await onConfirm();
    } catch (err) {
      setDeleteError(String(err));
      setDeleting(false);
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
          <h2 className="text-base font-semibold text-gray-900">Delete "{collection}"?</h2>
          <p className="mt-1 text-sm text-gray-500">
            The collection label will be removed from {count}{" "}
            {count === 1 ? "bookmark" : "bookmarks"}. The bookmarks themselves will remain in your
            library.
          </p>
        </div>

        {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {deleting ? "Deleting…" : "Delete collection"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DeleteModal ───────────────────────────────────────────────────────────────

const DELETE_CONFIRM_PHRASE = "bookmark.garden";

function DeleteModal({
  count,
  onClose,
  onConfirm,
}: {
  count: number;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmed = input === DELETE_CONFIRM_PHRASE;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await onConfirm();
    } catch (err) {
      setDeleteError(String(err));
      setDeleting(false);
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
          <h2 className="text-base font-semibold text-gray-900">
            Delete {count} {count === 1 ? "bookmark" : "bookmarks"}?
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            This can't be undone. These bookmarks will be removed from your library and all
            collections permanently.
          </p>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs text-gray-500">
            Type{" "}
            <span className="font-mono font-medium text-gray-700">{DELETE_CONFIRM_PHRASE}</span> to
            confirm
          </p>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && confirmed) handleDelete();
            }}
            placeholder={DELETE_CONFIRM_PHRASE}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400"
            autoComplete="off"
          />
        </div>

        {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!confirmed || deleting}
            className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
