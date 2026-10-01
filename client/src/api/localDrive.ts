import axios from 'axios'
import api from './axios'
import type { DriveFile, LocalDriveAccount } from '../types'
import { fetchOriginal } from './googlePhotos'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

/** Returns a valid access token. Implicit-flow tokens cannot be refreshed — return as-is. */
export const getValidToken = (drive: LocalDriveAccount): string => drive.accessToken

/** Treat tokens as expired a minute early so requests don't fail mid-flight. */
export const isTokenExpired = (drive: LocalDriveAccount, now = Date.now()) =>
  !(now < drive.tokenExpiry - 60_000) // also true for a missing/invalid expiry

/** Redirects to Google sign-in. Pass the account email to reconnect it without the consent screen,
 *  or `consent` to show it anyway (needed to grant a newly added permission). */
export const startGoogleConnect = async (loginHint?: string, consent = false) => {
  const res = await api.get<{ url: string }>('/drives/local-connect-url', {
    params: { ...(loginHint ? { login_hint: loginHint } : {}), ...(consent ? { consent: 1 } : {}) },
  })
  window.location.href = res.data.url
}

const FILE_FIELDS =
  'id,name,mimeType,size,modifiedTime,createdTime,thumbnailLink,webViewLink,iconLink,description,' +
  'imageMediaMetadata(width,height,rotation,time,cameraMake,cameraModel,aperture,exposureTime,focalLength,isoSpeed,lens,flashUsed,location),' +
  'videoMediaMetadata(width,height,durationMillis)'

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
  onProgress?: (pct: number) => void,
  signal?: AbortSignal
): Promise<void> => {
  const token = getValidToken(drive)
  const metadata = JSON.stringify({ name: file.name, mimeType: file.type })
  const body = new FormData()
  body.append('metadata', new Blob([metadata], { type: 'application/json' }))
  body.append('file', file)

  await axios.post(`${UPLOAD_API}/files?uploadType=multipart`, body, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
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
/** Google thumbnail at a size. `-no` stops Google drawing its own play button onto video thumbnails. */
export const sizedThumbnail = (link: string, suffix: string) =>
  /=s\d+$/.test(link) ? link.replace(/=s\d+$/, `=${suffix}-no`) : `${link}=${suffix}-no`

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
export const downloadFile = async (drive: LocalDriveAccount, file: DriveFile) => {
  const url = file.baseUrl ? await fetchOriginal(drive, file) : await getFileUrl(drive, file.id)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** First `bytes` of a file (HTTP Range), for reading embedded metadata without downloading it all. */
export const getFileHead = async (drive: LocalDriveAccount, fileId: string, bytes = 256 * 1024): Promise<ArrayBuffer> => {
  const res = await axios.get<ArrayBuffer>(`${DRIVE_API}/files/${fileId}`, {
    headers: { Authorization: 'Bearer ' + getValidToken(drive), Range: `bytes=0-${bytes - 1}` },
    params: { alt: 'media' },
    responseType: 'arraybuffer',
  })
  return res.data
}

const PHOTOS_API = 'https://photoslibrary.googleapis.com/v1'

/** Google Photos only accepts photos and videos; everything else stays on Drive. */
export const isPhotosMedia = (file: File) => /^(image|video)\//.test(file.type)

/** Readable reason an upload failed. Drive/batchCreate return {error:{message}}; the raw
 *  Photos upload endpoint returns text like {"code":16,"message":...}. */
export const uploadErrorMessage = (err: unknown): string => {
  const res = (err as { response?: { status?: number; data?: unknown } }).response
  let data = res?.data
  if (typeof data === 'string') try { data = JSON.parse(data) } catch { /* plain text */ }
  const d = data as { error?: { message?: string }; message?: string } | string | undefined
  const message = (typeof d === 'object' ? d?.error?.message ?? d?.message : d) || (err as Error).message
  if (/not activated|has not been used|is disabled/i.test(message ?? ''))
    return 'The Google Photos Library API is not enabled for this app. Enable it in Google Cloud Console (APIs & Services → Library), wait a minute, then try again.'
  if (res?.status === 401 || (res?.status === 403 && /scope/i.test(message ?? '')))
    return 'Google rejected the upload — reconnect the account and tick the Google Photos permission.'
  return message ?? 'please try again.'
}

/** Whether the token may upload to Google Photos (users can untick it on the consent screen). Asks Google, not the stored copy. */
export const hasPhotosScope = async (drive: LocalDriveAccount) => {
  const { data } = await axios.post<{ scope?: string }>(
    'https://oauth2.googleapis.com/tokeninfo',
    new URLSearchParams({ access_token: getValidToken(drive) })
  )
  return !!data.scope?.includes('photoslibrary.appendonly')
}

/** Uploads a photo/video into the account's Google Photos library (raw upload + batchCreate). */
export const uploadToPhotos = async (drive: LocalDriveAccount, file: File, onProgress?: (pct: number) => void, signal?: AbortSignal): Promise<void> => {
  const auth = 'Bearer ' + getValidToken(drive)
  const { data: uploadToken } = await axios.post<string>(`${PHOTOS_API}/uploads`, file, {
    headers: {
      Authorization: auth,
      'Content-Type': 'application/octet-stream',
      'X-Goog-Upload-Content-Type': file.type,
      'X-Goog-Upload-Protocol': 'raw',
    },
    responseType: 'text',
    signal,
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
    },
  })
  const { data } = await axios.post<{ newMediaItemResults?: { status?: { code?: number; message?: string } }[] }>(
    `${PHOTOS_API}/mediaItems:batchCreate`,
    { newMediaItems: [{ simpleMediaItem: { uploadToken, fileName: file.name } }] },
    { headers: { Authorization: auth }, signal }
  )
  const status = data.newMediaItemResults?.[0]?.status
  if (status?.code) throw new Error(status.message || 'Google Photos rejected the file')
}
