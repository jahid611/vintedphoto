// Fabrique les photos de test du parcours e2e, sans dépendance : un encodeur
// PNG minimal suffit et évite d'embarquer une bibliothèque d'images.
//
//   node scripts/fixtures.mjs <dossier>
//
// Deux scènes, choisies pour les deux pièges de la correction automatique :
//   chambre-*.png : ampoule jaune, sous-exposé — la dominante doit disparaître.
//   pull-rouge.png : rouge saturé plein cadre — la couleur doit rester.

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const CRC = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = -1
  for (let i = 0; i < buffer.length; i++) c = CRC[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const tag = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([tag, data])))
  return Buffer.concat([length, tag, data, crc])
}

const WIDTH = 900
const HEIGHT = 1200

function encodePng(shade) {
  const raw = Buffer.alloc(HEIGHT * (1 + WIDTH * 3))
  for (let y = 0; y < HEIGHT; y++) {
    const row = y * (1 + WIDTH * 3)
    raw[row] = 0
    for (let x = 0; x < WIDTH; x++) {
      const [r, g, b] = shade(x / WIDTH, y / HEIGHT)
      const offset = row + 1 + x * 3
      raw[offset] = Math.max(0, Math.min(255, r))
      raw[offset + 1] = Math.max(0, Math.min(255, g))
      raw[offset + 2] = Math.max(0, Math.min(255, b))
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(WIDTH, 0)
  ihdr.writeUInt32BE(HEIGHT, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const vignette = (nx, ny) => 1 - Math.min(1, ((nx - 0.5) ** 2 + (ny - 0.5) ** 2) * 1.5) * 0.35

/** Silhouette de t-shirt dans un repère 120 x 140. */
function insideShirt(nx, ny) {
  const x = nx * 120
  const y = ny * 140
  if (y < 18 || y > 132) return false
  if (y < 30) return x > 30 + (30 - y) * 1.2 && x < 90 - (30 - y) * 1.2
  if (y < 66) {
    const spread = 10 + (y - 30) * 0.15
    return x > spread && x < 120 - spread
  }
  return x > 30 && x < 90
}

/** Chambre sous ampoule jaune : mur beige, vêtement marine, sous-exposition. */
function room(nx, ny) {
  let r, g, b
  if (insideShirt((nx - 0.1) / 0.8, (ny - 0.08) / 0.84)) {
    r = 58
    g = 72
    b = 96
  } else {
    const gradient = 1 - ny * 0.22
    r = 176 * gradient
    g = 166 * gradient
    b = 148 * gradient
  }
  const v = vignette(nx, ny)
  const noise = (Math.random() - 0.5) * 9
  return [r * v * 0.82 + 16 + noise, g * v * 0.78 + 10 + noise, b * v * 0.68 + 4 + noise]
}

/** Pull rouge saturé plein cadre : seuls les plis font varier la luminosité. */
function redSweater(nx, ny) {
  let r, g, b
  if (nx > 0.06 && nx < 0.94 && ny > 0.05 && ny < 0.95) {
    const fold = 0.82 + 0.18 * Math.sin(nx * 14) * Math.cos(ny * 9)
    r = 186 * fold
    g = 38 * fold
    b = 34 * fold
  } else {
    r = 150
    g = 146
    b = 138
  }
  const v = vignette(nx, ny)
  const noise = (Math.random() - 0.5) * 8
  return [r * v * 0.85 + 12 + noise, g * v * 0.8 + 8 + noise, b * v * 0.72 + 5 + noise]
}

const target = process.argv[2] ?? 'scripts/.fixtures'
mkdirSync(target, { recursive: true })

for (const [name, shade] of [
  ['chambre-1.png', room],
  ['chambre-2.png', room],
  ['pull-rouge.png', redSweater],
]) {
  const file = join(target, name)
  writeFileSync(file, encodePng(shade))
  console.log('écrit', file)
}
