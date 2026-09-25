import { redirect } from 'next/navigation'

/** The architecture map now sits on the overview. */
export default function AdminArchitecturePage() {
  redirect('/admin')
}
