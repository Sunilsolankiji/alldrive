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
  thumbnailLink?: string
  webViewLink?: string
  iconLink?: string
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
