import { google } from 'googleapis'

export const createOAuth2Client = () =>
  new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  // Upload-only access to Google Photos (the only upload scope Google still offers)
  'https://www.googleapis.com/auth/photoslibrary.appendonly',
  // Read back what AllDrive uploaded, and items the user picks in Google's Photo Picker
  'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata',
  'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]
