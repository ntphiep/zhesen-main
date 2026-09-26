import { getCachedEntryDetail, getCachedCrossLanguage, getCachedCharacters, getCachedInflections, getCachedEntriesContaining, getCachedTermPreviews, getCachedTappableTexts, getCachedWordKin } from './cached'
import { getCachedGrammarPointsForEntry } from '@/lib/grammar/cached'
import { groupWordForms } from './family'
import { lemmaFromSenses } from './lemma'
import { exampleCandidates, PREVIEWED_ITEMS, relatedTabs, senseSections } from './wordPage'
import type { WordViewInput } from './wordView'

/** Everything the word page reads for one entry, from the caches in `./cached`. Null when
 *  the entry does not exist. */
export async function loadWordPage(entryId: string): Promise<WordViewInput | null> {
  const detail = await getCachedEntryDetail(entryId)
  if (!detail) return null

  // The word this entry is a form of, resolved through the same preview call as
  // the related words so an inflected page is not a dead end. It only reads
  // `detail`, so it does not have to wait for the queries below.
  const lemma = lemmaFromSenses(detail.senses, detail.headword)
  const sections = senseSections(detail.senses)

  const [characters, siblings, inflections, grammarPoints, containing, kin, resolvedExamples] = await Promise.all([
    detail.lang === 'zh' ? getCachedCharacters(detail.headword) : Promise.resolve([]),
    getCachedCrossLanguage(entryId),
    getCachedInflections(entryId),
    getCachedGrammarPointsForEntry(entryId),
    getCachedEntriesContaining(detail.lang, detail.headword),
    // The stem the derived words hang off: the lemma when this entry is a form of
    // something else, otherwise the headword itself. Chinese is left out because a
    // prefix of a Chinese headword is a compound, which `containing` already answers.
    detail.lang === 'zh'
      ? Promise.resolve([])
      : getCachedWordKin(detail.lang, lemma ?? detail.headword, detail.headword),
    // Resolve the example sentences here rather than letting each one do it from
    // the browser. Done there, a Chinese entry issued eighteen requests and showed
    // nothing until the last returned; done here the sentences are in the HTML.
    //
    // In this wave rather than the next one: it reads `detail.examples` and
    // nothing the queries above return, so waiting for them bought nothing while
    // adding its own round trip to the page's critical path. Measured against
    // production on a first visit, the sentences of `en:quickly` took 680 ms and
    // `zh:朋友` 716 ms, all of it after the wave above had already finished.
    //
    // Every sentence the page can show, so none resolves itself from the browser.
    getCachedTappableTexts(detail.lang, exampleCandidates(sections, detail.examples).map((e) => e.text)),
  ])

  // The related words are stored as bare text, so one more call gives the meaning and
  // part of speech of the ones the page lists before expanding. It runs once the lists
  // are known, because they drop duplicates and inflected forms, and is cached on their
  // contents. An entry row carries its own meaning but a containing phrase no part of
  // speech, so those are asked for too.
  const tabs = relatedTabs({
    lang: detail.lang, headword: detail.headword, lemma, relations: detail.relations,
    containing, kin, formTexts: groupWordForms(inflections).map((f) => f.text), previews: {},
  })
  const terms = [
    ...tabs.flatMap((t) => t.items.slice(0, PREVIEWED_ITEMS)).filter((i) => !i.entry || !i.pos).map((i) => i.text),
    ...(lemma ? [lemma] : []),
  ]
  const previewRows = await getCachedTermPreviews(detail.lang, terms)
  const previews = Object.fromEntries(previewRows.map((p) => [p.matchText.toLowerCase(), p]))

  return { detail, lemma, characters, siblings, inflections, grammarPoints, containing, kin, previews, resolvedExamples }
}
