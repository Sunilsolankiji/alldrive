import { Router } from 'express'
import multer from 'multer'
import { getAllFiles, upload, preview, photosPreview, download, removeFile } from '../controllers/files'
import { protect } from '../middleware/jwtAuth'

const storage = multer.memoryStorage()
const uploadMiddleware = multer({ storage })

const router = Router()

router.get('/', protect as any, getAllFiles as any)
router.post('/upload', protect as any, uploadMiddleware.single('file'), upload as any)
router.get('/:driveId/photos/preview', protect as any, photosPreview as any)
router.get('/:driveId/:fileId/preview', protect as any, preview as any)
router.get('/:driveId/:fileId/download', protect as any, download as any)
router.delete('/:driveId/:fileId', protect as any, removeFile as any)

export default router
