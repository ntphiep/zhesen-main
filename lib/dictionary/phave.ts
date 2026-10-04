/** The PHaVE List (Garnier and Schmitt 2015): the 150 most frequent English phrasal verbs in
 *  COCA, most frequent first (https://norbertschmitt.co.uk/vocabulary-resources). */
const PHAVE: readonly string[] = [
  'go on', 'pick up', 'come back', 'come up', 'go back', 'find out', 'come out', 'go out',
  'point out', 'grow up', 'set up', 'turn out', 'get out', 'come in', 'take on', 'give up',
  'make up', 'end up', 'get back', 'look up', 'figure out', 'sit down', 'get up', 'take out',
  'come on', 'go down', 'show up', 'take off', 'work out', 'stand up', 'come down', 'go ahead',
  'go up', 'look back', 'wake up', 'carry out', 'take over', 'hold up', 'pull out', 'turn around',
  'take up', 'look down', 'put up', 'bring back', 'bring up', 'look out', 'bring in', 'open up',
  'check out', 'move on', 'put out', 'look around', 'catch up', 'go in', 'break down', 'get off',
  'keep up', 'put down', 'reach out', 'go off', 'cut off', 'turn back', 'pull up', 'set out',
  'clean up', 'shut down', 'turn over', 'slow down', 'wind up', 'turn up', 'line up', 'take back',
  'lay out', 'go over', 'hang up', 'go through', 'hold on', 'pay off', 'hold out', 'break up',
  'bring out', 'pull back', 'hang on', 'build up', 'throw out', 'hang out', 'put on', 'get down',
  'come over', 'move in', 'start out', 'call out', 'sit up', 'turn down', 'back up', 'put back',
  'send out', 'get in', 'blow up', 'carry on', 'set off', 'keep on', 'run out', 'make out',
  'shut up', 'turn off', 'bring about', 'step back', 'lay down', 'bring down', 'stand out',
  'come along', 'play out', 'break out', 'go around', 'walk out', 'get through', 'hold back',
  'write down', 'move back', 'fill out', 'sit back', 'rule out', 'move up', 'pick out', 'take down',
  'get on', 'give back', 'hand over', 'sum up', 'move out', 'come off', 'pass on', 'take in',
  'set down', 'sort out', 'follow up', 'come through', 'settle down', 'come around', 'fill in',
  'give out', 'give in', 'go along', 'break off', 'put off', 'come about', 'close down', 'put in',
  'set about',
]

const RANK = new Map(PHAVE.map((p, i) => [p, i + 1]))

/** A phrasal verb's PHaVE rank, 1 for go on; Infinity for one outside the list. */
export function phaveRank(headword: string): number {
  return RANK.get(headword.trim().toLowerCase()) ?? Infinity
}
