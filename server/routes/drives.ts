import { Router } from 'express'
import { connectDrive, driveCallback, listDrives, disconnectDrive, localConnectUrl } from '../controllers/drives'
import { protect } from '../middleware/jwtAuth'

const router = Router()

router.get('/', protect as any, listDrives as any)
router.get('/connect', protect as any, connectDrive as any)
router.get('/local-connect-url', localConnectUrl)
router.get('/callback', driveCallback as any)
router.delete('/:id', protect as any, disconnectDrive as any)

export default router
