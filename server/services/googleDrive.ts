import { google } from 'googleapis'
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
