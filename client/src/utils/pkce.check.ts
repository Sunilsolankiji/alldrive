// Run: node --experimental-strip-types client/src/utils/pkce.check.ts
import assert from 'node:assert/strict'
import { pkceChallenge, randomPkceValue } from './pkce.ts'

// RFC 7636 appendix B test vector
assert.equal(
  await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
  'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
)

// The server only accepts 43-128 unreserved characters
const v = randomPkceValue()
assert.match(v, /^[A-Za-z0-9\-._~]{43,128}$/)
assert.notEqual(v, randomPkceValue())

console.log('pkce checks passed')
