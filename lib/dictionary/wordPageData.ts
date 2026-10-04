import { getCachedEntryDetail, getCachedCrossLanguage, getCachedCharacters, getCachedInflections, getCachedEntriesContaining, getCachedTermPreviews, getCachedTappableTexts, getCachedWordKin } from './cached'
import { getCachedLearnerBacklinks, getCachedLearnerLayer } from './learnerCached'
import { getCachedGrammarPointsForEntry } from '@/lib/grammar/cached'
import { groupWordForms } from './family'
import { formNoteVi, lemmaFromSenses } from './lemma'
import { exampleCandidates, PREVIEWED_ITEMS, relatedTabs, senseSections } from './wordPage'
import type { WordViewInput } from './wordView'

/** Everything the word page reads for one entry, from the caches in `./cached`. Null when
 *  the entry does not exist. An inflected form whose lemma is an entry reads the lemma's
 *  page instead, with `formOf` naming the form, as WordReference and SpanishDict answer
 *  "emitted" with emit's entry under one line. */
export async function loadWordPage(entryId: string, followForm = true): Promise<WordViewInput | null> {
  // The reads keyed by the id alone start with the detail read rather than a wave after it.
  // The no-op catch only keeps an unknown entry's early return from leaving a rejection
  // unhandled; the await below still throws.
  const layer = getCachedLearnerLayer(entryId)
  const byId = Promise.all([
    getCachedCrossLanguage(entryId),
    getCachedInflections(entryId),
    getCachedGrammarPointsForEntry(entryId),
    getCachedLearnerBacklinks(entryId),
    layer,
  ])
  byId.catch(() => {})
  const detail = await getCachedEntryDetail(entryId)
  if (!detail) return null

  // The word this entry is a form of, resolved through the same preview call as
  // the related words so an inflected page is not a dead end. It only reads
  // `detail`, so it does not have to wait for the queries below.
  const lemma = lemmaFromSenses(detail.senses, detail.headword)
  if (lemma && followForm) {
    const lemmaId = (await getCachedTermPreviews(detail.lang, [lemma]))
      .find((p) => p.headword.toLowerCase() === lemma.toLowerCase() && p.id !== detail.id)?.id
    const base = lemmaId ? await loadWordPage(lemmaId, false) : null
    if (base) return { ...base, formOf: { id: detail.id, headword: detail.headword, note: formNoteVi(detail.senses, lemma) } }
  }
  const sections = senseSections(detail.senses)
  const candidateTexts = exampleCandidates(sections, detail.examples).map((e) => e.text)

  // The learner layouts' sentences, resolved as soon as the layer is in rather than after the
  // whole wave. Cached like the dictionary's sentences, so a tap on any layout reads nothing
  // more; a failure fails the render, as the dictionary's does, rather than cache plain text.
  const layerExamples = layer.then((learner) => {
    const known = new Set(candidateTexts)
    const texts = [...new Set((learner?.senses ?? []).flatMap((s) => [
      ...s.examples.map((x) => x.text),
      ...s.collocations.flatMap((c) => (c.example ? [c.example] : [])),
    ]))].filter((t) => !known.has(t))
    return texts.length > 0 ? getCachedTappableTexts(detail.lang, texts) : []
  })

  const [
    characters, [siblings, inflections, grammarPoints, backlinks, learner], containing, kin, resolvedExamples, layerResolved,
  ] = await Promise.all([
    detail.lang === 'zh' ? getCachedCharacters(detail.headword) : Promise.resolve([]),
    byId,
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
    getCachedTappableTexts(detail.lang, candidateTexts),
    layerExamples,
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

  return {
    detail, lemma, characters, siblings, inflections, grammarPoints, containing, kin, previews,
    resolvedExamples: [...resolvedExamples, ...layerResolved], learner, backlinks,
  }
}
