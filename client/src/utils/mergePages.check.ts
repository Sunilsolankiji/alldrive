// Run: node --experimental-strip-types client/src/utils/mergePages.check.ts
import assert from 'node:assert/strict'
import { visibleUpToFrontier } from './mergePages.ts'

const desc = (a: number, b: number) => b - a

// Drive A loaded down to 7 (more pages), drive B fully loaded down to 2.
// B's 5 and 2 must wait: A's next page could contain 6.
assert.deepEqual(visibleUpToFrontier([10, 9, 8, 7, 5, 2], [7], desc), [10, 9, 8, 7])

// Two drives with more pages: the frontier is the one that sorts earliest (9, not 7).
assert.deepEqual(visibleUpToFrontier([10, 9, 8, 7], [7, 9], desc), [10, 9])

// Nothing left to page: show everything.
assert.deepEqual(visibleUpToFrontier([10, 5, 2], [], desc), [10, 5, 2])

console.log('mergePages: ok')
