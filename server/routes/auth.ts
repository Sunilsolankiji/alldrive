import { Router } from 'express'
import { register, login, getMe, syncAccount } from '../controllers/auth'
import { protect } from '../middleware/jwtAuth'

const router = Router()

router.post('/register', register)
router.post('/login', login)
router.post('/sync', syncAccount)
router.get('/me', protect as any, getMe)

export default router
