import api from './axios'
import type { User } from '../types'

export const registerUser = (data: { name: string; email: string; password: string }) =>
  api.post<User>('/auth/register', data)

export const loginUser = (data: { email: string; password: string }) =>
  api.post<User>('/auth/login', data)

export const getMe = () => api.get<User>('/auth/me')

export const syncLocalAccount = (data: { name: string; email: string; password: string }) =>
  api.post<User>('/auth/sync', data)
