import type { Request, Response } from 'express'
import type { Response as ExpressResponse } from 'express'
import { google } from 'googleapis'
import { createOAuth2Client, SCOPES } from '../config/googleOAuth'
import DriveAccount from '../models/DriveAccount'
import type { AuthRequest } from '../middleware/jwtAuth'

export const connectDrive = (req: AuthRequest, res: ExpressResponse): void => {
  const oauth2Client = createOAuth2Client()
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent select_account',
    state: req.user!._id.toString(),
  })
  res.json({ url })
}

/**
 * Returns a Google OAuth URL for local mode.
 * Uses the app client ID but redirects to /local/callback (implicit/token flow).
 * No auth required — the token is returned to the browser and never sent to our server.
 */
export const localConnectUrl = (req: Request, res: ExpressResponse): void => {
  const clientId = process.env.GOOGLE_CLIENT_ID!
  const redirectUri = `${process.env.CLIENT_URL}/callback`
  const scope = SCOPES.join(' ')
  const loginHint = typeof req.query.login_hint === 'string' ? req.query.login_hint : ''

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope,
    include_granted_scopes: 'true',
  })
  // Reconnect: target the known account and skip consent so Google can redirect straight back
  if (loginHint) params.set('login_hint', loginHint)
  else params.set('prompt', 'consent select_account')
  if (loginHint && req.query.consent) params.set('prompt', 'consent')

  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` })
}

// ---- Android app (Capacitor) connect: authorization code + PKCE, nothing stored server-side ----
// Google only accepts https redirects for web clients, so Google returns to mobile-callback,
// which bounces the one-time code to the app's deep link. The code is useless without the
// PKCE verifier that only the app holds, and the app swaps it for tokens via mobile-token.
// The refresh token is returned to the phone and never written to the database or logs.

export const MOBILE_DEEP_LINK = 'com.alldrive.app://auth'
const mobileRedirectUri = () => `${process.env.CLIENT_URL}/api/drives/mobile-callback`
/** PKCE verifiers/challenges and our state values are base64url, 43-128 chars. */
export const isPkceValue = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9\-._~]{43,128}$/.test(v)
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export const mobileConnectUrl = (req: Request, res: ExpressResponse): void => {
  const { code_challenge: challenge, state, login_hint: loginHint } = req.query
  if (!isPkceValue(challenge) || !isPkceValue(state)) {
    res.status(400).json({ message: 'Invalid code_challenge or state' })
    return
  }
  const url = createOAuth2Client().generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    // consent is what makes Google issue a refresh token on every connect
    prompt: typeof loginHint === 'string' && loginHint ? 'consent' : 'consent select_account',
    ...(typeof loginHint === 'string' && loginHint ? { login_hint: loginHint } : {}),
    redirect_uri: mobileRedirectUri(),
    code_challenge: challenge,
    code_challenge_method: 'S256' as never, // googleapis types expect its own enum
    state,
  })
  res.json({ url })
}

export const mobileCallback = (req: Request, res: ExpressResponse): void => {
  const params = new URLSearchParams()
  for (const key of ['code', 'state', 'error'] as const) {
    const v = req.query[key]
    if (typeof v === 'string' && v.length <= 2048) params.set(key, v)
  }
  const link = escapeHtml(`${MOBILE_DEEP_LINK}?${params}`)
  // A page with a link as well as the redirect, in case the browser blocks the automatic hand-off.
  res
    .status(200)
    .set('Cache-Control', 'no-store')
    .set('Referrer-Policy', 'no-referrer')
    .type('html')
    .send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<meta http-equiv="refresh" content="0;url=${link}"><title>Return to AllDrive</title></head>` +
        `<body style="font-family:system-ui,sans-serif;text-align:center;padding:3rem 1rem">` +
        `<p><a href="${link}" style="display:inline-block;padding:0.9rem 1.5rem;background:#2563eb;color:#fff;border-radius:0.5rem;text-decoration:none">Return to AllDrive</a></p>` +
        `</body></html>`
    )
}

const isInvalidGrant = (err: unknown) =>
  (err as { response?: { data?: { error?: string } } }).response?.data?.error === 'invalid_grant'

export const mobileToken = async (req: Request, res: ExpressResponse): Promise<void> => {
  const { code, verifier } = (req.body ?? {}) as { code?: unknown; verifier?: unknown }
  if (typeof code !== 'string' || !code || code.length > 2048 || !isPkceValue(verifier)) {
    res.status(400).json({ message: 'Invalid code or verifier' })
    return
  }
  const client = createOAuth2Client()
  try {
    const { tokens } = await client.getToken({ code, codeVerifier: verifier, redirect_uri: mobileRedirectUri() })
    if (!tokens.access_token || !tokens.refresh_token) {
      res.status(502).json({ message: 'Google did not return a refresh token. Please try again.' })
      return
    }
    client.setCredentials(tokens)
    const { data: profile } = await google.oauth2({ version: 'v2', auth: client }).userinfo.get()
    res.set('Cache-Control', 'no-store').json({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expiry_date ?? Date.now() + 3600_000,
      email: profile.email ?? '',
      name: profile.name || profile.email || '',
      picture: profile.picture ?? '',
    })
  } catch (err) {
    if (isInvalidGrant(err)) {
      res.status(400).json({ message: 'Sign-in expired. Please connect again.', code: 'invalid_grant' })
      return
    }
    console.error('mobile-token exchange failed:', (err as Error).message)
    res.status(502).json({ message: 'Google sign-in failed. Please try again.' })
  }
}

/** Stateless: swaps the phone's refresh token for a fresh access token. Nothing is stored. */
export const mobileRefresh = async (req: Request, res: ExpressResponse): Promise<void> => {
  const { refreshToken } = (req.body ?? {}) as { refreshToken?: unknown }
  if (typeof refreshToken !== 'string' || !refreshToken || refreshToken.length > 2048) {
    res.status(400).json({ message: 'Invalid refresh token' })
    return
  }
  const client = createOAuth2Client()
  client.setCredentials({ refresh_token: refreshToken })
  try {
    const { token } = await client.getAccessToken()
    if (!token) throw new Error('No access token returned')
    res.set('Cache-Control', 'no-store').json({
      accessToken: token,
      expiresAt: client.credentials.expiry_date ?? Date.now() + 3600_000,
    })
  } catch (err) {
    if (isInvalidGrant(err)) {
      // Revoked, expired (7 days while the OAuth app is in Testing) or password changed
      res.status(401).json({ message: 'Google access was revoked. Reconnect the account.', code: 'reauth' })
      return
    }
    console.error('mobile-refresh failed:', (err as Error).message)
    res.status(502).json({ message: 'Could not refresh Google access. Please try again.' })
  }
}

export const driveCallback = async (req: AuthRequest, res: ExpressResponse): Promise<void> => {
  const { code, state: userId } = req.query as { code: string; state: string }
  if (!code || !userId) {
    res.status(400).json({ message: 'Missing code or state' })
    return
  }
  const oauth2Client = createOAuth2Client()
  const { tokens } = await oauth2Client.getToken(code)
  oauth2Client.setCredentials(tokens)

  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
  const { data: profile } = await oauth2.userinfo.get()

  await DriveAccount.findOneAndUpdate(
    { userId, accountEmail: profile.email },
    {
      userId,
      accountEmail: profile.email,
      accountName: profile.name || profile.email,
      profilePicture: profile.picture || '',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: new Date(tokens.expiry_date!),
    },
    { upsert: true, new: true }
  )
  res.redirect(`${process.env.CLIENT_URL}/drives?connected=1`)
}

export const listDrives = async (req: AuthRequest, res: ExpressResponse): Promise<void> => {
  const drives = await DriveAccount.find({ userId: req.user!._id }).select(
    '-accessToken -refreshToken'
  )
  res.json(drives)
}

export const disconnectDrive = async (req: AuthRequest, res: ExpressResponse): Promise<void> => {
  const drive = await DriveAccount.findOne({ _id: req.params.id, userId: req.user!._id })
  if (!drive) {
    res.status(404).json({ message: 'Drive account not found' })
    return
  }
  await drive.deleteOne()
  res.json({ message: 'Drive disconnected' })
}
