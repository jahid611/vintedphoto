// Parcours complet dans un vrai navigateur : import -> traitement -> lot ->
// éditeur -> crédits, avec deux contrôles chiffrés sur la correction
// automatique. Ces deux mesures ont déjà attrapé trois régressions réelles,
// invisibles sur un test unitaire.
//
//   npm run build && npm start &          (ou: npm run dev)
//   node scripts/fixtures.mjs scripts/.fixtures
//   node scripts/e2e.mjs
//
// Variables : BASE_URL (défaut http://127.0.0.1:3000), CHROMIUM_PATH.

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000'
const FIXTURES = join(HERE, '.fixtures')
const SHOTS = join(HERE, '.shots')

/** Écart max-min sur un pixel : mesure la dominante de couleur restante. */
const spread = (rgb) => Math.max(...rgb) - Math.min(...rgb)
/** Chroma relative : 0 = gris, 1 = couleur pure. */
const chroma = (rgb) => spread(rgb) / Math.max(...rgb, 1)

const failures = []
function check(label, ok, detail) {
  console.log(`${ok ? '  ok  ' : ' ECHEC'} ${label} — ${detail}`)
  if (!ok) failures.push(label)
}

mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

const consoleErrors = []
page.on('pageerror', (error) => consoleErrors.push(error.message.slice(0, 200)))

try {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: join(SHOTS, '1-landing.png'), fullPage: true })

  await page.click('text=Nettoyer mes')
  await page.waitForURL('**/studio')
  await page.screenshot({ path: join(SHOTS, '2-studio.png'), fullPage: true })

  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles([
      join(FIXTURES, 'chambre-1.png'),
      join(FIXTURES, 'chambre-2.png'),
      join(FIXTURES, 'pull-rouge.png'),
    ])

  await page.waitForURL('**/traitement', { timeout: 15_000 })
  await page.waitForTimeout(700)
  await page.screenshot({ path: join(SHOTS, '3-traitement.png'), fullPage: true })

  await page.waitForURL('**/lot', { timeout: 300_000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: join(SHOTS, '4-lot.png'), fullPage: true })

  const sizes = await page.evaluate(() =>
    Array.from(document.querySelectorAll('main img')).map((img) => `${img.naturalWidth}x${img.naturalHeight}`),
  )
  check('3 photos rendues au format Vinted', sizes.length === 3 && sizes.every((s) => s === '1600x1600'), sizes.join(', '))

  const sample = await page.evaluate(() => {
    const read = (index, points) => {
      const img = document.querySelectorAll('main img')[index]
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d').drawImage(img, 0, 0)
      const ctx = canvas.getContext('2d')
      return Object.fromEntries(
        Object.entries(points).map(([name, [fx, fy]]) => {
          const d = ctx.getImageData(Math.round(canvas.width * fx), Math.round(canvas.height * fy), 1, 1).data
          return [name, [d[0], d[1], d[2]]]
        }),
      )
    }
    return {
      chambre: read(0, { fond: [0.08, 0.5], sujet: [0.5, 0.55] }),
      rouge: read(2, { tissu: [0.5, 0.5] }),
    }
  })

  // Le fond de la photo de chambre entre avec un écart de ~48 dû à l'ampoule.
  check(
    'dominante jaune corrigée',
    spread(sample.chambre.fond) < 25,
    `fond ${JSON.stringify(sample.chambre.fond)} écart ${spread(sample.chambre.fond)}`,
  )
  check(
    'sujet marine resté bleu',
    sample.chambre.sujet[2] > sample.chambre.sujet[0],
    JSON.stringify(sample.chambre.sujet),
  )
  // Sans garde-fou, la balance des blancs délave ce pull jusqu'à 0,25.
  check(
    'rouge saturé préservé',
    chroma(sample.rouge.tissu) > 0.6,
    `${JSON.stringify(sample.rouge.tissu)} chroma ${chroma(sample.rouge.tissu).toFixed(2)}`,
  )

  await page.click('text=Depop 4:5')
  await page.waitForTimeout(3000)
  const depop = await page.evaluate(() =>
    Array.from(document.querySelectorAll('main img')).map((img) => `${img.naturalWidth}x${img.naturalHeight}`),
  )
  check('bascule au format Depop', depop.every((s) => s === '1280x1600'), depop.join(', '))
  await page.screenshot({ path: join(SHOTS, '5-lot-depop.png'), fullPage: true })

  await page.locator('main a[href^="/editeur"]').first().click()
  await page.waitForURL('**/editeur**', { timeout: 20_000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: join(SHOTS, '6-editeur.png'), fullPage: true })

  await page.locator('#contrast').fill('35')
  await page.locator('#temperature').fill('-20')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: join(SHOTS, '7-editeur-reglages.png'), fullPage: true })

  await page.goto(`${BASE}/credits`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const before = await page.locator('main p').filter({ hasText: 'crédit' }).first().textContent()
  await page.click('text=Prendre le pack Pro')
  await page.waitForTimeout(600)
  const after = await page.locator('main p').filter({ hasText: 'crédit' }).first().textContent()
  check('recharge de crédits (mode démo)', before !== after, `${before?.trim()} -> ${after?.trim()}`)
  await page.screenshot({ path: join(SHOTS, '8-credits.png'), fullPage: true })

  // Le CDN du modèle de détourage peut être injoignable (réseau fermé) : le
  // pipeline bascule alors sur lumière + format seuls, ce n'est pas un échec.
  if (consoleErrors.length > 0) console.log('\nerreurs page:', consoleErrors.slice(0, 5))
  console.log(`\ncaptures dans ${SHOTS}`)
} finally {
  await browser.close()
}

if (failures.length > 0) {
  console.error(`\n${failures.length} contrôle(s) en échec : ${failures.join(', ')}`)
  process.exit(1)
}
console.log('\nparcours complet : OK')
