/** PKCE (RFC 7636) helpers for the Android app's Google sign-in. */

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** 32 random bytes → 43-char base64url string; used for both the verifier and the state. */
export const randomPkceValue = () => base64url(crypto.getRandomValues(new Uint8Array(32)))

export const pkceChallenge = async (verifier: string) =>
  base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
