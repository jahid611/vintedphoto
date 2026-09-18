type MarkProps = {
  size?: number
  tone?: 'brand' | 'inverse' | 'ink'
}

const TONES = {
  brand: '#007782',
  inverse: '#ffffff',
  ink: 'currentColor',
} as const

/** Le signe seul : cintre dont le crochet est un objectif. */
export function Mark({ size = 24, tone = 'brand' }: MarkProps) {
  const color = TONES[tone]
  // Sous 28 px le trait du crochet se referme visuellement : on l'épaissit.
  const stroke = size < 28 ? 4.4 : 3.4
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="12.4" r="5.2" fill="none" stroke={color} strokeWidth={stroke} />
      <path
        d="M24 17.6 6.9 32.3A2.6 2.6 0 0 0 8.6 36.9h30.8a2.6 2.6 0 0 0 1.7-4.6L24 17.6Z"
        fill={color}
      />
    </svg>
  )
}

/** Le lockup complet, tel qu'il apparaît dans la barre du haut. */
export function Wordmark({ size = 20 }: { size?: number }) {
  const tile = Math.round(size * 1.5)
  return (
    <span className="flex items-center gap-2.5">
      <span
        className="flex shrink-0 items-center justify-center rounded-[30%] bg-brand-700"
        style={{ width: tile, height: tile }}
      >
        <Mark size={Math.round(tile * 0.72)} tone="inverse" />
      </span>
      <span
        className="font-display font-extrabold tracking-[-0.045em] text-app-text"
        style={{ fontSize: size }}
      >
        dripshot
      </span>
    </span>
  )
}
