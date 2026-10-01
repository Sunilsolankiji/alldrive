import axios from 'axios'
import type { DriveFile, LocalDriveAccount } from '../types'
import api from './axios'
import { getValidToken } from './localDrive'

/**
 * Google Photos, browser-only. Since March 2025 Google lets apps read only (a) items the app uploaded
 * (Library API, `photoslibrary.readonly.appcreateddata`) and (b) items the user picks in Google's
 * Picker (`photospicker.mediaitems.readonly`). The whole library can't be listed.
 */
const LIBRARY_API = 'https://photoslibrary.googleapis.com/v1'
const PICKER_API = 'https://photospicker.googleapis.com/v1'
const auth = (drive: LocalDriveAccount) => ({ Authorization: 'Bearer ' + getValidToken(drive) })

interface PhotoMeta {
  cameraMake?: string
  cameraModel?: string
  focalLength?: number
  apertureFNumber?: number
  isoEquivalent?: number
  exposureTime?: string // "0.008s"
}
interface LibraryItem {
  id: string
  baseUrl: string
  productUrl?: string
  mimeType: string
  filename: string
  mediaMetadata?: { creationTime?: string; width?: string; height?: string; photo?: PhotoMeta; video?: object }
}
interface PickedItem {
  id: string
  createTime?: string
  mediaFile: {
    baseUrl: string
    mimeType: string
    filename?: string
    mediaFileMetadata?: { width?: number; height?: number; cameraMake?: string; cameraModel?: string; photoMetadata?: PhotoMeta; videoMetadata?: object }
  }
}

const toFile = (
  drive: LocalDriveAccount,
  item: { id: string; baseUrl: string; photosAuth?: boolean; mimeType?: string; name: string; time?: string; width?: string | number; height?: string | number; photo?: PhotoMeta; video?: object; link?: string }
): DriveFile => {
  const width = Number(item.width) || undefined
  const height = Number(item.height) || undefined
  const p = item.photo
  const time = item.time ?? new Date(0).toISOString()
  // Google omits mimeType on some items; the presence of video metadata is the reliable fallback signal.
  const mimeType = item.mimeType || (item.video ? 'video/*' : 'image/*')
  return {
    id: item.id,
    name: item.name,
    mimeType,
    createdTime: time,
    modifiedTime: time,
    baseUrl: item.baseUrl,
    photosAuth: item.photosAuth,
    webViewLink: item.link,
    imageMediaMetadata: mimeType.startsWith('image/')
      ? {
          width,
          height,
          cameraMake: p?.cameraMake,
          cameraModel: p?.cameraModel,
          aperture: p?.apertureFNumber,
          focalLength: p?.focalLength,
          isoSpeed: p?.isoEquivalent,
          exposureTime: p?.exposureTime ? parseFloat(p.exposureTime) : undefined,
        }
      : undefined,
    videoMediaMetadata: mimeType.startsWith('video/') ? { width, height } : undefined,
    driveAccountId: drive.id,
    driveEmail: drive.accountEmail,
    driveName: drive.accountName,
    driveProfilePicture: drive.profilePicture,
  }
}

/** Everything AllDrive uploaded to this account's Google Photos.
 *  ponytail: reads every page up front (app-created libraries are small); paginate if that grows. */
export const listAppCreated = async (drive: LocalDriveAccount): Promise<DriveFile[]> => {
  const out: DriveFile[] = []
  let pageToken: string | undefined
  do {
    const { data } = await axios.get<{ mediaItems?: LibraryItem[]; nextPageToken?: string }>(`${LIBRARY_API}/mediaItems`, {
      headers: auth(drive),
      params: { pageSize: 100, pageToken },
    })
    for (const m of data.mediaItems ?? [])
      out.push(toFile(drive, { ...m, name: m.filename ?? m.id, time: m.mediaMetadata?.creationTime, ...m.mediaMetadata, link: m.productUrl }))
    pageToken = data.nextPageToken
  } while (pageToken)
  return out
}

// Picker sessions are remembered per account so picked items survive a reload (until Google expires the session).
const SESSIONS_KEY = 'alldrive.photoPickerSessions'
const loadSessions = (): Record<string, string[]> => {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? '{}')
  } catch {
    return {}
  }
}
const saveSessions = (email: string, ids: string[]) =>
  localStorage.setItem(SESSIONS_KEY, JSON.stringify({ ...loadSessions(), [email]: ids }))

const listSession = async (drive: LocalDriveAccount, sessionId: string): Promise<DriveFile[]> => {
  const out: DriveFile[] = []
  let pageToken: string | undefined
  do {
    const { data } = await axios.get<{ mediaItems?: PickedItem[]; nextPageToken?: string }>(`${PICKER_API}/mediaItems`, {
      headers: auth(drive),
      params: { sessionId, pageSize: 100, pageToken },
    })
    for (const { id, createTime, mediaFile: f } of data.mediaItems ?? [])
      out.push(
        toFile(drive, {
          id,
          baseUrl: f.baseUrl,
          photosAuth: true,
          mimeType: f.mimeType,
          name: f.filename ?? id,
          time: createTime,
          width: f.mediaFileMetadata?.width,
          height: f.mediaFileMetadata?.height,
          photo: { ...f.mediaFileMetadata, ...f.mediaFileMetadata?.photoMetadata },
          video: f.mediaFileMetadata?.videoMetadata,
        })
      )
    pageToken = data.nextPageToken
  } while (pageToken)
  return out
}

/** Items from every remembered picker session; expired/deleted sessions are forgotten. */
export const listPicked = async (drive: LocalDriveAccount): Promise<DriveFile[]> => {
  const ids = loadSessions()[drive.accountEmail] ?? []
  const results = await Promise.allSettled(ids.map((id) => listSession(drive, id)))
  const gone = ids.filter((_, i) => {
    const r = results[i]
    return r.status === 'rejected' && [400, 404].includes(r.reason?.response?.status)
  })
  if (gone.length) saveSessions(drive.accountEmail, ids.filter((id) => !gone.includes(id)))
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected' && !gone.includes(ids[results.indexOf(r)]))
  if (failed) throw failed.reason
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const seconds = (d?: string, fallback = 5) => (d ? parseFloat(d) : fallback) * 1000

/** Opens Google's Photo Picker for this account and resolves once the user is done picking. */
export const pickFromGooglePhotos = async (drive: LocalDriveAccount) => {
  // Open the window inside the click handler, before any await, or the popup blocker stops it.
  const popup = window.open('', 'google-photos-picker', 'width=1000,height=760')
  try {
    const { data: session } = await axios.post<{ id: string; pickerUri: string; pollingConfig?: { pollInterval?: string; timeoutIn?: string } }>(
      `${PICKER_API}/sessions`,
      {},
      { headers: auth(drive) }
    )
    if (popup) popup.location.href = `${session.pickerUri}/autoclose`
    else window.open(`${session.pickerUri}/autoclose`, '_blank')
    const deadline = Date.now() + seconds(session.pollingConfig?.timeoutIn, 1800)
    while (Date.now() < deadline) {
      await sleep(seconds(session.pollingConfig?.pollInterval))
      const { data } = await axios.get<{ mediaItemsSet?: boolean }>(`${PICKER_API}/sessions/${session.id}`, { headers: auth(drive) })
      if (data.mediaItemsSet) {
        saveSessions(drive.accountEmail, [...(loadSessions()[drive.accountEmail] ?? []), session.id])
        return
      }
      // ponytail: closing the picker without choosing can't be detected reliably (COOP hides popup.closed),
      // so polling runs until Google's timeout; it's just a cheap GET every few seconds.
    }
  } catch (err) {
    popup?.close()
    throw err
  }
}

/** Image URL at a given size: `h440` = 440px tall rows, `s2048` = fits a 2048px box.
 *  `-no` stops Google drawing its own play button onto video thumbnails. */
export const sizedBaseUrl = (baseUrl: string, size: string) => {
  const n = Number(size.slice(1))
  return `${baseUrl}=${size[0] === 'h' ? `w${n * 3}-h${n}` : `w${n}-h${n}`}-no`
}

/** The original bytes (`=d` keeps EXIF except location; `=dv` is the video file). */
export const originalUrl = (f: DriveFile) => `${f.baseUrl}=${f.mimeType.startsWith('video/') ? 'dv' : 'd'}`

const blobCache = new Map<string, Promise<string>>()
/** Fetches a Picker URL with the auth header into a blob URL, cached for the page's lifetime.
 *  googleusercontent.com may refuse the header (CORS); callers fall back to the plain URL.
 *  ponytail: cached blobs are never revoked; fine for a browsing session, add an LRU if memory grows. */
export const authedBlobUrl = (url: string, drive: LocalDriveAccount) => {
  if (!blobCache.has(url)) {
    const p = axios
      .get<Blob>(url, { headers: auth(drive), responseType: 'blob' })
      .then((r) => URL.createObjectURL(r.data))
    p.catch(() => {}) // keep the rejection cached: retrying a CORS refusal for every render is pointless
    blobCache.set(url, p)
  }
  return blobCache.get(url)!
}

/** The original photo/video as a fresh blob URL (caller revokes it). Library URLs are fetched plainly. */
export const fetchOriginal = async (drive: LocalDriveAccount, f: DriveFile) => {
  const r = await api.get<Blob>(`/files/${encodeURIComponent(drive.id)}/photos/preview`, {
    params: { url: originalUrl(f) },
    responseType: 'blob',
  })
  return URL.createObjectURL(r.data)
}
