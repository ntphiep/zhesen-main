/** Shown on a result screen when at least one answer never reached the schedule.
 *  Amber rather than red: the practice happened, only the bookkeeping is short. */
export function GradeSyncWarning({ failed }: { failed: boolean }) {
  if (!failed) return null
  return (
    <p className="mt-3 text-sm text-amber-700">
      Chưa lưu được tiến độ phiên này. Kiểm tra mạng rồi ôn lại.
    </p>
  )
}
