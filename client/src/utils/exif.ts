/**
 * Minimal EXIF reader for the info panel: finds the TIFF block inside JPEG / HEIC / PNG / TIFF bytes
 * and reads the handful of tags Google Photos shows. Also reads the MP4/MOV creation time.
 * ponytail: scans only the bytes it's given (the first ~256 KB). HEIC files that store EXIF near
 * the end, and videos with the `moov` box at the end, fall back to Drive's metadata.
 */

export interface ExifInfo {
  /** Wall-clock time the photo was taken, as recorded by the camera. */
  taken?: Date
  /** e.g. "+03:00" when the camera recorded it (OffsetTimeOriginal). */
  offset?: string
  make?: string
  model?: string
  lens?: string
  software?: string
  fNumber?: number
  exposureTime?: number
  focalLength?: number
  focalLength35?: number
  iso?: number
  exposureBias?: number
  flashFired?: boolean
  width?: number
  height?: number
  latitude?: number
  longitude?: number
  altitude?: number
}

const findBytes = (b: Uint8Array, pattern: number[], from = 0) => {
  outer: for (let i = from; i <= b.length - pattern.length; i++) {
    for (let j = 0; j < pattern.length; j++) if (b[i + j] !== pattern[j]) continue outer
    return i
  }
  return -1
}
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))

/** EXIF "YYYY:MM:DD HH:MM:SS" → local Date (wall-clock), or undefined. */
export const parseExifDate = (s?: string) => {
  const m = s?.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!m || m[1] === '0000') return undefined
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
  return isNaN(d.getTime()) ? undefined : d
}

function tiffStart(b: Uint8Array) {
  const exif = findBytes(b, ascii('Exif\0\0')) // JPEG APP1 and HEIC Exif item
  if (exif >= 0) return exif + 6
  const png = findBytes(b, ascii('eXIf')) // PNG chunk type, data follows
  if (png >= 0) return png + 4
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 42) || (b[0] === 0x4d && b[1] === 0x4d && b[3] === 42)) return 0 // bare TIFF/DNG
  return -1
}

export function parseExif(buffer: ArrayBuffer): ExifInfo {
  const bytes = new Uint8Array(buffer)
  const start = tiffStart(bytes)
  if (start < 0 || start + 8 > bytes.length) return {}
  const view = new DataView(buffer, start)
  const little = view.getUint16(0) === 0x4949
  const u16 = (o: number) => view.getUint16(o, little)
  const u32 = (o: number) => view.getUint32(o, little)
  const SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }

  const readIfd = (offset: number) => {
    const tags = new Map<number, unknown>()
    if (offset <= 0 || offset + 2 > view.byteLength) return tags
    const count = u16(offset)
    for (let i = 0; i < count; i++) {
      const e = offset + 2 + i * 12
      if (e + 12 > view.byteLength) break
      const tag = u16(e)
      const type = u16(e + 2)
      const n = u32(e + 4)
      const size = (SIZES[type] ?? 0) * n
      if (!size) continue
      const at = size <= 4 ? e + 8 : u32(e + 8)
      if (at + size > view.byteLength) continue
      const values: (number | string)[] = []
      if (type === 2) {
        let s = ''
        for (let k = 0; k < n; k++) s += String.fromCharCode(view.getUint8(at + k))
        tags.set(tag, s.replace(/\0+$/, '').trim())
        continue
      }
      for (let k = 0; k < Math.min(n, 4); k++) {
        const o = at + k * SIZES[type]
        if (type === 3) values.push(u16(o))
        else if (type === 4) values.push(u32(o))
        else if (type === 9) values.push(view.getInt32(o, little))
        else if (type === 5) values.push(u32(o) / (u32(o + 4) || 1))
        else if (type === 10) values.push(view.getInt32(o, little) / (view.getInt32(o + 4, little) || 1))
        else values.push(view.getUint8(o))
      }
      tags.set(tag, n === 1 ? values[0] : values)
    }
    return tags
  }

  const ifd0 = readIfd(u32(4))
  const exif = readIfd(Number(ifd0.get(0x8769) ?? 0))
  const gps = readIfd(Number(ifd0.get(0x8825) ?? 0))
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
  const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : undefined)
  const dms = (v: unknown, ref: unknown, neg: string) => {
    if (!Array.isArray(v) || v.length < 3) return undefined
    const deg = v[0] + v[1] / 60 + v[2] / 3600
    return ref === neg ? -deg : deg
  }
  const lat = dms(gps.get(2), gps.get(1), 'S')
  const lon = dms(gps.get(4), gps.get(3), 'W')
  const flash = num(exif.get(0x9209))

  return {
    taken: parseExifDate(str(exif.get(0x9003)) ?? str(exif.get(0x9004)) ?? str(ifd0.get(0x0132))),
    offset: str(exif.get(0x9011)) ?? str(exif.get(0x9010)),
    make: str(ifd0.get(0x010f)),
    model: str(ifd0.get(0x0110)),
    software: str(ifd0.get(0x0131)),
    lens: str(exif.get(0xa434)),
    fNumber: num(exif.get(0x829d)),
    exposureTime: num(exif.get(0x829a)),
    focalLength: num(exif.get(0x920a)),
    focalLength35: num(exif.get(0xa405)),
    iso: num(exif.get(0x8827)),
    exposureBias: num(exif.get(0x9204)),
    flashFired: flash === undefined ? undefined : (flash & 1) === 1,
    width: num(exif.get(0xa002)),
    height: num(exif.get(0xa003)),
    // (0, 0) is what many apps write when location is off
    latitude: lat || lon ? lat : undefined,
    longitude: lat || lon ? lon : undefined,
    altitude: num(gps.get(6)) !== undefined ? (gps.get(5) === 1 ? -1 : 1) * (gps.get(6) as number) : undefined,
  }
}

/** MP4/MOV `mvhd` creation time (UTC), or undefined if the box isn't in these bytes or unset. */
export function parseVideoCreated(buffer: ArrayBuffer): Date | undefined {
  const b = new Uint8Array(buffer)
  const i = findBytes(b, ascii('mvhd'))
  if (i < 0 || i + 16 > b.length) return undefined
  const view = new DataView(buffer, i + 4)
  const secs = view.getUint8(0) === 1 ? Number(view.getBigUint64(4)) : view.getUint32(4)
  const MAC_EPOCH = Date.UTC(1904, 0, 1)
  return secs > 0 ? new Date(MAC_EPOCH + secs * 1000) : undefined
}
