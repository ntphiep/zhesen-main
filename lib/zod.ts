import { z } from 'zod'

/**
 * The project's single zod entry point, so the configuration below is in force
 * before any schema is built no matter which module loads first.
 *
 * zod 4 compiles a validator per schema with `new Function`, probing for it once
 * with `Function("")`. The Content-Security-Policy in next.config.ts does not
 * grant `'unsafe-eval'`, so in the browser that probe raises a `script-src`
 * violation on every page carrying a schema. zod catches it and interprets the
 * schema instead, so nothing breaks, but the fallback is better asked for than
 * discovered.
 *
 * Only in the browser. On the server `eval` is allowed and the compiled
 * validator is the faster path, which matters because every Supabase row is
 * parsed on the way out.
 */
z.config({ jitless: typeof window !== 'undefined' })

export { z }
