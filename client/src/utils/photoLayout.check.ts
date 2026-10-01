// Run: node --experimental-strip-types client/src/utils/photoLayout.check.ts
import assert from 'node:assert/strict'
import { formatExposure, justify } from './photoLayout.ts'

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
