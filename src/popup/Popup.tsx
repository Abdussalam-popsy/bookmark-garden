import React from "react";

export default function Popup() {
  function handleIndexBookmarks() {
    // TODO: send INDEX_BOOKMARKS message to background service worker
    // For now this is a visual stub — wiring comes in the next phase
    console.warn("Index bookmarks: not yet implemented");
  }

  function handleOpenGallery() {
    // TODO: chrome.tabs.create({ url: chrome.runtime.getURL("gallery.html") })
    console.warn("Open gallery: not yet implemented");
  }

  return (
    <div className="w-64 p-4 font-sans">
      <header className="mb-4 flex items-center gap-2">
        <span className="text-2xl">🌿</span>
        <h1 className="text-base font-semibold text-gray-900">Bookmark Garden</h1>
      </header>

      <div className="flex flex-col gap-2">
        <button
          onClick={handleIndexBookmarks}
          className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        >
          Index bookmarks
        </button>

        <button
          onClick={handleOpenGallery}
          className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        >
          Open gallery
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-gray-400">v0.1.0 — local only</p>
    </div>
  );
}
