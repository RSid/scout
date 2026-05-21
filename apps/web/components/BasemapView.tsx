'use client'

import dynamic from 'next/dynamic'

import type { CorridorResponse } from '@/lib/api'
import type { GeoJSON } from 'geojson'

const LoadedMap = dynamic(() => import('./BasemapInner'), {
  loading: BasemapSkeleton,
  ssr: false,
})

type BasemapProps = Readonly<{
  corridor: CorridorResponse['features']
  route: GeoJSON.Feature<GeoJSON.LineString> | null
}>

export default function BasemapView({ corridor, route }: BasemapProps) {
  const mapMode =
    process.env.NEXT_PUBLIC_SCOUT_MAP_MODE === 'stub' ? 'stub' : 'interactive'

  if (mapMode === 'stub') {
    return <BasemapSkeleton />
  }

  return <LoadedMap corridor={corridor} route={route} />
}

function BasemapSkeleton() {
  return (
    <section
      aria-labelledby="scout-map-placeholder-title"
      className="relative flex min-h-[min(70vh,_640px)] w-full flex-col items-center justify-center gap-3 rounded-tokenLg border border-dashed border-border bg-surface-elevated px-6 text-center"
    >
      <h2 id="scout-map-placeholder-title" className="text-lg font-semibold text-[color:var(--color-text)]">
        Basemap scaffold (stubbed)
      </h2>
      <p className="max-w-[var(--measure-body)] text-[color:var(--color-text-muted)]">
        Set NEXT_PUBLIC_SCOUT_MAP_MODE=&quot;interactive&quot; locally to mount MapLibre.
      </p>
      <noscript>JavaScript is required for the interactive Scout map.</noscript>
    </section>
  )
}
