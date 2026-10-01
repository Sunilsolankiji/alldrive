// Run: node --experimental-strip-types client/src/utils/photoLayout.check.ts
import assert from 'node:assert/strict'
import { formatDuration, formatExposure, justify, naturalSize } from './photoLayout.ts'

const width = 1000
const gap = 4
const ratios = [1.5, 0.66, 1, 2.5, 1.33, 0.75, 1.78, 1, 0.5, 2, 1.5]
const rows = justify(ratios, width, 200, gap)

// every item placed exactly once, in order
assert.equal(rows[0].start, 0)
assert.equal(rows.at(-1)!.end, ratios.length)
rows.forEach((r, i) => i && assert.equal(r.start, rows[i - 1].end))

// full rows fill the width exactly
rows.slice(0, -1).forEach((r) => {
  const used = ratios.slice(r.start, r.end).reduce((s, x) => s + x * r.height, 0) + gap * (r.end - r.start - 1)
  assert.ok(Math.abs(used - width) < 1e-6, `row ${r.start}-${r.end} uses ${used}px`)
})

// a single item wider than the container gets its own row
assert.deepEqual(justify([10], 500, 200, 4), [{ start: 0, end: 1, height: 50 }])
assert.deepEqual(justify([1, 1], 0, 200, 4), [])

console.log('photoLayout: ok')

assert.equal(formatExposure(1 / 120), '1/120')
assert.equal(formatExposure(0.008), '1/125')
assert.equal(formatExposure(2), '2s')
assert.equal(formatExposure(0), '')
console.log('photo info formatting: ok')

// naturalSize: swaps for quarter-turn rotations only, falls back to video metadata, undefined when unknown.
type F = Parameters<typeof naturalSize>[0]
const img = (width: number, height: number, rotation?: number) => ({ imageMediaMetadata: { width, height, rotation } }) as F
assert.deepEqual(naturalSize(img(4000, 3000)), { width: 4000, height: 3000 })
assert.deepEqual(naturalSize(img(4000, 3000, 1)), { width: 3000, height: 4000 })
assert.deepEqual(naturalSize(img(4000, 3000, 3)), { width: 3000, height: 4000 })
assert.deepEqual(naturalSize(img(4000, 3000, 2)), { width: 4000, height: 3000 })
assert.deepEqual(naturalSize({ videoMediaMetadata: { width: 1920, height: 1080 } } as F), { width: 1920, height: 1080 })
assert.equal(naturalSize({} as F), undefined)
assert.equal(naturalSize(img(0, 0)), undefined)
console.log('naturalSize: ok')

assert.equal(formatDuration('7000'), '0:07')
assert.equal(formatDuration(754_000), '12:34')
assert.equal(formatDuration(3_723_000), '1:02:03')
assert.equal(formatDuration(59_600), '1:00') // rounds into the next minute cleanly
assert.equal(formatDuration(undefined), '')
assert.equal(formatDuration(Infinity), '') // live/unknown-length streams
assert.equal(formatDuration(0), '')
console.log('formatDuration: ok')
