import type { DriveFile } from '../types'

export const takenAt = (f: DriveFile) => f.createdTime ?? f.modifiedTime
export const isVideo = (f: DriveFile) => f.mimeType.startsWith('video/')

/** Width / height from Drive metadata, rotation-aware, clamped so panoramas don't take a whole row. */
export const aspectRatio = (f: DriveFile) => {
  const m = f.imageMediaMetadata ?? f.videoMediaMetadata
  if (!m?.width || !m?.height) return 1
  const r = (f.imageMediaMetadata?.rotation ?? 0) % 2 ? m.height / m.width : m.width / m.height
  return Math.min(Math.max(r, 0.5), 2.5)
}

/** Intrinsic pixel size from metadata, rotation-aware. Undefined when the file doesn't report it. */
export const naturalSize = (f: DriveFile) => {
  const m = f.imageMediaMetadata ?? f.videoMediaMetadata
  if (!m?.width || !m?.height) return undefined
  const swap = (f.imageMediaMetadata?.rotation ?? 0) % 2 === 1
  return { width: swap ? m.height : m.width, height: swap ? m.width : m.height }
}

/** "0:07", "12:34", "1:02:03" — the clock style video players use. Empty when unknown. */
export const formatDuration = (ms?: string | number) => {
  const total = Math.round(Number(ms) / 1000)
  if (!Number.isFinite(total) || total <= 0) return ''
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

export const formatSize = (size?: string) => {
  const bytes = Number(size)
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export interface JustifiedRow {
  start: number
  end: number
  height: number
}

/**
 * Google-Photos-style justified rows: every full row exactly fills `width`, with a height as
 * close to `target` as possible. The last (incomplete) row keeps the target height.
 */
export function justify(ratios: number[], width: number, target: number, gap: number): JustifiedRow[] {
  const rows: JustifiedRow[] = []
  if (width <= 0) return rows
  const fit = (sum: number, n: number) => (width - gap * (n - 1)) / sum
  let start = 0
  let sum = 0
  for (let i = 0; i < ratios.length; i++) {
    const n = i - start + 1
    if ((sum + ratios[i]) * target + gap * (n - 1) < width) {
      sum += ratios[i]
      continue
    }
    const withItem = fit(sum + ratios[i], n)
    const without = n > 1 ? fit(sum, n - 1) : Infinity
    if (Math.abs(withItem - target) <= Math.abs(without - target)) {
      rows.push({ start, end: i + 1, height: withItem })
      start = i + 1
      sum = 0
    } else {
      rows.push({ start, end: i, height: without })
      start = i
      sum = ratios[i]
      // the item that started the new row may already fill it on its own
      if (sum * target >= width) {
        rows.push({ start, end: i + 1, height: fit(sum, 1) })
        start = i + 1
        sum = 0
      }
    }
  }
  if (start < ratios.length) rows.push({ start, end: ratios.length, height: target })
  return rows
}

/** Shutter speed the way cameras print it: 0.008 ? "1/125", 2 ? "2s". */
export const formatExposure = (seconds?: number) => {
  if (!seconds || seconds <= 0) return ''
  return seconds >= 1 ? `${+seconds.toFixed(1)}s` : `1/${Math.round(1 / seconds)}`
}
