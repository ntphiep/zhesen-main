import { redirect } from 'next/navigation'

export default async function AdminDataPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { table } = await searchParams
  redirect(typeof table === 'string' ? `/admin/database?table=${encodeURIComponent(table)}` : '/admin/database')
}
