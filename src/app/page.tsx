import Link from 'next/link'
import { Mark, Wordmark } from '@/components/Brand'
import { CropIcon, GalleryIcon, ShieldIcon, SparkIcon } from '@/components/Icons'
import { FREE_CREDITS } from '@/lib/presets'

const ARGUMENTS = [
  { Icon: GalleryIcon, text: "Détourage automatique, sans app de retouche" },
  { Icon: SparkIcon, text: 'Filtres lookbook et lumière corrigée' },
  { Icon: CropIcon, text: 'Formats Vinted 1:1, Depop 4:5, Story 9:16' },
]

/** Silhouette de vêtement : un dessin, pas une fausse photo produit. */
function Garment({ fill, className }: { fill: string; className?: string }) {
  return (
    <svg viewBox="0 0 120 140" className={className} aria-hidden="true">
      <path
        d="M42 18 L20 30 L10 58 L28 66 L30 60 L30 128 Q60 136 90 128 L90 60 L92 66 L110 58 L100 30 L78 18 Q60 34 42 18Z"
        fill={fill}
      />
    </svg>
  )
}

export default function LandingPage() {
  return (
    <main className="flex min-h-[100dvh] flex-col bg-app-card">
      <header className="flex h-15 shrink-0 items-center justify-between px-5 py-3">
        <Wordmark size={20} />
        <Link href="/studio" className="px-2 py-3 text-sm font-semibold text-app-brand">
          Connexion
        </Link>
      </header>

      <div className="flex flex-1 flex-col gap-5 px-5">
        <div>
          <span className="inline-flex h-[30px] items-center gap-2 rounded-pill bg-brand-50 px-3 text-xs font-bold tracking-wide text-brand-800">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            POUR VINTED &amp; DEPOP
          </span>
          <h1 className="mt-3.5 font-display text-[38px] font-extrabold leading-[1.02] tracking-[-0.042em]">
            Tes sapes
            <br />
            en mode studio.
          </h1>
          <p className="mt-3 text-base leading-relaxed text-app-muted">
            Photo prise à l&apos;arrache dans ta chambre — fond nettoyé, lumière corrigée, format Vinted. En
            quelques secondes, sans quitter ton téléphone.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="overflow-hidden rounded-[18px] border border-app-line">
            <div className="relative flex h-[186px] items-center justify-center bg-[#c9c2b6]">
              <div className="absolute inset-0 bg-gradient-to-br from-black/25 to-black/5" />
              <Garment fill="#6e6357" className="relative h-28 w-24" />
            </div>
            <div className="px-3 py-2 text-xs font-bold tracking-widest text-app-muted">AVANT</div>
          </div>
          <div className="overflow-hidden rounded-[18px] border-[1.5px] border-brand-500">
            <div className="flex h-[186px] items-center justify-center bg-white">
              <Garment fill="#8b7f70" className="h-28 w-24" />
            </div>
            <div className="bg-brand-50 px-3 py-2 text-xs font-bold tracking-widest text-brand-800">
              APRÈS · DRIPSHOT
            </div>
          </div>
        </div>

        <ul className="flex flex-col gap-3">
          {ARGUMENTS.map(({ Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-brand-50 text-brand-800">
                <Icon size={18} />
              </span>
              <span className="text-sm font-semibold">{text}</span>
            </li>
          ))}
        </ul>

        <div className="flex items-start gap-3 rounded-2xl bg-app-sunken px-4 py-3.5">
          <ShieldIcon size={19} className="mt-0.5 shrink-0 text-brand-800" />
          <p className="text-[13px] leading-relaxed text-app-muted">
            Tout le traitement tourne sur ton appareil. Tes photos ne sont jamais envoyées sur un serveur.
          </p>
        </div>
      </div>

      <div className="shrink-0 border-t border-app-line px-5 pb-6 pt-4">
        <Link
          href="/studio"
          className="flex h-[54px] items-center justify-center gap-2 rounded-pill bg-brand-700 text-base font-bold text-white"
        >
          <Mark size={20} tone="inverse" />
          Nettoyer mes {FREE_CREDITS} premières photos
        </Link>
        <p className="mt-3 text-center text-[13px] text-app-muted">
          {FREE_CREDITS} crédits offerts · sans carte bancaire
        </p>
      </div>
    </main>
  )
}
