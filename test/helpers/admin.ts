/** The shape `admin.metrics()` returned on production, trimmed to three tables. */
export const METRICS_PAYLOAD = {
  tables: [
    { schema: 'lex', name: 'entries', rows: 36361, bytes: 30515200 },
    { schema: 'lex', name: 'senses', rows: 183526, bytes: 79937536 },
    { schema: 'public', name: 'user_words', rows: 445, bytes: 253952 },
  ],
  database_bytes: 472063123,
  relation_bytes: 301293568,
  pgroonga_indexes: 2,
  pgroonga_surplus: 0,
  accounts: { total: 7, permanent: 5 },
  lex_updated_at: '2026-09-12T07:22:39.815249+00:00',
}
