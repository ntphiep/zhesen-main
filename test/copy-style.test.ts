import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Folders whose copy follows `.claude/rules/copy.md`. Each area of #68 adds its own. */
const CHECKED = [
  'app/wordlist', 'components/wordlist', 'lib/wordlist',
  'app/practice', 'components/practice', 'lib/practice',
  'app/account', 'app/login', 'app/register', 'components/account', 'lib/auth',
  'components/ai', 'lib/ai',
  'app/dictionary', 'components/search', 'components/lookup', 'lib/dictionary', 'lib/translate',
  'app/page.tsx', 'app/layout.tsx', 'app/error.tsx', 'app/global-error.tsx', 'app/not-found.tsx',
  'app/api/ai', 'components/home', 'components/layout', 'components/ui', 'lib/languages.ts', 'lib/theme.ts', 'lib/home/worldFacts.ts',
  'app/theory', 'components/theory', 'components/grammar', 'components/reader', 'components/vocabulary', 'lib/grammar',
]

/** Content rather than interface copy, left to a later round of #68. */
const SKIPPED = ['lib/ai/tasks.ts', 'lib/dictionary/radicals.ts', 'lib/theory/']

const VIETNAMESE = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i
const LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g
const JSX_TEXT = /[>}]([^<>{}'"`]*[^\s<>{}'"`][^<>{}'"`]*)[<{]/g
/** A regex literal after an operator. Left in, `/[",]/` opens a string that swallows the rest of the file. */
const REGEX_LITERAL = /(?<=(?:[(,=:[!&|?{;]|\breturn)\s*)\/(?![/*])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[a-z]*/g

/** The measurable rules of `.claude/rules/copy.md`, by the name a failure reports. */
const RULES: [string, RegExp][] = [
  // "Tây Ban Nha" is Spanish, not the particle.
  ['form of address or politeness particle', /(?<!\p{L})(bạn|vui lòng|hãy|xin|nhé|(?<!ban )nha)(?!\p{L})/iu],
  ['semicolon', /;/],
  ['comma before và or hoặc', /,\s+(và|hoặc)(?!\p{L})/u],
  ['ampersand', /\s&\s|&amp;/],
  ['dash', /[—–]/],
  ['passive bởi', /(?<!\p{L})bởi(?! vì)(?!\p{L})/iu],
  ['internal word', /máy chủ|bản triển khai|hệ thống|FSRS|RPC|cache/i],
  ['glossary: trình độ, not cấp độ', /cấp độ/i],
  ['glossary: xóa, not xoá', /xoá/i],
  ['glossary: file, not tệp', /(?<!\p{L})tệp(?!\p{L})/iu],
  ['glossary: ôn, not ôn tập', /ôn tập/i],
  ['glossary: tra, not tra cứu', /tra cứu/i],
]

function sourceFiles(): string[] {
  return CHECKED.flatMap((entry) => {
    const path = join(process.cwd(), entry)
    if (statSync(path).isFile()) return [entry]
    return readdirSync(path, { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => `${entry}/${f.replaceAll('\\', '/')}`)
  }).filter((f) => !SKIPPED.some((s) => f.startsWith(s)))
}

/** Vietnamese string literals and JSX text in one file, comments removed. */
function strings(file: string): string[] {
  const code = readFileSync(join(process.cwd(), file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(REGEX_LITERAL, '')
  return [
    ...[...code.matchAll(LITERAL)].map((m) => m[1] ?? m[2] ?? m[3]),
    ...[...code.matchAll(JSX_TEXT)].map((m) => m[1]),
  ]
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => VIETNAMESE.test(s) && !s.includes('=>') && !s.includes('&&'))
}

describe('Vietnamese interface copy', () => {
  it('follows .claude/rules/copy.md in every checked folder', () => {
    const broken = sourceFiles().flatMap((file) =>
      strings(file).flatMap((s) =>
        RULES.filter(([, rule]) => rule.test(s)).map(([name]) => `${file}: ${name}: ${s}`),
      ),
    )
    expect(broken).toEqual([])
  })
})
