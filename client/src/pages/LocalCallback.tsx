import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useLocalDrives } from '../context/LocalDriveContext'
import type { LocalDriveAccount } from '../types'

const LocalCallback = () => {
  const { addDrive } = useLocalDrives()
  const navigate = useNavigate()
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    const hash = new URLSearchParams(window.location.hash.replace('#', '?'))
    const accessToken = hash.get('access_token')
    const expiresIn = parseInt(hash.get('expires_in') || '3600')

    if (!accessToken) {
      navigate('/login')
      return
    }

    // Fetch Google profile using the access token — never touches our backend
    axios
      .get<{ email: string; name: string; picture: string }>(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      .then(({ data }) => {
        const drive: LocalDriveAccount = {
          id: crypto.randomUUID(),
          accountEmail: data.email,
          accountName: data.name,
          profilePicture: data.picture,
          accessToken,
          refreshToken: '',
          tokenExpiry: Date.now() + expiresIn * 1000,
        }
        addDrive(drive)
        navigate('/dashboard')
      })
      .catch(() => navigate('/login'))
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <p className="animate-pulse text-sm text-gray-500">Connecting your drive…</p>
    </div>
  )
}

export default LocalCallback
