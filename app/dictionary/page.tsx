import { SearchBox } from '@/components/search/SearchBox'

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-3xl font-bold">Tra cứu</h1>
      <p className="mt-1 text-sm text-black/60">Gõ một từ tiếng Anh, Trung hoặc Tây Ban Nha — hệ thống tự nhận diện ngôn ngữ.</p>
      <div className="mt-6">
        <SearchBox initialQuery={sp.q ?? ''} autoFocus />
      </div>
    </main>
  )
}
