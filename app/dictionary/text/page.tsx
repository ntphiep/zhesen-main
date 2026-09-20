import { TextLookup } from '@/components/search/TextLookup'
import { LookupTabs } from '@/components/search/LookupTabs'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Tra cả đoạn',
  description: 'Tra một cụm từ, một câu hoặc cả đoạn văn: từng từ một, kèm bản dịch cả đoạn.',
})

export default function Page() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-bold">Tra cả đoạn</h1>
      <p className="mt-1 text-sm text-black/60">
        Từng từ được tra trong từ điển. Bản dịch cả đoạn do trợ lý làm, nếu bản triển khai
        này có trợ lý.
      </p>
      <div className="mt-6">
        <LookupTabs />
      </div>
      <div className="mt-6">
        <TextLookup />
      </div>
    </main>
  )
}
