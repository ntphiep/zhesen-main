// Builds the learner notes of every English entry from the kaikki English extract of Wiktionary
// (CC BY-SA 4.0) and writes the SQL that loads them into lex.entry_notes (migration 0198):
// origin, written syllables, homophones and the grammar labels of each sense.
//   curl -LO https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl
//   bash export.sh /tmp/wikt-notes        (on the instance, then copy the folder here)
//   node scripts/wiktNotes/build.mjs kaikki.org-dictionary-English.jsonl wikt-notes out.sql [word ...]
// Words given after out.sql are printed with their notes, to read before loading. The SQL
// replaces every row of the previous run, so a rerun after a data load is safe. Rerun it
// after any load that rewrites lex.senses: sense_grammar is keyed by lex.senses.id.
import { createReadStream, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const jiti = createJiti(import.meta.url, { alias: { '@': root } })
const { originOf, langNameOf, senseGrammar, syllablesOf, homophonesOf, standardForms, leadForms } = await jiti.import('@/lib/dictionary/etymology.ts')

const [jsonlPath, csvDir, outPath, ...samples] = process.argv.slice(2)
if (!outPath) throw new Error('usage: build.mjs kaikki-English.jsonl wikt-notes/ out.sql [word ...]')

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
  return rows.slice(1)
}

const POS = { adj: 'adjective', adv: 'adverb', name: 'proper_noun', intj: 'interjection', prep: 'preposition',
  conj: 'conjunction', pron: 'pronoun', num: 'numeral', det: 'determiner' }
const lexPos = (p) => POS[p] ?? p ?? ''
const norm = (g) => (g ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim()

// Entry id to frequency rank, empty for a word wordfreq does not list.
const entries = new Map(parseCsv(readFileSync(join(csvDir, 'entries.csv'), 'utf8')).map((r) => [r[0], r[1]]))
const senseByPos = new Map()
const senseByGloss = new Map()
for (const [id, entryId, pos, gloss] of parseCsv(readFileSync(join(csvDir, 'senses.csv'), 'utf8'))) {
  const g = norm(gloss)
  if (!g) continue
  senseByPos.set(`${entryId}|${pos}|${g}`, id)
  const k = `${entryId}|${g}`
  senseByGloss.set(k, senseByGloss.has(k) ? null : id)
}
console.log({ entries: entries.size, senses: senseByPos.size })

const notes = new Map()
const names = new Map()
// Every standard pronunciation of each ranked word, to check a homophone against.
const said = new Map()
const counts = { records: 0, inLex: 0, graded: 0, matched: 0 }
const lines = createInterface({ input: createReadStream(jsonlPath), crlfDelay: Infinity })
for await (const line of lines) {
  let r
  try { r = JSON.parse(line) } catch { continue }
  if (r.lang_code !== 'en' || !r.word) continue
  counts.records += 1
  const id = `en:${r.word}`
  if (!entries.has(id)) continue
  counts.inLex += 1
  const forms = standardForms(r.sounds)
  if (entries.get(id)) {
    const known = said.get(r.word) ?? new Set()
    for (const f of forms) known.add(f)
    said.set(r.word, known)
  }
  let n = notes.get(id)
  if (!n) { n = { word: r.word, etys: new Map(), syllables: null, candidates: new Set(), lead: null, leadForms: new Set(), grammar: {} }; notes.set(id, n) }
  const pos = lexPos(r.pos)

  const templates = r.etymology_templates ?? []
  for (const t of templates) {
    const name = langNameOf(t)
    if (!name) continue
    const byCode = names.get(t.args['2']) ?? new Map()
    byCode.set(name, (byCode.get(name) ?? 0) + 1)
    names.set(t.args['2'], byCode)
  }
  const etyKey = r.etymology_number ?? 0
  const known = n.etys.get(etyKey)
  if (known === undefined) n.etys.set(etyKey, originOf(r.word, templates, r.etymology_text, pos ? [pos] : []))
  else if (known && pos && !known.pos.includes(pos)) known.pos.push(pos)

  n.syllables ??= syllablesOf(r.word, r.hyphenations)
  // The first etymology is the word the page leads with: are the verb, not are the unit.
  n.lead ??= etyKey
  if (etyKey === n.lead) for (const f of leadForms(r.sounds)) n.leadForms.add(f)
  for (const h of homophonesOf(r.word, r.sounds, (w) => Boolean(entries.get(`en:${w}`)))) n.candidates.add(h)
  for (const s of r.senses ?? []) {
    const labels = senseGrammar(s.tags, s.raw_tags)
    if (!labels.length) continue
    counts.graded += 1
    const glosses = s.glosses ?? []
    const tries = [glosses[glosses.length - 1], glosses[0]].map(norm).filter(Boolean)
    const sid = tries.map((g) => senseByPos.get(`${id}|${pos}|${g}`) ?? senseByGloss.get(`${id}|${g}`)).find(Boolean)
    if (!sid) continue
    counts.matched += 1
    n.grammar[sid] = [...new Set([...(n.grammar[sid] ?? []), ...labels])]
  }
}

const langName = new Map([...names].map(([code, byName]) => [code, [...byName].sort((a, b) => b[1] - a[1])[0][0]]))

/** Wiktionary lists homophones of one accent unmarked (tent and tint in the pin-pen merger)
 *  and of every etymology at once (are and air), so one is kept only when a standard
 *  pronunciation of it equals the word's lead UK or US one. It must also be common (khat
 *  for cat ranks 73,342), not a name and not a letter. A name or an acronym gets none:
 *  SSHRC is said like shirk, which teaches nothing. */
const HOMOPHONE_RANK = 50000
function trustedHomophones(n) {
  if (n.word !== n.word.toLowerCase()) return []
  const out = []
  for (const h of n.candidates) {
    const rank = Number(entries.get(`en:${h}`))
    if (!(rank <= HOMOPHONE_RANK) || h.length < 2 || h !== h.toLowerCase()) continue
    if (![...(said.get(h) ?? [])].some((f) => n.leadForms.has(f))) continue
    out.push(h)
  }
  return out.slice(0, 6)
}

/** What makes two etymologies the same story: the ancestors, the parts and how it was made. */
const lineage = (o) => JSON.stringify([o.chain.map((s) => [s.lang, s.word]), o.parts?.map((p) => p.word), o.kind])

/** One row per entry: etymologies with the same lineage merged across parts of speech. */
function originsOf(n) {
  const out = []
  for (const o of n.etys.values()) {
    if (!o) continue
    for (const s of o.chain) { const name = langName.get(s.lang); if (name) s.name = name }
    for (const p of o.parts ?? []) if (entries.has(`en:${p.word}`)) p.e = true
    if (o.kind?.word && entries.has(`en:${o.kind.word}`)) o.kind.e = true
    if (o.doublets) o.doublets = o.doublets.filter((d) => entries.has(`en:${d}`))
    if (!o.doublets?.length) delete o.doublets
    // media lists Latin media twice, once borrowed and once derived, with the same ancestors.
    const same = out.find((x) => lineage(x) === lineage(o))
    if (!same) { out.push(o); continue }
    same.pos.push(...o.pos.filter((p) => !same.pos.includes(p)))
    const doublets = [...new Set([...(same.doublets ?? []), ...(o.doublets ?? [])])]
    if (doublets.length) same.doublets = doublets
  }
  return out
}

const copyText = (s) => s.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r')
const arrayLiteral = (xs) => `{${xs.map((x) => `"${x.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`

for (const n of notes.values()) n.homophones = trustedHomophones(n)

const rows = []
const totals = { origin: 0, chain: 0, parts: 0, kind: 0, syllables: 0, homophones: 0, grammar: 0, grammarSenses: 0 }
for (const [id, n] of notes) {
  const origin = originsOf(n)
  const grammarSenses = Object.keys(n.grammar).length
  if (!origin.length && !n.syllables && !n.homophones.length && !grammarSenses) continue
  totals.origin += origin.length ? 1 : 0
  totals.chain += origin.some((o) => o.chain.length) ? 1 : 0
  totals.parts += origin.some((o) => o.parts) ? 1 : 0
  totals.kind += origin.some((o) => o.kind) ? 1 : 0
  totals.syllables += n.syllables ? 1 : 0
  totals.homophones += n.homophones.length ? 1 : 0
  totals.grammar += grammarSenses ? 1 : 0
  totals.grammarSenses += grammarSenses
  rows.push([
    copyText(id),
    origin.length ? copyText(JSON.stringify(origin)) : '\\N',
    n.syllables ? copyText(arrayLiteral(n.syllables)) : '\\N',
    n.homophones.length ? copyText(arrayLiteral(n.homophones)) : '\\N',
    grammarSenses ? copyText(JSON.stringify(n.grammar)) : '\\N',
  ].join('\t'))
}
console.log(counts, { rows: rows.length, ...totals, languages: langName.size })
for (const w of samples) {
  const n = notes.get(`en:${w}`)
  console.log(`\n== ${w}`, n ? JSON.stringify({ origin: originsOf(n), syllables: n.syllables, homophones: n.homophones, grammar: n.grammar }) : 'none')
}

writeFileSync(outPath, `-- Generated by scripts/wiktNotes/build.mjs from the kaikki English extract of Wiktionary.
set statement_timeout = '900s';
begin;
create temp table notes (entry_id text, origin jsonb, syllables text[], homophones text[], sense_grammar jsonb) on commit drop;
copy notes from stdin;
${rows.join('\n')}
\\.
delete from lex.entry_notes where source_id = 'wiktionary-en';
insert into lex.entry_notes (entry_id, origin, syllables, homophones, sense_grammar, source_id)
select n.entry_id, n.origin, n.syllables, n.homophones, n.sense_grammar, 'wiktionary-en'
from notes n join lex.entries e on e.id = n.entry_id;
commit;
`)
console.log('rows', rows.length, 'written to', outPath)
