import { getBackground, getFilter, getFormat } from '../presets'
import type { PhotoSettings } from '../types'
import { alphaBounds, context2d, createCanvas, loadBitmap, toBlob } from './canvas'
import { applyAdjustments, measureAutoLevels, mergeAdjustments } from './adjust'

/** Au-delà, on manipule des dizaines de Mo en RAM pour un résultat invisible. */
const MAX_WORK_EDGE = 2400
/** Marge autour du vêtement, en fraction du petit côté du rendu. */
const SUBJECT_PADDING = 0.08

export interface RenderOptions {
  /** Rend une version réduite (aperçu de l'éditeur) au lieu du fichier final. */
  previewEdge?: number
}

export interface RenderResult {
  blob: Blob
  mime: string
  width: number
  height: number
}

function outputSize(ratio: number, longEdge: number) {
  return ratio >= 1
    ? { width: longEdge, height: Math.round(longEdge / ratio) }
    : { width: Math.round(longEdge * ratio), height: longEdge }
}

let grainTile: HTMLCanvasElement | null = null

/** Une tuile de bruit générée une fois, répétée en motif : le grain film coûte alors presque rien. */
function getGrainTile(): HTMLCanvasElement {
  if (grainTile) return grainTile
  const size = 128
  const tile = createCanvas(size, size)
  const ctx = context2d(tile)
  const data = ctx.createImageData(size, size)
  for (let i = 0; i < data.data.length; i += 4) {
    const v = 110 + Math.random() * 70
    data.data[i] = v
    data.data[i + 1] = v
    data.data[i + 2] = v
    data.data[i + 3] = 255
  }
  ctx.putImageData(data, 0, 0)
  grainTile = tile
  return tile
}

/**
 * Pipeline complet d'une photo : correction de lumière, recadrage serré sur le
 * vêtement, pose sur le fond choisi, format de la plateforme, grain et voile.
 * Rien ne sort du navigateur.
 */
export async function renderPhoto(
  original: Blob,
  cutout: Blob | undefined,
  settings: PhotoSettings,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const background = getBackground(settings.background)
  const filter = getFilter(settings.filter)
  const format = getFormat(settings.format)

  const useCutout = Boolean(cutout) && !background.keepOriginal
  const bitmap = await loadBitmap(useCutout ? cutout! : original)

  // 1. Corrections colorimétriques, sur la source à taille (bornée) d'origine.
  const workScale = Math.min(1, MAX_WORK_EDGE / Math.max(bitmap.width, bitmap.height))
  const workWidth = Math.max(1, Math.round(bitmap.width * workScale))
  const workHeight = Math.max(1, Math.round(bitmap.height * workScale))
  const work = createCanvas(workWidth, workHeight)
  const workCtx = context2d(work)
  workCtx.imageSmoothingQuality = 'high'
  workCtx.drawImage(bitmap, 0, 0, workWidth, workHeight)
  bitmap.close()

  const imageData = workCtx.getImageData(0, 0, workWidth, workHeight)
  const levels = settings.autoLevels ? measureAutoLevels(imageData.data) : null
  applyAdjustments(imageData, mergeAdjustments(filter.adjustments, settings.adjustments), levels)
  workCtx.putImageData(imageData, 0, 0)

  // 2. Cadre de sortie.
  const longEdge = options.previewEdge ?? format.longEdge
  const { width, height } = outputSize(format.ratio, longEdge)
  const out = createCanvas(width, height)
  const ctx = context2d(out)
  ctx.imageSmoothingQuality = 'high'

  if (background.color) {
    ctx.fillStyle = background.color
    ctx.fillRect(0, 0, width, height)
  }

  // 3. Placement du sujet : serré sur l'alpha si détouré, sinon recadrage plein cadre.
  const box = useCutout
    ? alphaBounds(imageData.data, workWidth, workHeight)
    : { x: 0, y: 0, width: workWidth, height: workHeight }

  if (useCutout) {
    const padding = Math.round(Math.min(width, height) * SUBJECT_PADDING)
    const scale = Math.min((width - padding * 2) / box.width, (height - padding * 2) / box.height)
    const drawWidth = box.width * scale
    const drawHeight = box.height * scale
    const drawX = (width - drawWidth) / 2
    const drawY = (height - drawHeight) / 2

    ctx.save()
    if (settings.shadow && !background.transparent) {
      // shadowColor + drawImage : le canvas dérive l'ombre de l'alpha du PNG.
      ctx.shadowColor = 'rgba(10, 22, 22, 0.20)'
      ctx.shadowBlur = Math.round(Math.min(width, height) * 0.035)
      ctx.shadowOffsetY = Math.round(Math.min(width, height) * 0.018)
    }
    ctx.drawImage(work, box.x, box.y, box.width, box.height, drawX, drawY, drawWidth, drawHeight)
    ctx.restore()
  } else {
    const scale = Math.max(width / box.width, height / box.height)
    const drawWidth = box.width * scale
    const drawHeight = box.height * scale
    ctx.drawImage(
      work,
      box.x,
      box.y,
      box.width,
      box.height,
      (width - drawWidth) / 2,
      (height - drawHeight) / 2,
      drawWidth,
      drawHeight,
    )
  }

  // 4. Voile et grain du filtre — `source-atop` pour ne pas remplir la transparence.
  if (filter.tint) {
    ctx.save()
    ctx.globalCompositeOperation = 'source-atop'
    ctx.globalAlpha = filter.tint.a
    ctx.fillStyle = `rgb(${filter.tint.r} ${filter.tint.g} ${filter.tint.b})`
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }

  if (filter.grain > 0) {
    const pattern = ctx.createPattern(getGrainTile(), 'repeat')
    if (pattern) {
      ctx.save()
      ctx.globalCompositeOperation = 'overlay'
      ctx.globalAlpha = filter.grain * 0.35
      ctx.fillStyle = pattern
      ctx.fillRect(0, 0, width, height)
      ctx.restore()
    }
  }

  const mime = background.transparent ? 'image/png' : 'image/jpeg'
  const blob = await toBlob(out, mime, mime === 'image/jpeg' ? 0.92 : undefined)
  return { blob, mime, width, height }
}

/** Même cadrage que le rendu final, mais réduit : sert au comparateur avant / après. */
export function renderPreview(original: Blob, cutout: Blob | undefined, settings: PhotoSettings) {
  return renderPhoto(original, cutout, settings, { previewEdge: 720 })
}
