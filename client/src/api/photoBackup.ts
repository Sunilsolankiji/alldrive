import { Capacitor, registerPlugin } from '@capacitor/core'

/** True inside the Android app, where automatic photo backup is available. */
export const isNativeApp = Capacitor.isNativePlatform()

export type PermissionState = 'granted' | 'denied' | 'prompt'

export interface BackupStatus {
  enabled: boolean
  accountEmail: string
  wifiOnly: boolean
  running: boolean
  /** Files uploaded since backup was first enabled on this phone. */
  uploadedCount: number
  /** Epoch ms of the last finished run, 0 if never. */
  lastRunAt: number
  lastError: string
  /** Google revoked the refresh token; the account must be connected again. */
  needsReconnect: boolean
  mediaPermission: PermissionState
  notificationPermission: PermissionState
}

/** Native plugin in client/android/app/src/main/java/com/alldrive/app/PhotoBackupPlugin.java.
 *  Refresh tokens live only in the phone's encrypted storage, never in localStorage. */
export interface PhotoBackupPlugin {
  saveAccount(options: { email: string; refreshToken: string; apiBase: string }): Promise<void>
  removeAccount(options: { email: string }): Promise<void>
  /** Rejects with code 'reauth' when Google revoked access, 'no_account' when no token is stored.
   *  `force` skips the cached token, e.g. after Google rejected it. */
  getAccessToken(options: { email: string; force?: boolean }): Promise<{ accessToken: string; expiresAt: number }>
  getStatus(): Promise<BackupStatus>
  requestMediaPermissions(): Promise<BackupStatus>
  enable(options: { email: string; wifiOnly: boolean }): Promise<BackupStatus>
  disable(): Promise<BackupStatus>
  setWifiOnly(options: { wifiOnly: boolean }): Promise<BackupStatus>
  /** Queues every photo and video already on the phone (skips ones already backed up). */
  backupExisting(): Promise<BackupStatus>
  backupNow(): Promise<BackupStatus>
  /** Opens this app's Android settings, for permissions the user denied permanently. */
  openSettings(): Promise<void>
}

export const PhotoBackup = registerPlugin<PhotoBackupPlugin>('PhotoBackup')
