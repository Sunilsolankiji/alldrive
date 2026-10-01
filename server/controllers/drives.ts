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

  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` })
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
