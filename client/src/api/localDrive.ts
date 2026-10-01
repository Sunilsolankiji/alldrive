import axios from 'axios'
import api from './axios'
import type { DriveFile, LocalDriveAccount } from '../types'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

/** Returns a valid access token. Implicit-flow tokens cannot be refreshed — return as-is. */
export const getValidToken = (drive: LocalDriveAccount): string => drive.accessToken

/** Treat tokens as expired a minute early so requests don't fail mid-flight. */
export const isTokenExpired = (drive: LocalDriveAccount, now = Date.now()) =>
  !(now < drive.tokenExpiry - 60_000) // also true for a missing/invalid expiry

/** Redirects to Google sign-in. Pass the account email to reconnect it without the consent screen. */
export const startGoogleConnect = async (loginHint?: string) => {
  const res = await api.get<{ url: string }>('/drives/local-connect-url', {
    params: loginHint ? { login_hint: loginHint } : {},
  })
  window.location.href = res.data.url
}

const FILE_FIELDS =
  'id,name,mimeType,size,modifiedTime,createdTime,thumbnailLink,webViewLink,iconLink,' +
  'imageMediaMetadata(width,height,rotation),videoMediaMetadata(width,height,durationMillis)'

export const listFiles = async (
  drive: LocalDriveAccount,
  options: { pageToken?: string; q?: string; orderBy?: string; pageSize?: number } = {}
): Promise<{ files: DriveFile[]; nextPageToken?: string }> => {
  const token = getValidToken(drive)

  const params: Record<string, string | number> = {
    pageSize: options.pageSize || 100,
    fields: `nextPageToken,files(${FILE_FIELDS})`,
    orderBy: options.orderBy || 'modifiedTime desc',
    q: ['trashed = false', options.q].filter(Boolean).join(' and '),
  }
  if (options.pageToken) params.pageToken = options.pageToken

  const res = await axios.get<{
    nextPageToken?: string
    files: Omit<DriveFile, 'driveAccountId' | 'driveEmail' | 'driveName' | 'driveProfilePicture'>[]
  }>(`${DRIVE_API}/files`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  })

  const files = (res.data.files || []).map((f) => ({
    ...f,
    driveAccountId: drive.id,
    driveEmail: drive.accountEmail,
    driveName: drive.accountName,
    driveProfilePicture: drive.profilePicture,
  }))
  return { files, nextPageToken: res.data.nextPageToken }
}

export const uploadFile = async (
  drive: LocalDriveAccount,
  file: File,
  onProgress?: (pct: number) => void
): Promise<void> => {
  const token = getValidToken(drive)
  const metadata = JSON.stringify({ name: file.name, mimeType: file.type })
  const body = new FormData()
  body.append('metadata', new Blob([metadata], { type: 'application/json' }))
  body.append('file', file)

  await axios.post(`${UPLOAD_API}/files?uploadType=multipart`, body, {
    headers: { Authorization: `Bearer ${token}` },
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
    },
  })
}

/** Moves the file to Drive's trash (recoverable for 30 days), like Google Photos does. */
export const deleteFile = async (drive: LocalDriveAccount, fileId: string): Promise<void> => {
  const token = getValidToken(drive)
  await axios.patch(`${DRIVE_API}/files/${fileId}`, { trashed: true }, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

/** Drive thumbnail links end in `=s220`; the same URL serves any size, cached on Google's CDN. */
export const sizedThumbnail = (link: string, suffix: string) =>
  /=s\d+$/.test(link) ? link.replace(/=s\d+$/, `=${suffix}`) : `${link}=${suffix}`

/** Downloads the file with an auth header and returns a blob URL. Caller must revoke it.
 *  Drive rejects `?access_token=` in the URL (403), and <img>/<video> can't send headers.
 *  ponytail: loads the whole file into memory; large videos need a server-side streaming proxy. */
export const getFileUrl = async (drive: LocalDriveAccount, fileId: string): Promise<string> => {
  const res = await axios.get<Blob>(`${DRIVE_API}/files/${fileId}`, {
    headers: { Authorization: `Bearer ${getValidToken(drive)}` },
    params: { alt: 'media' },
    responseType: 'blob',
  })
  return URL.createObjectURL(res.data)
}

/** Saves the original file to the device straight from Drive. */
export const downloadFile = async (drive: LocalDriveAccount, file: { id: string; name: string }) => {
  const url = await getFileUrl(drive, file.id)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
