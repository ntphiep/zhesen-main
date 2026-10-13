/** The `loading.tsx` of an account page: the page's container, a title and three blocks,
 *  so the first visit is not a blank screen while the session and the rows are read. */
export function PageSkeleton() {
  return (
    <main aria-busy="true" className="mx-auto w-full max-w-page px-6 pt-8 pb-16">
      <div className="h-10 w-48 rounded-xl bg-(--tint-2)" />
      <div className="mt-8 flex flex-col gap-4">
        <div className="h-28 rounded-[20px] bg-(--tint-1)" />
        <div className="h-28 rounded-[20px] bg-(--tint-1)" />
        <div className="h-28 rounded-[20px] bg-(--tint-1)" />
      </div>
    </main>
  )
}
