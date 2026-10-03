import type { Language } from '@/lib/languages'
import { SITE_URL } from '@/lib/site'
import { THEORY_BLOCKS, type TheoryBlockKey } from '@/lib/theory/blocks'
import { THEORY_PATH, theoryBlockPath, theoryLangPath } from '@/lib/theory/path'

/** One step of the trail. The last may leave out `path`: Google then takes the page's own URL. */
export interface Crumb {
  name: string
  path?: string
}

/** schema.org `BreadcrumbList`, with absolute URLs as Google's breadcrumb guide requires. */
export function breadcrumbList(trail: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      ...(crumb.path ? { item: new URL(crumb.path, SITE_URL).href } : {}),
    })),
  }
}

/** `<` escaped as the Next JSON-LD guide shows, so a name holding `</script>` stays data. */
export function BreadcrumbJsonLd({ trail }: { trail: Crumb[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbList(trail)).replace(/</g, '\\u003c') }}
    />
  )
}

/** Lý thuyết, the language, then the block and the page inside it when there is one. */
export function TheoryBreadcrumb({ language, block, leaf }: { language: Language; block?: TheoryBlockKey; leaf?: string }) {
  const trail: Crumb[] = [
    { name: 'Lý thuyết', path: THEORY_PATH },
    { name: language.name, path: theoryLangPath(language.code) },
  ]
  if (block) {
    const title = THEORY_BLOCKS.find((b) => b.key === block)?.titleVi ?? block
    trail.push({ name: title, path: theoryBlockPath(language.code, block) })
  }
  if (leaf) trail.push({ name: leaf })
  return <BreadcrumbJsonLd trail={trail} />
}
