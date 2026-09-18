/** Petites briques canvas partagées par le pipeline. Tout tourne côté navigateur. */

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error("Le canvas 2D n'est pas disponible sur cet appareil.")
  return ctx
}

/** `imageOrientation` applique la rotation EXIF : sans ça les photos prises en
 *  mode portrait ressortent couchées sur la moitié des téléphones. */
export async function loadBitmap(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    return createImageBitmap(blob)
  }
}

export function toBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("L'export de l'image a échoué."))),
      mime,
      quality,
    )
  })
}

/**
 * Boîte englobante des pixels non transparents. Sert à recadrer serré autour du
 * vêtement détouré, pour que toutes les photos d'un lot aient la même échelle.
 */
export function alphaBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 12,
): { x: number; y: number; width: number; height: number } {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    const row = y * width * 4
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3] > threshold) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < 0) return { x: 0, y: 0, width, height }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Laisse le temps au navigateur de démarrer le téléchargement.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
