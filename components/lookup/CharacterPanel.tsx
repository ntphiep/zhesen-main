import type { CharInfo } from '@/lib/dictionary/types'
import { radicalInfo } from '@/lib/dictionary/radicals'
import { StrokeOrder } from './StrokeOrder'

export function CharacterPanel({ characters }: { characters: CharInfo[] }) {
  if (characters.length === 0) return null

  // getCharacters keeps one entry per glyph so the order matches the writing, so 有没有
  // arrives as 有, 没, 有. One card per distinct character, first appearance wins.
  const seen = new Map<string, { info: CharInfo; times: number }>()
  for (const info of characters) {
    const hit = seen.get(info.char)
    if (hit) hit.times += 1
    else seen.set(info.char, { info, times: 1 })
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Chữ và bộ thủ</h2>
      <div className="flex flex-col gap-2">
        {[...seen.values()].map(({ info: c, times }) => {
          const rad = radicalInfo(c.radical)
          return (
            <div key={c.char} className="flex items-start gap-4 rounded-lg bg-black/5 px-4 py-3">
              <span className="text-4xl font-bold leading-none">{c.char}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-3 text-black/70">
                  {c.pinyin.length > 0 && <span className="font-medium">{c.pinyin.join(', ')}</span>}
                  {c.hanViet.length > 0 && <span className="italic">{c.hanViet.join(', ')}</span>}
                  {times > 1 && <span className="text-xs text-black/50">xuất hiện {times} lần</span>}
                </div>
                <div className="flex flex-wrap gap-x-3 text-xs text-black/55">
                  {c.radical && (
                    <span>Bộ: {c.radical}{rad ? ` · ${rad.hanViet} (${rad.meaning})` : ''}</span>
                  )}
                  {c.strokeCount != null && <span>{c.strokeCount} nét</span>}
                </div>
                {c.gloss && <span className="text-xs text-black/55">{c.gloss}</span>}
              </div>
              <StrokeOrder char={c.char} />
            </div>
          )
        })}
      </div>
    </section>
  )
}
