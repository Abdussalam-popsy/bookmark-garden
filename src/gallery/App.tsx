import React, { useEffect, useState } from "react";
import type { Bookmark, ContentType } from "@/lib/db";

/** Read all bookmarks via raw IndexedDB — bypasses Dexie which has a
 *  known issue reading from extension pages when written by a service worker. */
function readAllBookmarks(): Promise<Bookmark[]> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("BookmarkGarden");
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      // DB doesn't exist yet — resolve empty rather than let upgrade proceed
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

export default function App() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ContentType | "all">("all");

  function load() {
    setLoading(true);
    setError(null);
    readAllBookmarks()
      .then((data) => {
        data.sort(
          (a, b) => new Date(b.bookmarkedAt).getTime() - new Date(a.bookmarkedAt).getTime()
        );
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

  const filtered = filter === "all" ? bookmarks : bookmarks.filter((b) => b.contentType === filter);

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
          <button
            onClick={load}
            className="mt-4 rounded bg-gray-200 px-3 py-1 text-sm text-gray-700"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur px-6 py-3">
        <div className="mx-auto max-w-7xl flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xl">🌿</span>
            <h1 className="font-semibold text-gray-900">Bookmark Garden</h1>
            <span className="text-xs text-gray-400 ml-1">{bookmarks.length} bookmarks</span>
            <button
              onClick={load}
              disabled={loading}
              className="ml-2 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-40"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-1">
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
          </div>
        </div>
      </header>

      {/* Grid */}
      <main className="mx-auto max-w-7xl p-6">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-gray-400 mt-12">No {filter} bookmarks yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((bookmark) => (
              <BookmarkCard key={bookmark.id} bookmark={bookmark} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function BookmarkCard({ bookmark }: { bookmark: Bookmark }) {
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

        {/* Date — push to bottom */}
        <p className="mt-auto pt-1 text-xs text-gray-400">
          {new Date(bookmark.bookmarkedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>
    </a>
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
