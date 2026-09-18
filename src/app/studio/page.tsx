'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { BottomNav } from '@/components/BottomNav'
import { Wordmark } from '@/components/Brand'
import { CreditPill } from '@/components/CreditPill'
import { AlertIcon, CameraIcon, GalleryIcon, UploadIcon } from '@/components/Icons'
import { BlobImage } from '@/components/media'
import { useLedger } from '@/lib/credits'
import { warmUp } from '@/lib/image/segment'
import { useStore } from '@/lib/store'

/** Au-delà, un mobile milieu de gamme met plusieurs minutes et risque de manquer de mémoire. */
const MAX_PER_BATCH = 50

export default function StudioPage() {
  const router = useRouter()
  const { batches, createBatch, setActive } = useStore()
  const { balance } = useLedger()
  const galleryInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const [tooMany, setTooMany] = useState(false)

  // Le modèle de détourage se télécharge pendant que l'utilisateur choisit ses
  // photos : au moment de lancer le lot, il est déjà en cache.
  useEffect(() => {
    void warmUp()
  }, [])

  function onFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []).filter((file) => file.type.startsWith('image/'))
    if (files.length === 0) return
    setTooMany(files.length > MAX_PER_BATCH)
    createBatch(files.slice(0, MAX_PER_BATCH))
    router.push('/traitement')
  }

  return (
    <main className="flex min-h-[100dvh] flex-col bg-app-bg">
      <header className="flex h-15 shrink-0 items-center justify-between bg-app-card px-5">
        <Wordmark size={20} />
        <CreditPill />
      </header>

      <div className="flex-1 px-5 pt-4.5">
        <h1 className="font-display text-[27px] font-extrabold tracking-[-0.037em]">Ton studio</h1>
        <p className="mb-4 mt-1 text-sm text-app-muted">1 crédit = 1 photo nettoyée et exportée.</p>

        {balance === 0 ? (
          <div className="mb-4 flex items-start gap-3 rounded-2xl bg-drip-soft px-4 py-3.5 text-drip-ink">
            <AlertIcon size={19} className="mt-0.5 shrink-0" />
            <p className="text-[13px] leading-relaxed">
              Plus de crédits. Tu peux quand même préparer un lot, mais il faudra recharger pour exporter.{' '}
              <Link href="/credits" className="font-bold underline">
                Voir les packs
              </Link>
            </p>
          </div>
        ) : null}

        <div className="rounded-[22px] border-2 border-dashed border-brand-200 bg-app-card px-4.5 py-6 text-center">
          <span className="mx-auto flex h-[58px] w-[58px] items-center justify-center rounded-[18px] bg-brand-50 text-brand-800">
            <UploadIcon size={28} />
          </span>
          <p className="mt-3 font-display text-[19px] font-bold tracking-[-0.02em]">Balance tes photos</p>
          <p className="mt-1 text-[13px] text-app-muted">
            JPEG, PNG, HEIC · jusqu&apos;à {MAX_PER_BATCH} d&apos;un coup
          </p>

          <div className="mt-4 flex gap-2.5">
            <button
              type="button"
              onClick={() => galleryInput.current?.click()}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-pill bg-brand-700 text-[15px] font-bold text-white"
            >
              <GalleryIcon size={17} />
              Galerie
            </button>
            <button
              type="button"
              onClick={() => cameraInput.current?.click()}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-pill border-[1.5px] border-brand-700 text-[15px] font-bold text-brand-700"
            >
              <CameraIcon size={17} />
              Photo
            </button>
          </div>

          <input
            ref={galleryInput}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(event) => onFiles(event.target.files)}
          />
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(event) => onFiles(event.target.files)}
          />
        </div>

        {tooMany ? (
          <p className="mt-3 text-[13px] text-drip-ink">
            Seules les {MAX_PER_BATCH} premières photos ont été gardées pour ce lot.
          </p>
        ) : null}

        <div className="mb-3 mt-6 flex items-baseline justify-between">
          <h2 className="font-display text-lg font-bold tracking-[-0.02em]">Tes derniers lots</h2>
          {batches.length > 0 ? (
            <Link href="/lot" className="text-[13px] font-semibold text-app-brand">
              Tout voir
            </Link>
          ) : null}
        </div>

        {batches.length === 0 ? (
          <p className="rounded-[18px] bg-app-card px-4 py-5 text-sm text-app-muted">
            Rien pour l&apos;instant. Ton premier lot apparaîtra ici.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {batches.map((batch) => {
              const ready = batch.photos.filter((photo) => photo.status === 'ready').length
              const cover = batch.photos.find((photo) => photo.result)?.result
              return (
                <li key={batch.id}>
                  <Link
                    href="/lot"
                    onClick={() => setActive(batch.id)}
                    className="flex items-center gap-3 rounded-[18px] bg-app-card p-3"
                  >
                    <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-app-sunken">
                      <BlobImage blob={cover} alt="" className="h-full w-full object-cover" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{batch.name}</span>
                      <span className="mt-0.5 block text-[13px] text-app-muted">
                        {batch.photos.length} photo{batch.photos.length > 1 ? 's' : ''} ·{' '}
                        {new Date(batch.createdAt).toLocaleDateString('fr-FR')}
                      </span>
                    </span>
                    <span
                      className={`flex h-[26px] shrink-0 items-center rounded-lg px-2.5 text-xs font-bold ${
                        ready === batch.photos.length
                          ? 'bg-success-soft text-success-ink'
                          : 'bg-app-sunken text-app-muted'
                      }`}
                    >
                      {ready === batch.photos.length ? 'Prêt' : `${ready}/${batch.photos.length}`}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <BottomNav />
    </main>
  )
}
