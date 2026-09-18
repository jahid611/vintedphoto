import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Instrument_Sans } from 'next/font/google'
import { StoreProvider } from '@/lib/store'
import './globals.css'

// Polices auto-hébergées par next/font : pas de requête vers un CDN tiers au
// runtime, et zéro décalage de mise en page au chargement.
const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display-loaded' })
const sans = Instrument_Sans({ subsets: ['latin'], variable: '--font-sans-loaded' })

export const metadata: Metadata = {
  title: 'Dripshot — tes sapes en mode studio',
  description:
    'Détourage, lumière et format Vinted ou Depop en quelques secondes, directement sur ton téléphone.',
  applicationName: 'Dripshot',
}

export const viewport: Viewport = {
  themeColor: '#007782',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${display.variable} ${sans.variable}`}>
      <body>
        <StoreProvider>
          <div className="app-shell">{children}</div>
        </StoreProvider>
      </body>
    </html>
  )
}
