import api from './axios'
import type { DriveAccount } from '../types'

export const getDrives = () => api.get<DriveAccount[]>('/drives')
export const connectDrive = () => api.get<{ url: string }>('/drives/connect')
export const disconnectDrive = (id: string) => api.delete(`/drives/${id}`)
