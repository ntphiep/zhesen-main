/**
 * What the reader sees while a route that is not already in the cache renders.
 *
 * Without this file the App Router holds the old page on screen and paints
 * nothing until the whole server render arrives, so a click looks ignored.
 * Measured against production before this existed: `/practice` took 1,239 ms on
 * a cold function and 254 ms warm, and `/dictionary/en/quickly` 3,467 ms on its
 * first visit, all of it with no response to the click at all.
 *
 * It sits at the root so every route gets it, including ones nobody has written
 * yet. A prerendered page that is already prefetched never shows it: the router
 * only falls back here when the segment actually suspends.
 *
 * The bars are plain `animate-pulse` blocks in the same width as the page
 * heading and body, so the layout does not jump when the real content replaces
 * them.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10" aria-busy="true">
      <p className="sr-only" role="status">Đang tải…</p>
      <div className="animate-pulse flex flex-col gap-4">
        <div className="h-9 w-56 rounded-lg bg-black/10" />
        <div className="h-4 w-80 max-w-full rounded bg-black/5" />
        <div className="mt-4 flex flex-col gap-3">
          <div className="h-4 w-full rounded bg-black/5" />
          <div className="h-4 w-11/12 rounded bg-black/5" />
          <div className="h-4 w-4/5 rounded bg-black/5" />
          <div className="h-4 w-2/3 rounded bg-black/5" />
        </div>
      </div>
    </main>
  )
}
