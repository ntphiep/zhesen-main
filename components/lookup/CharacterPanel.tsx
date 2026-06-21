import type { CharInfo } from '@/lib/dictionary/types'
import { radicalInfo } from '@/lib/dictionary/radicals'
import { StrokeOrder } from './StrokeOrder'

export function CharacterPanel({ characters }: { characters: CharInfo[] }) {
  if (characters.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Chữ và bộ thủ</h2>
      <div className="flex flex-col gap-2">
        {characters.map((c, i) => {
          const rad = radicalInfo(c.radical)
          return (
            <div key={i} className="flex flex-col gap-2 rounded-lg bg-black/5 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <span className="text-4xl font-bold leading-none">{c.char}</span>
                <StrokeOrder char={c.char} />
              </div>
              <div className="flex flex-col gap-0.5 text-sm">
                <div className="flex flex-wrap gap-x-3 text-black/70">
                  {c.pinyin.length > 0 && <span className="font-medium">{c.pinyin.join(', ')}</span>}
                  {c.hanViet.length > 0 && <span className="italic">{c.hanViet.join(', ')}</span>}
                </div>
                <div className="flex flex-wrap gap-x-3 text-xs text-black/50">
                  {c.radical && (
                    <span>Bộ: {c.radical}{rad ? ` · ${rad.hanViet} (${rad.meaning})` : ''}</span>
                  )}
                  {c.strokeCount != null && <span>{c.strokeCount} nét</span>}
                </div>
                {c.gloss && <span className="text-xs text-black/50">{c.gloss}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
