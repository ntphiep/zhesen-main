import { getCachedEntryDetail, getCachedCrossLanguage, getCachedCharacters, getCachedInflections, getCachedEntriesContaining, getCachedTermPreviews, getCachedTappableTexts, getCachedWordKin } from './cached'
import { getCachedLearnerBacklinks, getCachedLearnerLayer } from './learnerCached'
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

  const [characters, siblings, inflections, grammarPoints, containing, kin, resolvedExamples, learner, backlinks] = await Promise.all([
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
    getCachedLearnerLayer(entryId),
    getCachedLearnerBacklinks(entryId),
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
  // The learner layouts' sentences, resolved beside the previews rather than in the first
  // wave, which would have to wait for the layer. Cached like the dictionary's sentences, so
  // a tap on any layout reads nothing more; a failure leaves them as plain text.
  const known = new Set(resolvedExamples.map((r) => r.text))
  const layerTexts = [...new Set((learner?.senses ?? []).flatMap((s) => [
    ...s.examples.map((x) => x.text),
    ...s.collocations.flatMap((c) => (c.example ? [c.example] : [])),
  ]))].filter((t) => !known.has(t))
  const [previewRows, layerExamples] = await Promise.all([
    getCachedTermPreviews(detail.lang, terms),
    layerTexts.length > 0 ? getCachedTappableTexts(detail.lang, layerTexts).catch(() => []) : Promise.resolve([]),
  ])
  const previews = Object.fromEntries(previewRows.map((p) => [p.matchText.toLowerCase(), p]))

  return {
    detail, lemma, characters, siblings, inflections, grammarPoints, containing, kin, previews,
    resolvedExamples: [...resolvedExamples, ...layerExamples], learner, backlinks,
  }
}
