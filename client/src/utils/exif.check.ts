// Run: node --experimental-strip-types client/src/utils/exif.check.ts
import assert from 'node:assert/strict'
import { parseExif, parseExifDate, parseVideoCreated } from './exif.ts'

type Entry = [tag: number, type: number, count: number, data: number[]]
const le16 = (n: number) => [n & 255, (n >> 8) & 255]
const le32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]
const str = (s: string) => [...s, '\0'].map((c) => c.charCodeAt(0))
const rat = (num: number, den: number) => [...le32(num), ...le32(den)]

/** Lays out one little-endian IFD at `base` (offset from the TIFF start), data right after it. */
function ifd(entries: Entry[], base: number) {
  const head: number[] = [...le16(entries.length)]
  const data: number[] = []
  const dataStart = base + 2 + entries.length * 12 + 4
  for (const [tag, type, count, bytes] of entries) {
    head.push(...le16(tag), ...le16(type), ...le32(count))
    if (bytes.length <= 4) head.push(...bytes, ...Array(4 - bytes.length).fill(0))
    else {
      head.push(...le32(dataStart + data.length))
      data.push(...bytes, ...(bytes.length % 2 ? [0] : []))
    }
  }
  return [...head, 0, 0, 0, 0, ...data]
}

// TIFF header (8) + IFD0 at 8, Exif IFD at 200, GPS IFD at 400
const ifd0 = ifd(
  [
    [0x010f, 2, 7, str('Google')],
    [0x0110, 2, 8, str('Pixel 7')],
    [0x8769, 4, 1, le32(200)],
    [0x8825, 4, 1, le32(400)],
  ],
  8
)
const exifIfd = ifd(
  [
    [0x829a, 5, 1, rat(1, 120)],
    [0x829d, 5, 1, rat(185, 100)],
    [0x8827, 3, 1, le16(50)],
    [0x9003, 2, 20, str('2023:05:14 16:42:10')],
    [0x9011, 2, 7, str('+03:00')],
    [0x9209, 3, 1, le16(0x19)],
    [0x920a, 5, 1, rat(681, 100)],
  ],
  200
)
const gpsIfd = ifd(
  [
    [1, 2, 2, str('N')],
    [2, 5, 3, [...rat(21, 1), ...rat(25, 1), ...rat(21, 1)]],
    [3, 2, 2, str('E')],
    [4, 5, 3, [...rat(39, 1), ...rat(49, 1), ...rat(3432, 100)]],
  ],
  400
)
const tiff = new Uint8Array(600)
tiff.set([0x49, 0x49, 42, 0, ...le32(8)])
tiff.set(ifd0, 8)
tiff.set(exifIfd, 200)
tiff.set(gpsIfd, 400)
// wrap in a JPEG APP1 the way cameras write it
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x02, 0x60, ...str('Exif'), 0, ...tiff])

const e = parseExif(jpeg.buffer)
assert.equal(e.taken!.getTime(), new Date(2023, 4, 14, 16, 42, 10).getTime())
assert.equal(e.offset, '+03:00')
assert.equal(e.make, 'Google')
assert.equal(e.model, 'Pixel 7')
assert.equal(e.exposureTime, 1 / 120)
assert.equal(e.fNumber, 1.85)
assert.equal(e.focalLength, 6.81)
assert.equal(e.iso, 50)
assert.equal(e.flashFired, true)
assert.ok(Math.abs(e.latitude! - 21.4225) < 1e-6, String(e.latitude))
assert.ok(Math.abs(e.longitude! - 39.8262) < 1e-6, String(e.longitude))

assert.deepEqual(parseExif(new Uint8Array([1, 2, 3]).buffer), {})
assert.equal(parseExifDate('0000:00:00 00:00:00'), undefined)

// mvhd v0: size, 'mvhd', version/flags, creation time (secs since 1904)
const secs = (Date.UTC(2024, 0, 2, 3, 4, 5) - Date.UTC(1904, 0, 1)) / 1000
const be32 = (n: number) => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255]
const mp4 = new Uint8Array([...be32(108), ...str('mvhd').slice(0, 4), 0, 0, 0, 0, ...be32(secs), ...Array(96).fill(0)])
assert.equal(parseVideoCreated(mp4.buffer)!.toISOString(), '2024-01-02T03:04:05.000Z')

console.log('exif: ok')
