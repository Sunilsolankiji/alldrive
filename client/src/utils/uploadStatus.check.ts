// Run: node --experimental-strip-types client/src/utils/uploadStatus.check.ts
import assert from 'node:assert/strict'
import { uploadSummary, type UploadLike } from './uploadStatus.ts'

const item = (status: UploadLike['status'], pct = 0): UploadLike => ({ status, pct })

// Mid-flight: counts the file being sent, and the bar reflects its partial progress.
const midway = uploadSummary([item('done', 100), item('uploading', 50), item('pending'), item('pending')])
assert.equal(midway.label, 'Uploading 2 of 4')
assert.equal(midway.percent, 38)
assert.equal(midway.busy, true)

// A failed file still occupies its whole slot, so the bar keeps moving forward.
assert.equal(uploadSummary([item('failed'), item('uploading', 0)]).percent, 50)

// Done, all good — singular vs plural.
assert.equal(uploadSummary([item('done', 100)]).label, 'Uploaded 1 item')
assert.equal(uploadSummary([item('done', 100), item('done', 100)]).label, 'Uploaded 2 items')

// Done with failures reports them instead of claiming success.
const mixed = uploadSummary([item('done', 100), item('failed'), item('failed')])
assert.deepEqual(
  { label: mixed.label, percent: mixed.percent, busy: mixed.busy, failed: mixed.failed },
  { label: 'Uploaded 1 item, 2 failed', percent: 100, busy: false, failed: 2 }
)

// A canceled file settles like a failed one: full slot, called out in the label, not counted as uploaded.
const canceled = uploadSummary([item('done', 100), item('canceled', 40), item('canceled', 0)])
assert.deepEqual(
  { label: canceled.label, percent: canceled.percent, busy: canceled.busy, canceled: canceled.canceled },
  { label: 'Uploaded 1 item, 2 canceled', percent: 100, busy: false, canceled: 2 }
)

// Cancelling everything mid-flight settles the queue rather than leaving it busy.
assert.equal(uploadSummary([item('canceled', 70), item('canceled')]).label, '2 canceled')

// Canceled files still advance the "x of y" counter for whatever is left running.
assert.equal(uploadSummary([item('canceled'), item('uploading', 10), item('pending')]).label, 'Uploading 2 of 3')

// The "x of y" label never runs past the total on the last file.
assert.equal(uploadSummary([item('done', 100), item('uploading', 90)]).label, 'Uploading 2 of 2')

// Empty list: don't divide by zero.
assert.equal(uploadSummary([]).percent, 100)
assert.equal(uploadSummary([]).busy, false)

console.log('uploadStatus: ok')
