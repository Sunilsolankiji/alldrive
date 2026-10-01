import { google } from 'googleapis'
import axios from 'axios'
import { Readable } from 'stream'
import type { Response } from 'express'
import { createOAuth2Client } from '../config/googleOAuth'
import DriveAccount, { type IDriveAccount } from '../models/DriveAccount'

const getAuthClient = async (driveAccount: IDriveAccount) => {
  const oauth2Client = createOAuth2Client()
  oauth2Client.setCredentials({
    access_token: driveAccount.accessToken,
    refresh_token: driveAccount.refreshToken,
    expiry_date: new Date(driveAccount.tokenExpiry).getTime(),
  })

  if (new Date() >= new Date(driveAccount.tokenExpiry)) {
    const { credentials } = await oauth2Client.refreshAccessToken()
    oauth2Client.setCredentials(credentials)
    await DriveAccount.findByIdAndUpdate(driveAccount._id, {
      accessToken: credentials.access_token,
      tokenExpiry: new Date(credentials.expiry_date!),
    })
  }

  return oauth2Client
}

interface ListFilesOptions {
  pageToken?: string
  mimeType?: string
  pageSize?: number
}

export const listFiles = async (driveAccount: IDriveAccount, options: ListFilesOptions = {}) => {
  const auth = await getAuthClient(driveAccount)
  const drive = google.drive({ version: 'v3', auth })

  const params: Record<string, unknown> = {
    pageSize: options.pageSize || 50,
    fields:
      'nextPageToken, files(id, name, mimeType, size, modifiedTime, thumbnailLink, webViewLink, iconLink, parents)',
    orderBy: 'modifiedTime desc',
  }

  if (options.pageToken) params.pageToken = options.pageToken
  if (options.mimeType) params.q = `mimeType='${options.mimeType}'`

  const response = await drive.files.list(params as any)
  return {
    files: response.data.files || [],
    nextPageToken: response.data.nextPageToken || null,
    driveAccountId: driveAccount._id,
    driveEmail: driveAccount.accountEmail,
    driveName: driveAccount.accountName,
    driveProfilePicture: driveAccount.profilePicture,
  }
}

export const uploadFile = async (
  driveAccount: IDriveAccount,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  folderId?: string
) => {
  const auth = await getAuthClient(driveAccount)
  const drive = google.drive({ version: 'v3', auth })

  const metadata: { name: string; parents?: string[] } = { name: fileName }
  if (folderId) metadata.parents = [folderId]

  const response = await drive.files.create({
    requestBody: metadata,
    media: { mimeType, body: Readable.from(fileBuffer) },
    fields: 'id, name, mimeType, size, modifiedTime, webViewLink, iconLink',
  })
  return response.data
}

export const streamFile = async (driveAccount: IDriveAccount, fileId: string, res: Response) => {
  const auth = await getAuthClient(driveAccount)
  const drive = google.drive({ version: 'v3', auth })

  const meta = await drive.files.get({ fileId, fields: 'name, mimeType' })
  const { name, mimeType } = meta.data

  res.setHeader('Content-Type', mimeType || 'application/octet-stream')
  res.setHeader('Content-Disposition', `inline; filename="${name}"`)

  const fileStream = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' })
  fileStream.data.pipe(res)
}

export const streamPhotosFile = async (driveAccount: IDriveAccount, url: string, res: Response) => {
  const parsed = new URL(url)
  if (!['lh3.googleusercontent.com', 'lh4.googleusercontent.com', 'video-downloads.googleusercontent.com'].includes(parsed.hostname)) {
    throw new Error('Invalid Google Photos media URL')
  }

  const auth = await getAuthClient(driveAccount)
  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${auth.credentials.access_token}`,
      ...(res.req.headers.range ? { Range: res.req.headers.range } : {}),
    },
    responseType: 'stream',
    validateStatus: (status) => status >= 200 && status < 400,
  })

  res.status(response.status)
  for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const value = response.headers[header]
    if (value) res.setHeader(header, value)
  }
  response.data.pipe(res)
}

export const downloadFile = async (driveAccount: IDriveAccount, fileId: string, res: Response) => {
  const auth = await getAuthClient(driveAccount)
  const drive = google.drive({ version: 'v3', auth })

  const meta = await drive.files.get({ fileId, fields: 'name, mimeType' })
  const { name, mimeType } = meta.data

  res.setHeader('Content-Type', mimeType || 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`)

  const fileStream = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' })
  fileStream.data.pipe(res)
}

export const deleteFile = async (driveAccount: IDriveAccount, fileId: string) => {
  const auth = await getAuthClient(driveAccount)
  const drive = google.drive({ version: 'v3', auth })
  await drive.files.delete({ fileId })
}
