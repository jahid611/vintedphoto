'use client'

import { useState } from 'react'
import { BottomNav } from '@/components/BottomNav'
import { CoinIcon, ShieldIcon } from '@/components/Icons'
import { formatPrice, grantDemoCredits, startCheckout, useLedger } from '@/lib/credits'
import { CREDIT_PACKS } from '@/lib/presets'

export default function CreditsPage() {
  const { balance, entries, remote } = useLedger()
  const [selected, setSelected] = useState(CREDIT_PACKS[1].id)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const pack = CREDIT_PACKS.find((item) => item.id === selected) ?? CREDIT_PACKS[1]

  async function buy() {
    // Mode démo (pas de Supabase) : on crédite localement pour pouvoir essayer
    // le parcours complet. Sinon on passe par Stripe, et c'est le webhook qui
    // crédite — un client ne doit jamais pouvoir s'ajouter des crédits.
    if (!remote) {
      grantDemoCredits(pack.credits, `Pack ${pack.label} (démo)`)
      return
    }
    setPending(true)
    setMessage(null)
    const result = await startCheckout(pack.id)
    if (result.url) {
      window.location.assign(result.url)
      return
    }
    setMessage(result.message ?? 'Le paiement est indisponible.')
    setPending(false)
  }

  return (
    <main className="flex min-h-[100dvh] flex-col bg-app-card">
      <header className="flex h-15 shrink-0 items-center justify-center border-b border-app-line">
        <h1 className="text-base font-bold">Crédits</h1>
      </header>

      <div className="flex-1 px-5 pt-4">
        <div className="flex items-center gap-4 rounded-card bg-brand-900 px-5 py-4.5">
          <div className="flex-1">
            <p className="text-xs font-bold tracking-wider text-brand-200">SOLDE</p>
            <p className="mt-1 font-display text-[34px] font-extrabold leading-tight tracking-[-0.04em] text-white">
              {balance} crédit{balance > 1 ? 's' : ''}
            </p>
            <p className="mt-0.5 text-[13px] text-brand-200">
              soit {balance} photo{balance > 1 ? 's' : ''} exportée{balance > 1 ? 's' : ''}
            </p>
          </div>
          <span className="flex h-13 w-13 shrink-0 items-center justify-center rounded-full bg-credit-soft text-credit-ink">
            <CoinIcon size={26} strokeWidth={2.2} />
          </span>
        </div>

        <h2 className="mb-1 mt-5 font-display text-xl font-bold tracking-[-0.03em]">Recharge</h2>
        <p className="mb-3.5 text-[13px] text-app-muted">
          Pas d&apos;abonnement. Les crédits n&apos;expirent jamais.
        </p>

        <ul className="flex flex-col gap-2.5">
          {CREDIT_PACKS.map((item) => {
            const active = item.id === selected
            const unit = item.priceCents / 100 / item.credits
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelected(item.id)}
                  className={`relative flex w-full items-center gap-3.5 rounded-[18px] px-4 py-3.5 text-left ${
                    active ? 'border-[2.5px] border-brand-700 bg-brand-50' : 'border border-app-line'
                  }`}
                >
                  {item.badge ? (
                    <span className="absolute -top-2.5 left-4 flex h-[22px] items-center rounded-[7px] bg-drip-soft px-2.5 text-[11px] font-bold tracking-wide text-drip-ink">
                      {item.badge}
                    </span>
                  ) : null}
                  <span className="flex-1">
                    <span className="block text-base font-bold">{item.label}</span>
                    <span className={`mt-0.5 block text-[13px] ${active ? 'text-brand-800' : 'text-app-muted'}`}>
                      {item.credits} photos · {unit.toFixed(2).replace('.', ',')} € l&apos;unité
                    </span>
                  </span>
                  <span
                    className={`shrink-0 font-display text-[21px] font-extrabold tracking-[-0.035em] ${
                      active ? 'text-brand-800' : ''
                    }`}
                  >
                    {formatPrice(item.priceCents)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-app-sunken px-4 py-3.5">
          <ShieldIcon size={19} className="mt-0.5 shrink-0 text-brand-800" />
          <p className="text-[13px] leading-relaxed text-app-muted">
            Un crédit n&apos;est débité qu&apos;une fois la photo exportée. Un détourage raté ne te coûte rien.
          </p>
        </div>

        {entries.length > 0 ? (
          <>
            <h2 className="mb-2 mt-6 font-display text-lg font-bold tracking-[-0.02em]">Historique</h2>
            <ul className="flex flex-col divide-y divide-app-line rounded-2xl border border-app-line">
              {entries.slice(0, 8).map((entry) => (
                <li key={entry.id} className="flex items-center justify-between px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{entry.label}</span>
                    <span className="block text-xs text-app-muted">
                      {entry.at ? new Date(entry.at).toLocaleDateString('fr-FR') : '—'}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-sm font-bold ${
                      entry.delta > 0 ? 'text-success-ink' : 'text-app-muted'
                    }`}
                  >
                    {entry.delta > 0 ? '+' : ''}
                    {entry.delta}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-app-line px-5 pb-4 pt-3">
        {message ? (
          <p className="mb-2.5 rounded-2xl bg-drip-soft px-4 py-3 text-[13px] text-drip-ink">{message}</p>
        ) : null}
        <button
          type="button"
          onClick={() => void buy()}
          disabled={pending}
          className="h-[54px] w-full rounded-pill bg-brand-700 text-base font-bold text-white disabled:opacity-60"
        >
          {pending ? 'Redirection…' : `Prendre le pack ${pack.label} — ${formatPrice(pack.priceCents)}`}
        </button>
        <p className="mt-2.5 text-center text-xs text-app-muted">
          {remote
            ? 'Paiement Stripe · CB, Apple Pay, Google Pay'
            : 'Mode démo : les crédits sont ajoutés localement, aucun paiement n’est encaissé.'}
        </p>
      </div>

      <BottomNav />
    </main>
  )
}
