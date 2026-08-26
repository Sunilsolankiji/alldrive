import type { Response } from 'express'
import type { AuthRequest } from '../middleware/jwtAuth'
import DriveAccount from '../models/DriveAccount'
import { deleteFile, downloadFile, listFiles, streamFile, uploadFile } from '../services/googleDrive'

export const getAllFiles = async (req: AuthRequest, res: Response): Promise<void> => {
  const { driveId, mimeType, pageSize } = req.query as Record<string, string | undefined>
  const query: Record<string, unknown> = { userId: req.user!._id }
  if (driveId) query._id = driveId

  const drives = await DriveAccount.find(query)
  if (!drives.length) {
    res.json([])
    return
  }

  const results = await Promise.allSettled(
    drives.map((drive) =>
      listFiles(drive, { mimeType, pageSize: pageSize ? parseInt(pageSize) : 50 })
    )
  )

  const allFiles: unknown[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { files, driveAccountId, driveEmail, driveName, driveProfilePicture } = result.value
      for (const file of files) {
        allFiles.push({ ...file, driveAccountId, driveEmail, driveName, driveProfilePicture })
      }
    }
  }

  allFiles.sort(
    (a: any, b: any) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime()
  )
  res.json(allFiles)
}

export const upload = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ message: 'No file provided' })
    return
  }
  const { driveAccountId, folderId } = req.body as { driveAccountId: string; folderId?: string }
  if (!driveAccountId) {
    res.status(400).json({ message: 'driveAccountId is required' })
    return
  }
  const drive = await DriveAccount.findOne({ _id: driveAccountId, userId: req.user!._id })
  if (!drive) {
    res.status(404).json({ message: 'Drive account not found' })
    return
  }
  const uploaded = await uploadFile(drive, req.file.buffer, req.file.originalname, req.file.mimetype, folderId)
  res.status(201).json(uploaded)
}

export const preview = async (req: AuthRequest, res: Response): Promise<void> => {
  const { driveId, fileId } = req.params as { driveId: string; fileId: string }
  const drive = await DriveAccount.findOne({ _id: driveId, userId: req.user!._id })
  if (!drive) {
    res.status(404).json({ message: 'Drive account not found' })
    return
  }
  await streamFile(drive, fileId, res)
}

export const download = async (req: AuthRequest, res: Response): Promise<void> => {
  const { driveId, fileId } = req.params as { driveId: string; fileId: string }
  const drive = await DriveAccount.findOne({ _id: driveId, userId: req.user!._id })
  if (!drive) {
    res.status(404).json({ message: 'Drive account not found' })
    return
  }
  await downloadFile(drive, fileId, res)
}

export const removeFile = async (req: AuthRequest, res: Response): Promise<void> => {
  const { driveId, fileId } = req.params as { driveId: string; fileId: string }
  const drive = await DriveAccount.findOne({ _id: driveId, userId: req.user!._id })
  if (!drive) {
    res.status(404).json({ message: 'Drive account not found' })
    return
  }
  await deleteFile(drive, fileId)
  res.json({ message: 'File deleted' })
}
