'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { BeforeAfter } from '@/components/BeforeAfter'
import { BackIcon, ResetIcon } from '@/components/Icons'
import { renderPhoto, renderPreview } from '@/lib/image/compose'
import { BACKGROUNDS, FILTERS, FORMATS, getFormat } from '@/lib/presets'
import { useStore } from '@/lib/store'
import { DEFAULT_ADJUSTMENTS, type Adjustments, type PhotoSettings } from '@/lib/types'

type Tab = 'light' | 'background' | 'style'

const SLIDERS: { key: keyof Adjustments; label: string }[] = [
  { key: 'brightness', label: 'Luminosité' },
  { key: 'contrast', label: 'Contraste' },
  { key: 'saturation', label: 'Saturation' },
  { key: 'temperature', label: 'Température' },
]

function EditorScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const { activeBatch, hydrated, patchPhoto, setSettings } = useStore()
  const photoId = params.get('photo')

  const photo = useMemo(
    () => activeBatch?.photos.find((item) => item.id === photoId) ?? activeBatch?.photos[0] ?? null,
    [activeBatch, photoId],
  )

  const [draft, setDraft] = useState<PhotoSettings | null>(null)
  const [draftBatchId, setDraftBatchId] = useState<string | null>(null)
  const [preview, setPreview] = useState<Blob | null>(null)
  const [tab, setTab] = useState<Tab>('light')
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    if (hydrated && !activeBatch) router.replace('/studio')
  }, [hydrated, activeBatch, router])

  // Le lot arrive après l'hydratation d'IndexedDB : on amorce le brouillon
  // pendant le rendu (et non dans un effet) pour éviter une passe à vide.
  if (activeBatch && draftBatchId !== activeBatch.id) {
    setDraftBatchId(activeBatch.id)
    setDraft(activeBatch.settings)
  }

  // Aperçu réduit re-rendu à chaque réglage, avec un court délai : bouger un
  // curseur ne doit pas enchaîner dix rendus pleine taille.
  useEffect(() => {
    if (!photo || !draft) return
    let stale = false
    const timer = setTimeout(() => {
      renderPreview(photo.original, photo.cutout, draft)
        .then((result) => {
          if (!stale) setPreview(result.blob)
        })
        .catch(() => {
          if (!stale) setPreview(null)
        })
    }, 180)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [photo, draft])

  if (!activeBatch || !photo || !draft) return null

  const index = activeBatch.photos.findIndex((item) => item.id === photo.id)
  const next = activeBatch.photos[index + 1]
  const format = getFormat(draft.format)

  const patchDraft = (patch: Partial<PhotoSettings>) => setDraft({ ...draft, ...patch })
  const patchAdjustment = (key: keyof Adjustments, value: number) =>
    setDraft({ ...draft, adjustments: { ...draft.adjustments, [key]: value } })

  async function applyToBatch() {
    if (!activeBatch || !draft) return
    setApplying(true)
    setSettings(activeBatch.id, draft)
    for (const item of activeBatch.photos) {
      if (item.status === 'failed') continue
      try {
        const { blob } = await renderPhoto(item.original, item.cutout, draft)
        patchPhoto(activeBatch.id, item.id, { result: blob, status: 'ready' })
      } catch {
        patchPhoto(activeBatch.id, item.id, { status: 'failed', error: 'Rendu impossible.' })
      }
    }
    setApplying(false)
    router.push('/lot')
  }

  return (
    <main className="flex min-h-[100dvh] flex-col bg-app-card">
      <header className="flex h-15 shrink-0 items-center justify-between border-b border-app-line pl-2 pr-3">
        <Link href="/lot" aria-label="Retour au lot" className="flex h-11 w-11 items-center justify-center">
          <BackIcon size={22} />
        </Link>
        <div className="text-center">
          <p className="truncate text-[15px] font-bold">{photo.name.replace(/\.[^.]+$/, '')}</p>
          <p className="mt-0.5 text-xs text-app-muted">
            Photo {index + 1} sur {activeBatch.photos.length}
          </p>
        </div>
        {next ? (
          <Link
            href={`/editeur?photo=${next.id}`}
            className="flex h-11 items-center px-2.5 text-sm font-bold text-app-brand"
          >
            Suivant
          </Link>
        ) : (
          <span className="w-11" />
        )}
      </header>

      <div className="shrink-0 px-5 pt-4">
        <BeforeAfter before={photo.original} after={preview} ratio={format.ratio} />
      </div>

      <div className="shrink-0 px-5 pt-4">
        <div className="flex gap-2">
          {FORMATS.map((item) => {
            const active = item.id === draft.format
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => patchDraft({ format: item.id })}
                className={`flex h-[46px] flex-1 flex-col items-center justify-center rounded-[14px] ${
                  active ? 'bg-brand-700 text-white' : 'bg-app-sunken text-app-text'
                }`}
              >
                <span className="text-[13px] font-bold">{item.label}</span>
                <span className={`text-[11px] ${active ? 'opacity-85' : 'text-app-muted'}`}>
                  {item.ratioLabel}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 px-5 pt-4.5">
        <div className="mb-3.5 flex gap-5 border-b border-app-line">
          {(
            [
              ['light', 'Lumière'],
              ['background', 'Fond'],
              ['style', 'Style'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`pb-2.5 text-sm ${
                tab === key
                  ? 'border-b-[2.5px] border-brand-700 font-bold text-brand-700'
                  : 'font-semibold text-app-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'light' ? (
          <div className="flex flex-col gap-3">
            <label className="flex items-center justify-between rounded-2xl bg-app-sunken px-4 py-3">
              <span className="text-sm font-semibold">Correction automatique</span>
              <input
                type="checkbox"
                checked={draft.autoLevels}
                onChange={(event) => patchDraft({ autoLevels: event.target.checked })}
                className="h-6 w-6 accent-brand-700"
              />
            </label>
            {SLIDERS.map(({ key, label }) => (
              <div key={key}>
                <div className="mb-1 flex justify-between">
                  <label htmlFor={key} className="text-[13px] font-semibold">
                    {label}
                  </label>
                  <span className="text-[13px] text-app-muted">
                    {draft.adjustments[key] > 0 ? '+' : ''}
                    {draft.adjustments[key]}
                  </span>
                </div>
                <input
                  id={key}
                  type="range"
                  min={-50}
                  max={50}
                  value={draft.adjustments[key]}
                  onChange={(event) => patchAdjustment(key, Number(event.target.value))}
                />
              </div>
            ))}
          </div>
        ) : null}

        {tab === 'background' ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2.5">
              {BACKGROUNDS.map((item) => {
                const active = item.id === draft.background
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => patchDraft({ background: item.id })}
                    className="text-left"
                  >
                    <span
                      className={`block aspect-square rounded-[14px] ${
                        item.swatch === 'checker' ? 'checkerboard' : ''
                      } ${active ? 'border-[2.5px] border-brand-700' : 'border border-app-line'}`}
                      style={item.swatch === 'checker' ? undefined : { background: item.swatch }}
                    />
                    <span
                      className={`mt-1.5 block text-xs ${active ? 'font-bold text-brand-800' : 'font-semibold'}`}
                    >
                      {item.label}
                    </span>
                  </button>
                )
              })}
            </div>
            <label className="flex items-center justify-between rounded-2xl bg-app-sunken px-4 py-3">
              <span className="text-sm font-semibold">Ombre portée</span>
              <input
                type="checkbox"
                checked={draft.shadow}
                onChange={(event) => patchDraft({ shadow: event.target.checked })}
                className="h-6 w-6 accent-brand-700"
              />
            </label>
            {!photo.cutout ? (
              <p className="rounded-2xl bg-drip-soft px-4 py-3 text-[13px] text-drip-ink">
                Le détourage n&apos;a pas abouti sur cette photo : seuls la lumière et le format sont appliqués.
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === 'style' ? (
          <ul className="flex flex-col gap-2.5">
            {FILTERS.map((item) => {
              const active = item.id === draft.filter
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => patchDraft({ filter: item.id })}
                    className={`flex w-full items-center gap-3.5 rounded-2xl px-3.5 py-3 text-left ${
                      active ? 'border-2 border-brand-700' : 'border border-app-line'
                    }`}
                  >
                    <span
                      className="h-[42px] w-[42px] shrink-0 rounded-[11px] border border-app-line"
                      style={{ background: item.swatch }}
                    />
                    <span className="flex-1">
                      <span className="block text-sm font-bold">{item.label}</span>
                      <span className="mt-0.5 block text-xs text-app-muted">{item.hint}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>

      <div className="flex shrink-0 gap-2.5 border-t border-app-line px-5 pb-6 pt-3">
        <button
          type="button"
          aria-label="Réinitialiser les réglages"
          onClick={() => patchDraft({ adjustments: DEFAULT_ADJUSTMENTS })}
          className="flex h-[54px] w-[54px] items-center justify-center rounded-full border-[1.5px] border-app-line text-app-muted"
        >
          <ResetIcon size={21} />
        </button>
        <button
          type="button"
          onClick={() => void applyToBatch()}
          disabled={applying}
          className="flex h-[54px] flex-1 items-center justify-center rounded-pill bg-brand-700 text-base font-bold text-white disabled:opacity-60"
        >
          {applying ? 'Application…' : `Appliquer aux ${activeBatch.photos.length}`}
        </button>
      </div>
    </main>
  )
}

export default function EditeurPage() {
  return (
    <Suspense fallback={null}>
      <EditorScreen />
    </Suspense>
  )
}
