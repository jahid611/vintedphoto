'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { processPhotos } from '@/lib/pipeline'

const RADIUS = 72
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const STEPS = [
  { key: 'analyse', label: 'Analyse des photos' },
  { key: 'cutout', label: 'Détourage du sujet' },
  { key: 'light', label: 'Lumière, contraste, blancs' },
  { key: 'export', label: 'Recadrage et rendu final' },
] as const

export default function TraitementPage() {
  const router = useRouter()
  const { activeBatch, activeBatchId, hydrated, patchPhoto } = useStore()
  const cancelled = useRef(false)
  const started = useRef(false)
  const [photoProgress, setPhotoProgress] = useState(0)
  const [currentId, setCurrentId] = useState<string | null>(null)

  const photos = activeBatch?.photos ?? []
  const done = photos.filter((photo) => photo.status === 'ready' || photo.status === 'failed').length
  const total = photos.length

  useEffect(() => {
    if (hydrated && !activeBatchId) router.replace('/studio')
  }, [hydrated, activeBatchId, router])

  useEffect(() => {
    if (!activeBatch || started.current) return
    // Snapshot au premier rendu : le store change à chaque photo terminée,
    // on ne veut surtout pas relancer le traitement à chaque patch.
    const batchId = activeBatch.id
    const settings = activeBatch.settings
    const queue = activeBatch.photos.filter((photo) => photo.status !== 'ready')
    if (queue.length === 0) {
      router.replace('/lot')
      return
    }

    started.current = true
    cancelled.current = false

    void processPhotos(queue, settings, {
      isCancelled: () => cancelled.current,
      onStart: (photoId) => {
        setCurrentId(photoId)
        setPhotoProgress(0)
        patchPhoto(batchId, photoId, { status: 'working', error: undefined })
      },
      onProgress: (_photoId, fraction) => setPhotoProgress(fraction),
      onDone: (photoId, cutout, result) => {
        patchPhoto(batchId, photoId, { status: 'ready', cutout, result })
      },
      onFail: (photoId, message) => {
        patchPhoto(batchId, photoId, { status: 'failed', error: message })
      },
    }).then(() => {
      if (!cancelled.current) router.replace('/lot')
    })
  }, [activeBatch, patchPhoto, router])

  useEffect(
    () => () => {
      cancelled.current = true
    },
    [],
  )

  const overall = total === 0 ? 0 : (done + photoProgress) / total
  const currentStep = photoProgress < 0.85 ? 1 : photoProgress < 0.95 ? 2 : 3

  return (
    <main
      className="flex min-h-[100dvh] flex-col px-5 text-[#e8f2f2]"
      style={{ background: '#0b1415' }}
    >
      <div className="flex h-15 shrink-0 items-center justify-center">
        <span className="text-xs font-bold tracking-[0.12em] text-[#8fa3a4]">TRAITEMENT DU LOT</span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-7">
        <div className="relative h-[168px] w-[168px]">
          <svg width={168} height={168} viewBox="0 0 168 168" aria-hidden="true">
            <circle cx={84} cy={84} r={RADIUS} fill="none" stroke="#1c2c2e" strokeWidth={12} />
            <circle
              cx={84}
              cy={84}
              r={RADIUS}
              fill="none"
              stroke="#09b1ba"
              strokeWidth={12}
              strokeLinecap="round"
              strokeDasharray={`${CIRCUMFERENCE * overall} ${CIRCUMFERENCE}`}
              transform="rotate(-90 84 84)"
              style={{ transition: 'stroke-dasharray 240ms linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="font-display text-[44px] font-extrabold leading-none tracking-[-0.045em]">
              {done}
              <span className="text-2xl text-[#8fa3a4]">/{total}</span>
            </p>
            <p className="mt-1.5 text-xs tracking-wider text-[#8fa3a4]">PHOTOS PRÊTES</p>
          </div>
        </div>

        <div className="text-center">
          <h1 className="font-display text-2xl font-bold tracking-[-0.03em]">
            {done === total ? 'Lot terminé' : 'Détourage en cours…'}
          </h1>
          <p className="mt-1.5 text-sm text-[#8fa3a4]">
            Tout se passe sur ton téléphone. Reste sur l&apos;écran.
          </p>
        </div>

        <ul className="flex w-full flex-col gap-2.5">
          {STEPS.map((step, index) => {
            const complete = index < currentStep || done === total
            const active = index === currentStep && done !== total
            return (
              <li
                key={step.key}
                className={`flex items-center gap-3 rounded-[14px] px-4 py-3.5 ${
                  active ? 'border-[1.5px] border-[#09b1ba]' : ''
                } ${complete || active ? '' : 'opacity-55'}`}
                style={{ background: '#132022' }}
              >
                {complete ? (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#09b1ba]">
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#0b1415" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12.5 10 17.5 19 7" />
                    </svg>
                  </span>
                ) : (
                  <span
                    className={`h-6 w-6 shrink-0 rounded-full border-2 border-[#3a4c4e] ${
                      active ? 'spinner border-[3px] border-[#1c2c2e] border-t-[#09b1ba]' : ''
                    }`}
                  />
                )}
                <span className="flex-1 text-[15px] font-semibold">{step.label}</span>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="shrink-0 pb-6">
        <div className="mb-4 flex gap-1.5">
          {photos.map((photo) => (
            <span
              key={photo.id}
              title={photo.name}
              className="h-11 flex-1 rounded-[9px]"
              style={{
                background:
                  photo.status === 'ready'
                    ? '#ffffff'
                    : photo.status === 'failed'
                      ? '#f9c9c6'
                      : photo.id === currentId
                        ? '#09b1ba'
                        : '#1c2c2e',
              }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            cancelled.current = true
            router.replace('/lot')
          }}
          className="mx-auto block px-4 py-3 text-sm font-semibold text-[#8fa3a4]"
        >
          Arrêter et voir ce qui est prêt
        </button>
      </div>
    </main>
  )
}
