'use client'
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Globe, GlobeOptions } from '@/components/home/globe/Globe'
import type { World } from '@/components/home/globe/world'
import { watchScheme } from '@/lib/theme'

/** The globe on a canvas. d3-geo, topojson-client, the 110m atlas and the language map load
 *  through `import()` from this effect only, so a page without a mounted canvas never
 *  downloads them. The globe repaints on a scheme flip, because a canvas cannot read a CSS
 *  variable. `options` is read once, when the globe is built. */
export function useGlobe(canvas: RefObject<HTMLCanvasElement | null>, options: GlobeOptions): { globe: Globe | null; world: World | null } {
  const [state, setState] = useState<{ globe: Globe | null; world: World | null }>({ globe: null, world: null })
  const opts = useRef(options)

  useEffect(() => {
    let live = true
    let built: Globe | null = null
    let unwatch = () => {}
    Promise.all([import('@/components/home/globe/Globe'), import('@/components/home/globe/world')])
      .then(async ([{ Globe }, { loadWorld }]) => {
        const world = await loadWorld()
        const el = canvas.current
        if (!live || !el) return
        built = new Globe(el, world, opts.current)
        unwatch = watchScheme(() => built?.themeChanged())
        setState({ globe: built, world })
      })
      .catch((e: unknown) => console.error('globe failed to load', e))
    return () => { live = false; unwatch(); built?.destroy() }
  }, [canvas])

  return state
}
