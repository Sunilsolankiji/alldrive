import api from './axios'
import type { DriveFile } from '../types'

export const getFiles = (params: Record<string, string | number | undefined> = {}) =>
  api.get<DriveFile[]>('/files', { params })

export const uploadFile = (
  formData: FormData,
  onProgress?: (event: { loaded: number; total?: number }) => void
) =>
  api.post<DriveFile>('/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress,
  })

export const deleteFile = (driveId: string, fileId: string) =>
  api.delete(`/files/${driveId}/${fileId}`)

export const getPreviewUrl = (driveId: string, fileId: string) =>
  `/api/files/${driveId}/${fileId}/preview`

export const getDownloadUrl = (driveId: string, fileId: string) =>
  `/api/files/${driveId}/${fileId}/download`
