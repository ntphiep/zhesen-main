import Link from 'next/link'

export function PracticeModes({ due }: { due: number }) {
  const modes = [
    { href: '/practice/review', label: 'Ôn tập', sub: due > 0 ? `${due} từ cần ôn` : 'Lặp lại ngắt quãng', primary: due > 0 },
    { href: '/practice/quiz', label: 'Kiểm tra', sub: 'Trắc nghiệm 4 đáp án', primary: false },
    { href: '/practice/write', label: 'Viết từ', sub: 'Nghĩa → gõ từ', primary: false },
    { href: '/practice/dictation', label: 'Nghe & chép', sub: 'Nghe → gõ từ', primary: false },
    { href: '/practice/match', label: 'Ghép cặp', sub: 'Nối từ với nghĩa', primary: false },
    { href: '/practice/speak', label: 'Luyện nói', sub: 'Đọc lại, AI chấm', primary: false },
  ]
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {modes.map((m) => (
        <Link
          key={m.href}
          href={m.href}
          className={`flex flex-col rounded-xl border px-4 py-3 transition ${m.primary ? 'border-black bg-black text-white' : 'border-black/10 hover:bg-black/5'}`}
        >
          <span className="font-medium">{m.label}</span>
          <span className={`text-xs ${m.primary ? 'text-white/70' : 'text-black/50'}`}>{m.sub}</span>
        </Link>
      ))}
    </div>
  )
}
