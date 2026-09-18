'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CameraIcon, CoinIcon, GridIcon } from './Icons'

const TABS = [
  { href: '/studio', label: 'Studio', Icon: CameraIcon },
  { href: '/lot', label: 'Lots', Icon: GridIcon },
  { href: '/credits', label: 'Crédits', Icon: CoinIcon },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="shrink-0 border-t border-app-line bg-app-card pb-[env(safe-area-inset-bottom)]">
      <ul className="flex">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex h-[74px] flex-col items-center justify-center gap-1 ${
                  active ? 'text-app-brand' : 'text-app-muted'
                }`}
              >
                <Icon size={21} strokeWidth={active ? 2.2 : 2} />
                <span className={`text-[11px] ${active ? 'font-bold' : 'font-semibold'}`}>{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
