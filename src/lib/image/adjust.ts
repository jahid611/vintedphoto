import type { Adjustments } from '../types'

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b

export interface AutoLevels {
  /** Gains de balance des blancs, bornés, un par canal. */
  gain: [number, number, number]
  /** Point noir appliqué à la luminance. */
  black: number
  /** Pente appliquée à la luminance au-dessus du point noir. */
  slope: number
}

const NEUTRAL: AutoLevels = { gain: [1, 1, 1], black: 0, slope: 1 }

/** Fraction de pixels ignorée avant de fixer une borne. */
const CLIP = 0.004
/**
 * Écart maximal toléré entre le gain le plus fort et le plus faible.
 *
 * On borne la **force totale** de la correction, pas chaque canal : plafonner
 * les canaux un par un corrigerait le rouge et le vert tout en laissant le
 * bleu en arrière, ce qui remplace la dominante jaune par un voile olive.
 * La compression par exposant garde les trois gains dans le même ordre et le
 * même rapport, simplement atténués.
 *
 * Sur une photo remplie d'une seule couleur saturée, la référence de blanc est
 * cette couleur : c'est là que la borne sert, elle empêche de repeindre le
 * vêtement en gris.
 */
const MAX_CAST_CORRECTION = 1.45
/** Contraste automatique maximal, pour ne pas boucher les noirs. */
const MAX_TONE_SLOPE = 2.2
/** On ne remonte que 90 % du point noir mesuré : garde un peu de matière. */
const BLACK_SOFTEN = 0.9

function percentile(histogram: Uint32Array, cut: number, fromTop: boolean): number {
  let acc = 0
  if (fromTop) {
    for (let v = 255; v >= 0; v--) {
      acc += histogram[v]
      if (acc >= cut) return v
    }
    return 255
  }
  for (let v = 0; v < 256; v++) {
    acc += histogram[v]
    if (acc >= cut) return v
  }
  return 0
}

/**
 * Photo de chambre = ampoule jaune, sous-exposée, pas de vrai blanc.
 *
 * Deux corrections distinctes, volontairement séparées :
 *
 * 1. La **balance des blancs** compare les hautes lumières de chaque canal.
 *    Sous un éclairage neutre elles devraient coïncider ; l'écart mesure la
 *    dominante. Le gain est borné (MAX_WB_GAIN), sinon une photo remplie d'une
 *    seule couleur saturée se fait repeindre en gris.
 * 2. La **courbe de tons** ne travaille que sur la luminance, et les trois
 *    canaux sont ensuite remis à l'échelle dans le même rapport. Un étirement
 *    affine appliqué canal par canal amplifierait la dominante au lieu de la
 *    corriger — c'est exactement ce qui rendait un fond beige franchement doré.
 *
 * Les pixels transparents sont ignorés : le vide autour d'un sujet détouré
 * fausserait les histogrammes.
 */
export function measureAutoLevels(data: Uint8ClampedArray): AutoLevels {
  const channels = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]
  let counted = 0

  // Un pixel sur quatre suffit largement pour des histogrammes.
  for (let i = 0; i < data.length; i += 16) {
    if (data[i + 3] < 128) continue
    channels[0][data[i]]++
    channels[1][data[i + 1]]++
    channels[2][data[i + 2]]++
    counted++
  }

  if (counted === 0) return NEUTRAL

  const cut = Math.max(1, Math.floor(counted * CLIP))
  const highs = channels.map((histogram) => percentile(histogram, cut, true))
  const whiteReference = Math.max(highs[0], highs[1], highs[2])

  // Gain qu'il faudrait pour aligner chaque canal sur le plus clair (>= 1).
  const needed = highs.map((high) => (high > 0 ? whiteReference / high : 1))
  const strongest = Math.max(needed[0], needed[1], needed[2])
  const compression =
    strongest > MAX_CAST_CORRECTION ? Math.log(MAX_CAST_CORRECTION) / Math.log(strongest) : 1
  const compressed = needed.map((value) => value ** compression)

  // Normalisé à luminance constante : la balance corrige la teinte sans
  // toucher à l'exposition. Normaliser sur le gain max ferait perdre jusqu'à
  // 30 % de luminosité, que la courbe de tons ne peut pas toujours rattraper.
  const weighted = luma(compressed[0], compressed[1], compressed[2])
  const gain = compressed.map((value) => value / Math.max(0.001, weighted)) as [
    number,
    number,
    number,
  ]

  // La luminance est mesurée APRÈS la balance, parce que la courbe de tons
  // s'applique après elle. La mesurer sur les pixels d'origine ferait
  // soustraire un point noir trop haut à une image déjà assombrie, et
  // boucherait tout.
  const luminance = new Uint32Array(256)
  for (let i = 0; i < data.length; i += 16) {
    if (data[i + 3] < 128) continue
    luminance[luma(data[i] * gain[0], data[i + 1] * gain[1], data[i + 2] * gain[2]) | 0]++
  }

  const black = percentile(luminance, cut, false)
  const white = percentile(luminance, cut, true)
  if (white - black < 24) return { gain, black: 0, slope: 1 }

  return {
    gain,
    black: black * BLACK_SOFTEN,
    slope: Math.min(MAX_TONE_SLOPE, Math.max(1, 255 / (white - black * BLACK_SOFTEN))),
  }
}

/**
 * Une LUT par canal pour les réglages manuels : luminosité, contraste et
 * température se compressent en trois tables de 256 entrées, donc un seul
 * accès mémoire par canal au lieu de trois calculs.
 */
export function buildChannelLuts(adjustments: Adjustments): Uint8ClampedArray[] {
  const { brightness, contrast, temperature } = adjustments

  // Formule de contraste classique, sur une plage -128..128.
  const c = (contrast / 50) * 90
  const contrastFactor = (259 * (c + 255)) / (255 * (259 - c))
  const brightnessOffset = (brightness / 50) * 48
  const tempOffset = (temperature / 50) * 22
  const channelOffset = [tempOffset, tempOffset * 0.15, -tempOffset]

  return [0, 1, 2].map((channel) => {
    const lut = new Uint8ClampedArray(256)
    for (let v = 0; v < 256; v++) {
      lut[v] = clamp255(contrastFactor * (v - 128) + 128 + brightnessOffset + channelOffset[channel])
    }
    return lut
  })
}

/** Applique la correction automatique puis les réglages manuels, en place. */
export function applyAdjustments(
  imageData: ImageData,
  adjustments: Adjustments,
  levels: AutoLevels | null,
) {
  const [lutR, lutG, lutB] = buildChannelLuts(adjustments)
  const data = imageData.data
  const saturation = 1 + (adjustments.saturation / 50) * 0.8
  const flatSaturation = Math.abs(saturation - 1) < 0.001

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue

    let r = data[i]
    let g = data[i + 1]
    let b = data[i + 2]

    if (levels) {
      r *= levels.gain[0]
      g *= levels.gain[1]
      b *= levels.gain[2]

      const before = luma(r, g, b)
      if (before > 0.5) {
        // Même facteur sur les trois canaux : la teinte et la chroma relative
        // du vêtement ne bougent pas, seule la luminosité change.
        const scale = Math.max(0, (before - levels.black) * levels.slope) / before
        r *= scale
        g *= scale
        b *= scale
      }
    }

    r = lutR[clamp255(r) | 0]
    g = lutG[clamp255(g) | 0]
    b = lutB[clamp255(b) | 0]

    if (!flatSaturation) {
      const gray = luma(r, g, b)
      r = clamp255(gray + (r - gray) * saturation)
      g = clamp255(gray + (g - gray) * saturation)
      b = clamp255(gray + (b - gray) * saturation)
    }

    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
  }
}

/** Somme deux jeux de réglages (preset + curseurs manuels) en restant dans -50..50. */
export function mergeAdjustments(base: Adjustments, extra: Adjustments): Adjustments {
  const sum = (a: number, b: number) => Math.max(-50, Math.min(50, a + b))
  return {
    brightness: sum(base.brightness, extra.brightness),
    contrast: sum(base.contrast, extra.contrast),
    saturation: sum(base.saturation, extra.saturation),
    temperature: sum(base.temperature, extra.temperature),
  }
}
