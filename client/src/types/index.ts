export interface User {
  _id: string
  name: string
  email: string
  token?: string
}

export interface DriveAccount {
  _id: string
  accountEmail: string
  accountName: string
  profilePicture: string
  createdAt: string
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  modifiedTime: string
  createdTime?: string
  thumbnailLink?: string
  webViewLink?: string
  iconLink?: string
  imageMediaMetadata?: {
    width?: number
    height?: number
    rotation?: number
    /** EXIF date taken, "YYYY:MM:DD HH:MM:SS" (camera-local time) */
    time?: string
    cameraMake?: string
    cameraModel?: string
    aperture?: number
    exposureTime?: number
    focalLength?: number
    isoSpeed?: number
    lens?: string
    flashUsed?: boolean
    location?: { latitude?: number; longitude?: number; altitude?: number }
  }
  description?: string
  videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string }
  /** Set for Google Photos items (not Drive). Valid ~60 min. */
  baseUrl?: string
  /** Picker items: Google documents the bytes as needing the Authorization header (Library ones don't). */
  photosAuth?: boolean
  driveAccountId: string
  driveEmail: string
  driveName: string
  driveProfilePicture: string
}

export interface LocalDriveAccount {
  id: string
  accountEmail: string
  accountName: string
  profilePicture: string
  accessToken: string
  refreshToken: string
  tokenExpiry: number  // epoch ms
}
