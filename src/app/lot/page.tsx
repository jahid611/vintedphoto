'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { BottomNav } from '@/components/BottomNav'
import { AlertIcon, DownloadIcon, TrashIcon } from '@/components/Icons'
import { BlobImage } from '@/components/media'
import { spendCredits, useLedger } from '@/lib/credits'
import { downloadBlob } from '@/lib/image/canvas'
import { renderPhoto } from '@/lib/image/compose'
import { safeFileName } from '@/lib/pipeline'
import { FORMATS, getBackground, getFormat } from '@/lib/presets'
import { useStore } from '@/lib/store'
import type { FormatId } from '@/lib/types'

export default function LotPage() {
  const router = useRouter()
  const { activeBatch, hydrated, patchPhoto, setSettings, removeBatch } = useStore()
  const { balance } = useLedger()
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (hydrated && !activeBatch) router.replace('/studio')
  }, [hydrated, activeBatch, router])

  const ready = activeBatch?.photos.filter((photo) => photo.result) ?? []
  const failed = activeBatch?.photos.filter((photo) => photo.status === 'failed') ?? []
  const unpaid = ready.filter((photo) => !photo.charged)
  const format = getFormat(activeBatch?.settings.format ?? 'vinted')
  const extension = getBackground(activeBatch?.settings.background ?? 'white').transparent ? 'png' : 'jpg'

  /** Changer de format relance le rendu, pas le détourage : les masques sont déjà là. */
  const changeFormat = useCallback(
    async (formatId: FormatId) => {
      if (!activeBatch) return
      const settings = { ...activeBatch.settings, format: formatId }
      setSettings(activeBatch.id, settings)
      setBusy('format')
      for (const photo of activeBatch.photos) {
        if (!photo.result) continue
        try {
          const { blob } = await renderPhoto(photo.original, photo.cutout, settings)
          patchPhoto(activeBatch.id, photo.id, { result: blob })
        } catch {
          patchPhoto(activeBatch.id, photo.id, { status: 'failed', error: 'Rendu impossible.' })
        }
      }
      setBusy(null)
    },
    [activeBatch, patchPhoto, setSettings],
  )

  async function exportAll() {
    if (!activeBatch || ready.length === 0) return
    if (unpaid.length > balance) {
      setNotice(
        `Il te manque ${unpaid.length - balance} crédit${unpaid.length - balance > 1 ? 's' : ''} pour exporter ce lot.`,
      )
      return
    }

    setBusy('export')
    setNotice(null)
    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      ready.forEach((photo, index) => {
        if (photo.result) zip.file(safeFileName(photo.name, index, extension), photo.result)
      })
      const archive = await zip.generateAsync({ type: 'blob' })

      // On débite avant de servir le fichier : si le débit échoue, rien ne sort.
      if (unpaid.length > 0) {
        const paid = await spendCredits(unpaid.length, `Export de ${unpaid.length} photos`)
        if (!paid) {
          setNotice('Le débit des crédits a échoué. Rien n’a été téléchargé.')
          return
        }
        unpaid.forEach((photo) => patchPhoto(activeBatch.id, photo.id, { charged: true }))
      }

      downloadBlob(archive, `${activeBatch.name.replace(/\s+/g, '-').toLowerCase()}-dripshot.zip`)
    } catch {
      setNotice("L'archive n'a pas pu être créée. Réessaie, ou télécharge les photos une par une.")
    } finally {
      setBusy(null)
    }
  }

  async function exportOne(photoId: string, index: number) {
    if (!activeBatch) return
    const photo = activeBatch.photos.find((item) => item.id === photoId)
    if (!photo?.result) return
    if (!photo.charged) {
      if (!(await spendCredits(1, '1 photo exportée'))) {
        setNotice('Plus de crédits : recharge pour exporter cette photo.')
        return
      }
      patchPhoto(activeBatch.id, photo.id, { charged: true })
    }
    downloadBlob(photo.result, safeFileName(photo.name, index, extension))
  }

  if (!activeBatch) return null

  return (
    <main className="flex min-h-[100dvh] flex-col bg-app-bg">
      <header className="shrink-0 bg-app-card px-5 pb-3.5 pt-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-bold">{activeBatch.name}</h1>
            <p className="mt-0.5 text-xs text-app-muted">
              {ready.length} photo{ready.length > 1 ? 's' : ''} prête{ready.length > 1 ? 's' : ''}
              {failed.length > 0 ? ` · ${failed.length} en échec` : ''}
            </p>
          </div>
          <button
            type="button"
            aria-label="Supprimer ce lot"
            onClick={() => {
              removeBatch(activeBatch.id)
              router.replace('/studio')
            }}
            className="flex h-11 w-11 items-center justify-center text-app-muted"
          >
            <TrashIcon size={19} />
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          {FORMATS.map((item) => {
            const active = item.id === activeBatch.settings.format
            return (
              <button
                key={item.id}
                type="button"
                disabled={busy !== null}
                onClick={() => void changeFormat(item.id)}
                className={`flex h-9 items-center rounded-pill px-3.5 text-[13px] font-semibold disabled:opacity-50 ${
                  active ? 'bg-brand-700 text-white' : 'bg-app-sunken text-app-text'
                }`}
              >
                {item.label} {item.ratioLabel}
              </button>
            )
          })}
        </div>
      </header>

      <div className="flex-1 px-5 pt-3.5">
        {notice ? (
          <div className="mb-3.5 flex items-start gap-3 rounded-2xl bg-drip-soft px-4 py-3.5 text-drip-ink">
            <AlertIcon size={19} className="mt-0.5 shrink-0" />
            <p className="text-[13px] leading-relaxed">
              {notice}{' '}
              <Link href="/credits" className="font-bold underline">
                Recharger
              </Link>
            </p>
          </div>
        ) : null}

        {busy === 'format' ? (
          <p className="mb-3.5 rounded-2xl bg-brand-50 px-4 py-3 text-[13px] font-semibold text-brand-800">
            Nouveau format en cours d&apos;application…
          </p>
        ) : null}

        <ul className="grid grid-cols-2 gap-3">
          {activeBatch.photos.map((photo, index) => (
            <li key={photo.id}>
              <Link
                href={`/editeur?photo=${photo.id}`}
                className="relative block overflow-hidden rounded-2xl border border-app-line bg-app-card"
                style={{ aspectRatio: String(format.ratio) }}
              >
                {photo.result ? (
                  <BlobImage blob={photo.result} alt={photo.name} className="h-full w-full object-contain" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-xs text-app-muted">
                    {photo.status === 'failed' ? 'Échec' : 'En attente'}
                  </span>
                )}
                {photo.charged ? (
                  <span className="absolute left-2 top-2 rounded-lg bg-success-soft px-2 py-1 text-[11px] font-bold text-success-ink">
                    Exportée
                  </span>
                ) : null}
              </Link>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{photo.name}</span>
                <button
                  type="button"
                  aria-label={`Télécharger ${photo.name}`}
                  disabled={!photo.result}
                  onClick={() => void exportOne(photo.id, index)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-app-brand disabled:opacity-40"
                >
                  <DownloadIcon size={17} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="shrink-0 border-t border-app-line bg-app-card px-5 pb-4 pt-3.5">
        <p className="mb-3 text-[13px] text-app-muted">
          {extension === 'png' ? 'PNG transparent' : 'JPEG qualité 92'} · {format.longEdge} px · sans filigrane
          {unpaid.length > 0 ? ` · ${unpaid.length} crédit${unpaid.length > 1 ? 's' : ''} à débiter` : ' · déjà payé'}
        </p>
        <button
          type="button"
          onClick={() => void exportAll()}
          disabled={ready.length === 0 || busy !== null}
          className="flex h-[54px] w-full items-center justify-center gap-2 rounded-pill bg-brand-700 text-base font-bold text-white disabled:opacity-50"
        >
          <DownloadIcon size={19} />
          {busy === 'export' ? 'Préparation…' : `Tout télécharger (${ready.length})`}
        </button>
      </div>

      <BottomNav />
    </main>
  )
}
