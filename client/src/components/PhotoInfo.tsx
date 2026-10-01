import { useEffect, useState } from 'react'
import { getFileHead } from '../api/localDrive'
import { fileKey } from '../hooks/usePagedDriveFiles'
import type { DriveFile, LocalDriveAccount } from '../types'
import { parseExif, parseExifDate, parseVideoCreated, type ExifInfo } from '../utils/exif'
import { formatExposure, formatSize, isVideo, takenAt } from '../utils/photoLayout'
import { username } from '../utils/username'

// Material Design icon paths (Apache 2.0)
const INFO_ICONS = {
  close: 'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z',
  calendar: 'M7,10H12V15H7M19,19H5V8H19M19,3H18V1H16V3H8V1H6V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3Z',
  image: 'M19,19H5V5H19M19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M13.96,12.29L11.21,15.83L9.25,13.47L6.5,17H17.5L13.96,12.29Z',
  video: 'M15,8V16H5V8H15M16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5V7A1,1 0 0,0 16,6Z',
  camera: 'M20,4H16.83L15,2H9L7.17,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6A2,2 0 0,0 20,4M20,18H4V6H8.05L9.88,4H14.12L15.95,6H20V18M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15Z',
  place: 'M12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5M12,2A7,7 0 0,1 19,9C19,14.25 12,22 12,22C12,22 5,14.25 5,9A7,7 0 0,1 12,2M12,4A5,5 0 0,0 7,9C7,10 7,12 12,18.71C17,12 17,10 17,9A5,5 0 0,0 12,4Z',
  cloud: 'M19,18H6A4,4 0 0,1 2,14A4,4 0 0,1 6,10H6.71C7.37,7.69 9.5,6 12,6A5.5,5.5 0 0,1 17.5,11.5V12H19A3,3 0 0,1 22,15A3,3 0 0,1 19,18M19.35,10.03C18.67,6.59 15.64,4 12,4C9.11,4 6.6,5.64 5.35,8.03C2.34,8.36 0,10.9 0,14A6,6 0 0,0 6,20H19A5,5 0 0,0 24,15C24,12.36 21.95,10.22 19.35,10.03Z',
}

const Row = ({ icon, primary, secondary }: { icon: string; primary: string; secondary?: string | string[] }) => (
  <li className="flex gap-5 py-3">
    <svg viewBox="0 0 24 24" className="mt-0.5 h-6 w-6 shrink-0 text-gray-600" aria-hidden="true">
      <path d={icon} fill="currentColor" />
    </svg>
    <div className="min-w-0">
      <p className="text-[15px] text-gray-900 [overflow-wrap:anywhere]">{primary}</p>
      {[secondary ?? []].flat().filter(Boolean).map((s) => (
        <p key={s} className="mt-0.5 text-sm text-gray-600 [overflow-wrap:anywhere]">
          {s}
        </p>
      ))}
    </div>
  </li>
)

const join = (...parts: (string | number | false | null | undefined)[]) => parts.filter(Boolean).join('  ·  ')

// Parsed once per file for the session; the file's bytes don't change for a given id.
const metaCache = new Map<string, Promise<ExifInfo & { videoCreated?: Date }>>()
const readMeta = (drive: LocalDriveAccount, file: DriveFile) => {
  const key = fileKey(file)
  if (!metaCache.has(key)) {
    const p = getFileHead(drive, file.id)
      .then((buf) => (isVideo(file) ? { videoCreated: parseVideoCreated(buf) } : parseExif(buf)))
    p.catch(() => metaCache.delete(key)) // retry next time (e.g. expired token)
    metaCache.set(key, p)
  }
  return metaCache.get(key)!
}

/** "+03:00" → "GMT+03:00"; for a UTC instant, the viewer's own offset. */
const gmtLabel = (offset?: string, instant?: Date) => {
  if (offset && /^[+-]\d{2}:\d{2}$/.test(offset)) return offset === '+00:00' ? 'GMT' : `GMT${offset}`
  if (!instant) return ''
  return new Intl.DateTimeFormat(undefined, { timeZoneName: 'longOffset' }).formatToParts(instant).find((p) => p.type === 'timeZoneName')?.value ?? ''
}

interface Props {
  file: DriveFile
  drive?: LocalDriveAccount
  open: boolean
  onClose: () => void
}

/** Google-Photos-style "Info" side panel: original date taken, file, camera, location, account. */
const PhotoInfo = ({ file, drive, open, onClose }: Props) => {
  const [meta, setMeta] = useState<{ key: string; value: ExifInfo & { videoCreated?: Date } } | null>(null)
  const key = fileKey(file)
  useEffect(() => {
    if (!open || !drive || file.baseUrl || (!isVideo(file) && !file.mimeType.startsWith('image/'))) return
    let live = true
    readMeta(drive, file)
      .then((value) => live && setMeta({ key, value }))
      .catch(() => {}) // keep Drive's metadata
    return () => {
      live = false
    }
  }, [open, drive, file, key])
  const x = meta?.key === key ? meta.value : {}

  const img = file.imageMediaMetadata
  const m = img ?? file.videoMediaMetadata
  // Priority: EXIF DateTimeOriginal (+ its offset) > Drive's EXIF time > video creation time > date added
  const exifTaken = x.taken ?? parseExifDate(img?.time)
  const date = exifTaken ?? x.videoCreated ?? new Date(takenAt(file))
  // Google Photos' creationTime is already the date taken
  const original = !!(exifTaken || x.videoCreated || file.baseUrl)
  const tz = exifTaken ? gmtLabel(x.offset) : gmtLabel(undefined, date)

  const width = m?.width ?? x.width
  const height = m?.height ?? x.height
  const megapixels = width && height && !isVideo(file) ? `${(Math.round((width * height) / 1e5) / 10).toFixed(1)}MP` : ''
  // "Pixel 7" by "Google" → "Google Pixel 7", but don't repeat a make the model already starts with
  const make = (x.make ?? img?.cameraMake)?.trim()
  const model = (x.model ?? img?.cameraModel)?.trim()
  const cameraName = make && model?.toLowerCase().startsWith(make.toLowerCase()) ? model : [make, model].filter(Boolean).join(' ')
  const fNumber = x.fNumber ?? img?.aperture
  const focal = x.focalLength ?? img?.focalLength
  const exposure = join(
    fNumber && `ƒ/${+fNumber.toFixed(2)}`,
    formatExposure(x.exposureTime ?? img?.exposureTime),
    focal && `${+focal.toFixed(2)}mm`,
    (x.iso ?? img?.isoSpeed) && `ISO${x.iso ?? img?.isoSpeed}`
  )
  const cameraExtra = [
    x.lens ?? img?.lens,
    join(
      x.focalLength35 && `${x.focalLength35}mm (35mm equiv.)`,
      x.exposureBias ? `${x.exposureBias > 0 ? '+' : ''}${+x.exposureBias.toFixed(1)} EV` : '',
      (x.flashFired ?? img?.flashUsed) !== undefined && ((x.flashFired ?? img?.flashUsed) ? 'Flash on' : 'Flash off')
    ),
    x.software,
  ].filter(Boolean) as string[]
  const lat = x.latitude ?? img?.location?.latitude
  const lon = x.longitude ?? img?.location?.longitude
  const hasLoc = lat != null && lon != null
  const altitude = x.altitude ?? img?.location?.altitude

  return (
    <aside
      aria-label="Info"
      className="h-full w-[360px] overflow-y-auto bg-white text-gray-900 [color-scheme:light] max-sm:w-full"
    >
      <header className="flex items-center gap-4 px-4 py-3">
        <button type="button" onClick={onClose} className="rounded-full p-2 text-gray-700 hover:bg-gray-100" aria-label="Close info">
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
            <path d={INFO_ICONS.close} fill="currentColor" />
          </svg>
        </button>
        <h2 className="text-[22px]">Info</h2>
      </header>

      <div className="px-6 pb-6">
        {file.description && <p className="mb-4 whitespace-pre-wrap border-b border-gray-200 pb-4 text-[15px] text-gray-800">{file.description}</p>}

        <h3 className="mb-1 mt-2 text-xs font-medium uppercase tracking-wider text-gray-600">Details</h3>
        <ul>
          <Row
            icon={INFO_ICONS.calendar}
            primary={date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
            secondary={join(
              date.toLocaleDateString(undefined, { weekday: 'short' }) +
                ', ' +
                date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: original ? '2-digit' : undefined }),
              tz,
              !original && 'Added to Drive'
            )}
          />
          <Row
            icon={isVideo(file) ? INFO_ICONS.video : INFO_ICONS.image}
            primary={file.name}
            secondary={join(megapixels, width && height && `${width} × ${height}`, formatSize(file.size))}
          />
          {(cameraName || exposure) && (
            <Row icon={INFO_ICONS.camera} primary={cameraName || 'Camera'} secondary={[exposure, ...cameraExtra]} />
          )}
          {hasLoc && (
            <Row
              icon={INFO_ICONS.place}
              primary={`${lat.toFixed(5)}, ${lon.toFixed(5)}`}
              secondary={altitude != null ? `${Math.round(altitude)} m above sea level` : undefined}
            />
          )}
        </ul>

        {open && hasLoc && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`}
            target="_blank"
            rel="noreferrer"
            className="mb-2 mt-1 block overflow-hidden rounded-lg border border-gray-200"
            title="Open in Google Maps"
          >
            {/* Loaded only when this panel is open with a geotagged photo; the coordinates go to openstreetmap.org. */}
            <iframe
              title="Map"
              loading="lazy"
              className="pointer-events-none h-44 w-full"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.01},${lat - 0.006},${lon + 0.01},${lat + 0.006}&layer=mapnik&marker=${lat},${lon}`}
            />
          </a>
        )}

        <ul className="border-t border-gray-200 pt-1">
          <Row icon={INFO_ICONS.cloud} primary={`${file.baseUrl ? 'In Google Photos' : 'Backed up'} (${username(file.driveEmail)})`} secondary={file.driveEmail} />
        </ul>
      </div>
    </aside>
  )
}

export default PhotoInfo
