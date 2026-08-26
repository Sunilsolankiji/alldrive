import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import User from '../models/User'

export interface AuthRequest extends Request {
  user?: InstanceType<typeof User>
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Not authorized, no token' })
    return
  }
  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string }
    const user = await User.findById(decoded.id).select('-passwordHash')
    if (!user) {
      res.status(401).json({ message: 'User not found' })
      return
    }
    req.user = user
    next()
  } catch {
    res.status(401).json({ message: 'Not authorized, token invalid' })
  }
}
