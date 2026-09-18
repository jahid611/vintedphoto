'use client'

import Link from 'next/link'
import { useLedger } from '@/lib/credits'
import { CoinIcon } from './Icons'

export function CreditPill() {
  const { balance } = useLedger()

  return (
    <Link
      href="/credits"
      className="flex h-9 items-center gap-1.5 rounded-pill bg-credit-soft px-3 text-sm font-bold text-credit-ink"
    >
      <CoinIcon size={15} strokeWidth={2.2} />
      {balance}
      <span className="sr-only">crédits disponibles</span>
    </Link>
  )
}
