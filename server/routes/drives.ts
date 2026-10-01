import { Router } from 'express'
import {
  connectDrive,
  driveCallback,
  listDrives,
  disconnectDrive,
  localConnectUrl,
  mobileConnectUrl,
  mobileCallback,
  mobileToken,
  mobileRefresh,
} from '../controllers/drives'
import { protect } from '../middleware/jwtAuth'

const router = Router()

router.get('/', protect as any, listDrives as any)
router.get('/connect', protect as any, connectDrive as any)
router.get('/local-connect-url', localConnectUrl)
router.get('/callback', driveCallback as any)
// Android app: PKCE code flow; tokens go to the phone, never the database
router.get('/mobile-connect-url', mobileConnectUrl)
router.get('/mobile-callback', mobileCallback)
router.post('/mobile-token', mobileToken)
router.post('/mobile-refresh', mobileRefresh)
router.delete('/:id', protect as any, disconnectDrive as any)

export default router
