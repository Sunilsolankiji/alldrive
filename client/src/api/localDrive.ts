import axios from 'axios'
import type { DriveFile, LocalDriveAccount } from '../types'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

/** Returns a valid access token. Implicit-flow tokens cannot be refreshed — return as-is. */
export const getValidToken = (drive: LocalDriveAccount): string => drive.accessToken

export const listFiles = async (
  drive: LocalDriveAccount,
  options: { pageToken?: string; mimeType?: string; pageSize?: number } = {}
): Promise<DriveFile[]> => {
  const token = getValidToken(drive)

  const params: Record<string, string | number> = {
    pageSize: options.pageSize || 50,
    fields: 'files(id,name,mimeType,size,modifiedTime,thumbnailLink,webViewLink,iconLink)',
    orderBy: 'modifiedTime desc',
  }
  if (options.pageToken) params.pageToken = options.pageToken
  if (options.mimeType) params.q = `mimeType='${options.mimeType}'`

  const res = await axios.get<{
    files: Omit<DriveFile, 'driveAccountId' | 'driveEmail' | 'driveName' | 'driveProfilePicture'>[]
  }>(`${DRIVE_API}/files`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  })

  return (res.data.files || []).map((f) => ({
    ...f,
    driveAccountId: drive.id,
    driveEmail: drive.accountEmail,
    driveName: drive.accountName,
    driveProfilePicture: drive.profilePicture,
  }))
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

export const deleteFile = async (drive: LocalDriveAccount, fileId: string): Promise<void> => {
  const token = getValidToken(drive)
  await axios.delete(`${DRIVE_API}/files/${fileId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

/** Returns a direct URL to stream the file using the in-memory access token. */
export const getFileUrl = (drive: LocalDriveAccount, fileId: string): string =>
  `${DRIVE_API}/files/${fileId}?alt=media&access_token=${drive.accessToken}`
