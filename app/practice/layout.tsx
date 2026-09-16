import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { requirePermanentAccount } from '@/lib/auth/guard'

/**
 * Every practice mode grades into the account's FSRS schedule, so all of them
 * need an account. The guard lives here rather than in each mode page: six pages
 * under /practice had none, and opening /practice/quiz while signed out showed
 * "Chưa đủ từ" instead of the sign-in door. RLS still refused the data, so
 * nothing leaked; the screen simply lied about why it was empty.
 */
export default async function PracticeLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  await requirePermanentAccount(supabase, '/practice')
  return children
}
