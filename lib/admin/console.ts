/**
 * The SQL console, the shell box and the restore of #65, as scripts for SSM
 * `AWS-RunShellScript`. Every piece of user text reaches the instance base64-encoded, so
 * no quote in it can end the shell word it sits in.
 */

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')

export type SqlMode = 'read' | 'write'

/** Read mode makes every transaction read-only for the session, so an UPDATE is refused
 *  by Postgres itself (25006). It stops mistakes, not the admin: `set` can undo it, and
 *  write mode exists for that. */
export function sqlScript(mode: SqlMode, sql: string): string {
  const options = mode === 'read'
    ? "-e PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=30000'"
    : "-e PGOPTIONS='-c statement_timeout=120000'"
  return `echo ${b64(sql)} | base64 -d | docker exec -i ${options} supabase-db psql -U supabase_admin -d postgres -X --csv -v ON_ERROR_STOP=1 -P pager=off`
}

/** Runs as root in bash; the command is decoded into a file so it may span lines. */
export function shellScript(command: string): string {
  return `f=$(mktemp) && echo ${b64(command)} | base64 -d > "$f" && bash "$f"; rc=$?; rm -f "$f"; exit $rc`
}

const MAX_COPIES = 2

export const DUMP_KEY = /^postgres\/postgres-\d{8}T\d{6}Z\.dump$/

/** A database name for a restore of `key`, unique per run. */
export function restoreName(key: string, now: number = Date.now()): string {
  const dump = key.match(/postgres-(\d{8})T/)?.[1] ?? 'x'
  const run = new Date(now).toISOString().replace(/\D/g, '').slice(0, 14)
  return `restore_${dump}_${run}`
}

/**
 * Restores `key` from the backup bucket into a new database `db`, in the background:
 * a restore outlives the function that starts it. Progress goes to a log whose last
 * line is `restore: done <entries>` or `restore: failed <code>`.
 */
export function restoreScript(bucket: string, key: string, db: string): string {
  if (!DUMP_KEY.test(key) || !/^restore_\w+$/.test(db)) throw new Error('bad restore target')
  const log = `/var/log/zhesen-${db}.log`
  const body = [
    'set -uo pipefail',
    `f=/var/backups/zhesen/${db}.dump`,
    `trap 'rc=$?; rm -f "$f"; [ $rc -ne 0 ] && echo "restore: failed $rc"' EXIT`,
    // Each copy is the size of production on the same disk.
    `k=$(docker exec supabase-db psql -U supabase_admin -d postgres -Atc "select count(*) from pg_database where datname like 'restore%'") || exit 13`,
    `[ "$k" -lt ${MAX_COPIES} ] || { echo "restore: ${MAX_COPIES} copies exist already; drop one first"; exit 14; }`,
    `aws s3 cp s3://${bucket}/${key} "$f" --only-show-errors || exit 10`,
    `docker exec supabase-db createdb -U supabase_admin ${db} || exit 11`,
    // Ownership and grants name roles by what production has; the copy is for reading.
    // pg_restore exits 1 on errors it ignored, so its code is reported, not fatal.
    `docker exec -i supabase-db pg_restore -U supabase_admin -d ${db} --no-owner --no-privileges < "$f" > "$f.log" 2>&1; rc=$?`,
    'tail -20 "$f.log"; rm -f "$f.log"',
    `n=$(docker exec supabase-db psql -U supabase_admin -d ${db} -Atc "select count(*) from lex.entries") || exit 12`,
    'echo "restore: done $n $rc"',
  ].join('\n')
  return `nohup bash -c 'echo ${b64(body)} | base64 -d | bash' > ${log} 2>&1 &\necho ${db}`
}

export function restoreStatusScript(db: string): string {
  if (!/^restore_\w+$/.test(db)) throw new Error('bad restore target')
  return `tail -25 /var/log/zhesen-${db}.log 2>/dev/null || echo 'restore: no log'`
}

/** `warnings` is pg_restore's exit code when it finished with errors it ignored. */
export type RestoreStatus = { state: 'running' | 'done' | 'failed' | 'missing'; entries: number | null; warnings: number; tail: string }

export function parseRestoreStatus(stdout: string): RestoreStatus {
  const last = stdout.trim().split('\n').at(-1) ?? ''
  const done = last.match(/^restore: done (\d+)(?: (\d+))?$/)
  if (done) return { state: 'done', entries: Number(done[1]), warnings: Number(done[2] ?? 0), tail: stdout }
  if (/^restore: failed/.test(last)) return { state: 'failed', entries: null, warnings: 0, tail: stdout }
  if (last === 'restore: no log') return { state: 'missing', entries: null, warnings: 0, tail: '' }
  return { state: 'running', entries: null, warnings: 0, tail: stdout }
}

const COMMAND_TAG = /^(CREATE|INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|COMMENT|BEGIN|COMMIT|ROLLBACK|SET|DO|COPY|VACUUM|ANALYZE|REFRESH|NOTIFY)( [A-Z]+)*( \d+)*$/

/** RFC 4180 CSV as psql --csv writes it. Null when the text is not one rectangular table,
 *  as when several statements or a command tag are mixed in; the page then shows it raw. */
export function parseCsv(text: string): string[][] | null {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (c !== '\r') cell += c
  }
  if (quoted) return null
  if (cell || row.length) { row.push(cell); rows.push(row) }
  if (rows.length === 0 || rows.some((r) => r.length !== rows[0].length)) return null
  // A command tag followed by a one-column result is rectangular too.
  if (rows[0].length === 1 && COMMAND_TAG.test(rows[0][0])) return null
  return rows
}
