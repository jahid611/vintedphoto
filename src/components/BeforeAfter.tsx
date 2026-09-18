'use client'

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useObjectUrl } from './media'

interface Props {
  before?: Blob | null
  after?: Blob | null
  /** largeur / hauteur du cadre */
  ratio: number
}

/**
 * Comparateur à volet. C'est l'écran qui vend l'app : sans preuve visuelle
 * du avant / après, personne ne recharge de crédits.
 */
export function BeforeAfter({ before, after, ratio }: Props) {
  const beforeRef = useObjectUrl(before)
  const afterRef = useObjectUrl(after)
  const [split, setSplit] = useState(46)
  const frameRef = useRef<HTMLDivElement>(null)

  const moveTo = useCallback((clientX: number) => {
    const frame = frameRef.current
    if (!frame) return
    const rect = frame.getBoundingClientRect()
    const next = ((clientX - rect.left) / rect.width) * 100
    setSplit(Math.min(100, Math.max(0, next)))
  }, [])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    moveTo(event.clientX)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.buttons === 0) return
    moveTo(event.clientX)
  }

  return (
    <div
      ref={frameRef}
      className="relative w-full touch-none overflow-hidden rounded-[20px] border border-app-line bg-app-card select-none"
      style={{ aspectRatio: String(ratio) }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={afterRef}
        alt="Résultat Dripshot"
        className="absolute inset-0 h-full w-full object-contain"
      />

      {/* clip-path plutôt qu'un conteneur à largeur variable : les deux calques
          gardent exactement la même boîte, donc le volet ne décale jamais l'image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={beforeRef}
        alt="Photo d'origine"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
      />

      <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${split}%` }} aria-hidden="true" />

      <label className="sr-only" htmlFor="before-after-split">
        Position du comparateur avant / après
      </label>
      <input
        id="before-after-split"
        type="range"
        min={0}
        max={100}
        value={Math.round(split)}
        onChange={(event) => setSplit(Number(event.target.value))}
        className="sr-only"
      />

      <div
        className="pointer-events-none absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.22)]"
        style={{ left: `${split}%` }}
        aria-hidden="true"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0E1A1B" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.5 7 5.5 12l4 5M14.5 7l4 5-4 5" />
        </svg>
      </div>

      <span className="absolute left-3 top-3 rounded-lg bg-[rgba(14,26,27,0.66)] px-2.5 py-1 text-[11px] font-bold tracking-widest text-white">
        AVANT
      </span>
      <span className="absolute right-3 top-3 rounded-lg bg-brand-700 px-2.5 py-1 text-[11px] font-bold tracking-widest text-white">
        APRÈS
      </span>
    </div>
  )
}
