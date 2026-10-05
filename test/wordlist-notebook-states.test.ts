import { describe, it, expect } from 'vitest'
import { clientReturning } from './helpers/supabase'
import { readNotebookStates } from '@/lib/wordlist/stats'

describe('readNotebookStates', () => {
  it('reads every entry of a passage in one query, by entry id', async () => {
    const { client, builder, from } = clientReturning([])
    await readNotebookStates(client, ['en:dog', 'en:cat'])
    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('user_words')
    expect(builder.in).toHaveBeenCalledWith('entry_id', ['en:dog', 'en:cat'])
  })

  // Known is the learner's own mark or a mature interval, the line the wordlist's
  // progress bar draws at 21 days.
  it('calls a word known when marked so or scheduled 21 days out, else saved', async () => {
    const { client } = clientReturning([
      { entry_id: 'en:dog', status: 'new', fsrs_reps: 0, fsrs_scheduled_days: 0 },
      { entry_id: 'en:cat', status: 'learning', fsrs_reps: 6, fsrs_scheduled_days: 21 },
      { entry_id: 'en:bird', status: 'known', fsrs_reps: 0, fsrs_scheduled_days: 0 },
      { entry_id: 'en:fish', status: 'learning', fsrs_reps: 3, fsrs_scheduled_days: 9 },
    ])
    const states = await readNotebookStates(client, ['en:dog', 'en:cat', 'en:bird', 'en:fish', 'en:cow'])
    expect(Object.fromEntries(states)).toEqual({ 'en:dog': 'saved', 'en:cat': 'known', 'en:bird': 'known', 'en:fish': 'saved' })
  })

  it('asks nothing for a passage with no dictionary words', async () => {
    const { client, from } = clientReturning([])
    expect((await readNotebookStates(client, [])).size).toBe(0)
    expect(from).not.toHaveBeenCalled()
  })
})
