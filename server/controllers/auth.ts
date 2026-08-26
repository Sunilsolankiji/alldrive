import type { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import User from '../models/User'

const generateToken = (id: string): string =>
  jwt.sign({ id }, process.env.JWT_SECRET as string, { expiresIn: '7d' })

export const register = async (req: Request, res: Response): Promise<void> => {
  const { name, email, password } = req.body as { name: string; email: string; password: string }
  if (!name || !email || !password) {
    res.status(400).json({ message: 'All fields are required' })
    return
  }
  if (password.length < 6) {
    res.status(400).json({ message: 'Password must be at least 6 characters' })
    return
  }
  const exists = await User.findOne({ email })
  if (exists) {
    res.status(409).json({ message: 'Email already in use' })
    return
  }
  const passwordHash = await User.hashPassword(password)
  const user = await User.create({ name, email, passwordHash })
  res.status(201).json({
    _id: user._id,
    name: user.name,
    email: user.email,
    token: generateToken(user._id.toString()),
  })
}

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email: string; password: string }
  if (!email || !password) {
    res.status(400).json({ message: 'Email and password required' })
    return
  }
  const user = await User.findOne({ email })
  if (!user || !(await user.matchPassword(password))) {
    res.status(401).json({ message: 'Invalid credentials' })
    return
  }
  res.json({
    _id: user._id,
    name: user.name,
    email: user.email,
    token: generateToken(user._id.toString()),
  })
}

/**
 * Sync a local account to the server so the user can sign in from any device.
 * Creates the account if it doesn't exist, or verifies password if it does.
 * Returns a JWT — the client stores it alongside the local session.
 */
export const syncAccount = async (req: Request, res: Response): Promise<void> => {
  const { name, email, password } = req.body as { name: string; email: string; password: string }
  if (!email || !password) {
    res.status(400).json({ message: 'Email and password required' })
    return
  }

  let user = await User.findOne({ email })
  if (user) {
    // Account already synced — verify password
    if (!(await user.matchPassword(password))) {
      res.status(401).json({ message: 'Wrong password for this synced account.' })
      return
    }
  } else {
    // First-time sync — create server account
    if (!name) {
      res.status(400).json({ message: 'Name is required for first-time sync.' })
      return
    }
    if (password.length < 8) {
      res.status(400).json({ message: 'Password must be at least 8 characters.' })
      return
    }
    const passwordHash = await User.hashPassword(password)
    user = await User.create({ name, email, passwordHash })
  }

  res.json({
    _id: user._id,
    name: user.name,
    email: user.email,
    token: generateToken(user._id.toString()),
  })
}

export const getMe = async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user
  res.json({ _id: user._id, name: user.name, email: user.email })
}
