// Composes an IPA for every English phrase, idiom and collocation that has none, and writes the
// SQL that loads it. Input is the two CSV files export.sh writes on the instance.
//   node scripts/phraseIpa/build.mjs phrases.csv prons.csv out.sql
// It also composes the phrases that already carry an IPA and prints how close it comes. The
// output replaces every row of the previous run, so a rerun after a data load is safe.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const { composePhraseIpa } = await jiti.import('@/lib/dictionary/phraseIpa.ts')
const { pickAccentRows } = await jiti.import('@/lib/dictionary/pronunciation.ts')

export const SOURCE_ID = 'zhesen-phrase-ipa'

/** RFC 4180 rows: quoted fields may hold commas, quotes and newlines. */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1 }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const [head, ...body] = rows
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}

const sounds = (ipa) => ipa.normalize('NFD').replace(/[̀-ͯ/[\]ˈˌ.\s‿]/g, '')
function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    row = next
  }
  return row[b.length]
}

const [phrasesPath, pronsPath, outPath] = process.argv.slice(2)
if (!outPath) throw new Error('usage: build.mjs phrases.csv prons.csv out.sql')

const pronRows = parseCsv(readFileSync(pronsPath, 'utf8'))
  .sort((a, b) => Number(b.lemma === 't') - Number(a.lemma === 't') || Number(a.pron_id) - Number(b.pron_id))
const byToken = new Map()
const byEntry = new Map()
for (const r of pronRows) {
  const p = { accent: r.accent, ipa: r.ipa || null, audioUrl: r.audio_url || null }
  if (r.entry_type === 'word') {
    if (!byToken.has(r.token)) byToken.set(r.token, [])
    byToken.get(r.token).push(p)
  } else {
    if (!byEntry.has(r.entry_id)) byEntry.set(r.entry_id, [])
    byEntry.get(r.entry_id).push(p)
  }
}

const lines = []
const stats = { phrases: 0, without: 0, uk: 0, us: 0, either: 0, checked: 0, exact: 0, near: 0 }
for (const e of parseCsv(readFileSync(phrasesPath, 'utf8'))) {
  stats.phrases += 1
  const isVerb = e.pos.split(',').includes('verb')
  const ipa = composePhraseIpa(e.headword, byToken, isVerb)
  if (e.has_ipa === 't') {
    for (const accent of ['uk', 'us']) {
      const own = pickAccentRows(byEntry.get(e.id) ?? [], 'en', e.headword).find((r) => r.label.toLowerCase() === accent)?.ipa
      if (!own || !ipa[accent] || own.startsWith('[')) continue
      stats.checked += 1
      const d = distance(sounds(own), sounds(ipa[accent]))
      if (d === 0) stats.exact += 1
      if (d <= 2) stats.near += 1
    }
    continue
  }
  stats.without += 1
  if (ipa.uk) { stats.uk += 1; lines.push(`${e.id}\ten-UK\t${ipa.uk}`) }
  if (ipa.us) { stats.us += 1; lines.push(`${e.id}\ten-US\t${ipa.us}`) }
  if (ipa.uk || ipa.us) stats.either += 1
}

writeFileSync(outPath, `\\set ON_ERROR_STOP on
begin;
set local statement_timeout = '600s';
insert into lex.sources (id, name, url, license, tier, notes) values
  ('${SOURCE_ID}', 'zhesen phrase IPA, composed from its words'' transcriptions', null, 'CC BY-SA 4.0',
   'open', 'Built by scripts/phraseIpa/build.mjs from the English Wiktionary and CMUdict rows of each word.')
on conflict (id) do nothing;
create temp table phrase_ipa (entry_id text, accent text, ipa text) on commit drop;
copy phrase_ipa from stdin;
${lines.join('\n')}
\\.
delete from lex.pronunciations where source_id = '${SOURCE_ID}';
insert into lex.pronunciations (entry_id, accent, ipa, source_id, tier)
select t.entry_id, t.accent, t.ipa, '${SOURCE_ID}', 'open'
from phrase_ipa t
join lex.entries e on e.id = t.entry_id
where not exists (select 1 from lex.pronunciations p where p.entry_id = t.entry_id and p.ipa is not null);
update public.user_words u set ipa = (
  select p.ipa from lex.pronunciations p
  where p.entry_id = u.entry_id and p.source_id = '${SOURCE_ID}'
  order by p.accent = 'en-US' desc limit 1)
where u.lang = 'en' and u.ipa is null and u.entry_id is not null
  and exists (select 1 from lex.pronunciations p where p.entry_id = u.entry_id and p.source_id = '${SOURCE_ID}');
select count(*) as rows, count(distinct entry_id) as entries from lex.pronunciations where source_id = '${SOURCE_ID}';
commit;
`)
console.log(JSON.stringify(stats))
