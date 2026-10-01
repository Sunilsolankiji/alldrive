import { useEffect, useRef, useState } from 'react'
import * as googlePhotos from '../api/googlePhotos'
import * as localDriveApi from '../api/localDrive'
import { fileKey } from '../hooks/usePagedDriveFiles'
import type { DriveFile, LocalDriveAccount } from '../types'
import { isVideo, naturalSize } from '../utils/photoLayout'
import MediaImg from './MediaImg'
import PhotoInfo from './PhotoInfo'

// Material Design icon paths (Apache 2.0)
export const ICONS = {
  check: 'M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z',
  close: 'M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z',
  back: 'M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z',
  prev: 'M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z',
  next: 'M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z',
  download: 'M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z',
  trash: 'M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z',
  info: 'M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z',
  openInDrive: 'M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z',
  fullscreen: 'M5,5H10V7H7V10H5V5M14,5H19V10H17V7H14V5M17,14H19V19H14V17H17V14M10,17V19H5V14H7V17H10Z',
  exitFullscreen: 'M14,14H19V16H16V19H14V14M5,14H10V19H8V16H5V14M8,5H10V10H5V8H8V5M19,8V10H14V5H16V8H19Z',
  play: 'M8,5.14V19.14L19,12.14L8,5.14Z',
}

export const Icon = ({ path, className = 'h-5 w-5' }: { path: string; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path d={path} fill="currentColor" />
  </svg>
)

interface Props {
  files: DriveFile[]
  index: number
  onIndex: (index: number) => void
  onClose: () => void
  hasMore: boolean
  loadMore: () => void
  driveOf: (f: DriveFile) => LocalDriveAccount | undefined
  onDownload: (f: DriveFile) => void
  onDelete: (f: DriveFile) => void
}

const viewportPx = () =>
  Math.min(4096, Math.round(Math.max(window.innerWidth, window.innerHeight) * devicePixelRatio))
const thumb = (f: DriveFile, size: string) =>
  f.baseUrl ? googlePhotos.sizedBaseUrl(f.baseUrl, size) : f.thumbnailLink ? localDriveApi.sizedThumbnail(f.thumbnailLink, size) : ''

/** Warms the browser cache with the viewer-size image, so opening/sliding to it shows full resolution at once. */
export const preloadFull = (f?: DriveFile, drive?: LocalDriveAccount) => {
  if (!f || needsOriginal(f)) return
  if (f.photosAuth) {
    if (drive) googlePhotos.authedBlobUrl(thumb(f, `s${viewportPx()}`), drive).catch(() => {})
    return
  }
  const img = new Image()
  img.referrerPolicy = 'no-referrer' // must match the <img>, or Google's CDN may refuse and nothing gets cached
  img.src = thumb(f, `s${viewportPx()}`)
}
const needsOriginal = (f: DriveFile) => isVideo(f) || !(f.thumbnailLink || f.baseUrl)

/** Caps the image box at the file's real pixel size so small photos show 1:1 instead of being blown
 *  up to fill the stage. Placeholder and full image share the box, so the swap never shifts. */
const naturalBox = (f: DriveFile) => {
  const n = naturalSize(f)
  return n ? { maxWidth: n.width, maxHeight: n.height } : undefined
}

const barButton = 'rounded-full p-2.5 text-white/90 hover:bg-white/10 hover:text-white disabled:opacity-40'
const ZOOM = 2.5

// Fullscreen API with the Safari (webkit-prefixed) fallback. iPhone Safari has neither, so the button is hidden there.
type WebkitDocument = Document & { webkitFullscreenElement?: Element; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => Promise<void> }
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
const doc = document as WebkitDocument
const canFullscreen = !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled)
const fullscreenElement = () => doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null
const exitFullscreen = () => (doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.())
const requestFullscreen = (el: WebkitElement) => (el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.())
const navButton =
  'absolute top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 enabled:hover:bg-black/70 disabled:cursor-not-allowed disabled:bg-black/20 disabled:text-white/25 max-sm:hidden'

/** Full-screen photo/video viewer: keyboard, swipe, click-to-zoom, info panel. */
const PhotoViewer = ({ files, index, onIndex, onClose, hasMore, loadMore, driveOf, onDownload, onDelete }: Props) => {
  const file = files[index]
  const [showInfo, setShowInfo] = useState(false)
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  const panStart = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const [loadedSrc, setLoadedSrc] = useState('')
  const [chromeVisible, setChromeVisible] = useState(true)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  // n restarts the slide animation (via key); from = where the track starts, in px
  const [slide, setSlide] = useState({ n: 0, from: '0px' })
  const stageRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const sync = () => setIsFullscreen(!!fullscreenElement())
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
      if (fullscreenElement()) void exitFullscreen() // leaving the viewer leaves full screen too
    }
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (fullscreenElement()) await exitFullscreen()
      else await requestFullscreen(rootRef.current!)
    } catch (err) {
      console.warn('Full screen was blocked by the browser', err)
    }
  }
  const touchX = useRef<number | null>(null)
  const hideTimer = useRef<number>(undefined)

  // Videos and thumbnail-less files need the original, fetched with the auth header as a blob URL.
  const [originals, setOriginals] = useState<Record<string, string>>({})
  const originalsRef = useRef(originals)
  const driveOfRef = useRef(driveOf)
  useEffect(() => {
    originalsRef.current = originals
    driveOfRef.current = driveOf
  })
  useEffect(
    () => () =>
      Object.values(originalsRef.current)
        .filter((u) => u.startsWith('blob:'))
        .forEach((u) => URL.revokeObjectURL(u)),
    []
  )
  useEffect(() => {
    if (!file || !needsOriginal(file)) return
    const k = fileKey(file)
    const drive = driveOfRef.current(file)
    if (originalsRef.current[k] || !drive) return
    if (file.baseUrl && !file.photosAuth) {
      setOriginals((o) => ({ ...o, [k]: googlePhotos.originalUrl(file) }))
      return
    }
    let cancelled = false
    ;(file.baseUrl ? googlePhotos.fetchOriginal(drive, file) : localDriveApi.getFileUrl(drive, file.id))
      .then((url) => (cancelled ? URL.revokeObjectURL(url) : setOriginals((o) => ({ ...o, [k]: url }))))
      .catch(() => {
        if (!cancelled && file.baseUrl) {
          // Google may reject the authenticated XHR after redirecting the media URL.
          // Native video loading can still consume the expiring URL directly.
          setOriginals((o) => ({ ...o, [k]: googlePhotos.originalUrl(file) }))
        }
      })
    return () => {
      cancelled = true
    }
  }, [file])

  const hasPrev = index > 0
  const hasNext = index < files.length - 1
  /** delta is ±1; drag is the current swipe offset so the slide continues from under the finger. */
  const go = (delta: number, drag = 0) => {
    const i = index + delta
    if (i < 0 || i >= files.length) return
    const w = stageRef.current?.clientWidth ?? window.innerWidth
    setZoom(null)
    setSlide((s) => ({ n: s.n + 1, from: `${delta * w + drag}px` }))
    onIndex(i)
  }

  useEffect(() => {
    if (hasMore && index >= files.length - 5) loadMore()
  }, [index, files.length, hasMore, loadMore])

  // Warm the cache for the neighbours so arrowing through is instant.
  useEffect(() => {
    const f = files[index]
    if (f) [files[index - 1], files[index + 1]].forEach((n) => preloadFull(n, driveOfRef.current(n ?? f)))
  }, [files, index])

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
      window.clearTimeout(hideTimer.current)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (zoom) setZoom(null)
        else if (fullscreenElement()) void exitFullscreen()
        else onClose()
      } else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'Delete' && file && !file.baseUrl) {
        setZoom(null)
        onDelete(file)
      } else if (e.key === 'i') setShowInfo((s) => !s)
      else if (e.key === 'f' && canFullscreen) void toggleFullscreen()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!file) return null

  const px = viewportPx()
  const original = originals[fileKey(file)]
  const preview = thumb(file, 'h440') // already cached by the grid, so the viewer opens instantly
  const full = original ?? thumb(file, `s${px}`)
  // Picker bytes are documented as needing the auth header; Library and Drive URLs don't
  const authOf = (f: DriveFile) => (f.photosAuth ? driveOf(f) : undefined)
  const canDelete = !file.baseUrl // the Google Photos API can't delete

  const pokeChrome = () => {
    setChromeVisible(true)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setChromeVisible(false), 3000)
  }
  const chrome = `transition-opacity duration-300 ${chromeVisible || showInfo ? 'opacity-100' : 'opacity-0'}`

  const zoomPoint = (e: React.MouseEvent<HTMLElement>) => {
    const r = (layerRef.current ?? e.currentTarget).getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }
  }

  /** Keeps the zoomed image covering its own box so it can't be dragged off-screen.
   *  Uses offset sizes, which ignore the scale transform already applied to the layer. */
  const clampPan = (x: number, y: number, el: HTMLElement) => {
    const layer = layerRef.current ?? el
    if (!zoom) return { x: 0, y: 0 }
    const w = layer.offsetWidth
    const h = layer.offsetHeight
    const ox = (zoom.x / 100) * w
    const oy = (zoom.y / 100) * h
    const k = ZOOM - 1
    return {
      x: Math.min(ox * k, Math.max(-(w - ox) * k, x)),
      y: Math.min(oy * k, Math.max(-(h - oy) * k, y)),
    }
  }

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
      className="fixed inset-0 z-50 flex bg-black text-white"
      onMouseMove={pokeChrome}
    >
      <div
        ref={stageRef}
        className="relative flex-1 overflow-hidden"
        onTouchStart={(e) => {
          if (zoom) return
          touchX.current = e.touches[0].clientX
          setDragging(true)
        }}
        onTouchMove={(e) => {
          if (touchX.current === null) return
          const dx = e.touches[0].clientX - touchX.current
          // rubber-band at the ends
          setDragX((dx > 0 && !hasPrev) || (dx < 0 && !hasNext) ? dx / 3 : dx)
        }}
        onTouchEnd={() => {
          if (touchX.current === null) return
          touchX.current = null
          setDragging(false)
          setDragX(0)
          if (Math.abs(dragX) > 50) go(dragX < 0 ? 1 : -1, dragX)
        }}
      >
        <div
          key={slide.n}
          className="absolute inset-0 motion-safe:animate-[viewer-slide_320ms_cubic-bezier(0.2,0.8,0.2,1)]"
          style={
            {
              '--slide-from': slide.from,
              animationName: slide.n ? undefined : 'none',
              transform: dragX ? `translateX(${dragX}px)` : undefined,
              transition: dragging ? 'none' : 'transform 200ms ease-out',
            } as React.CSSProperties
          }
        >
          {[files[index - 1], files[index + 1]].map(
            (f, i) =>
              f && (
                <div key={fileKey(f)} className={`absolute inset-y-0 w-full ${i ? 'left-full' : '-left-full'}`}>
                  {thumb(f, 's1') && (
                    <div className="absolute inset-0 m-auto" style={naturalBox(f)}>
                      <MediaImg authDrive={authOf(f)} src={thumb(f, `s${px}`)} alt="" referrerPolicy="no-referrer" draggable={false} className="h-full w-full object-contain" />
                    </div>
                  )}
                </div>
              )
          )}
        {isVideo(file) ? (
          <div className="absolute inset-0 flex items-center justify-center">
            {original ? (
              <video key={original} src={original} poster={(!file.baseUrl && preview) || undefined} controls autoPlay playsInline className="max-h-full max-w-full" />
            ) : (
              <>
                {preview && <MediaImg authDrive={authOf(file)} src={preview} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-contain opacity-60" />}
                <span className="relative h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" aria-label="Loading video" />
              </>
            )}
          </div>
        ) : (
          <div
            className={`absolute inset-0 select-none ${zoom ? (panning ? 'cursor-grabbing touch-none' : 'cursor-grab touch-none') : ''}`}
            onDoubleClick={(e) => {
              setPan({ x: 0, y: 0 })
              setZoom(zoom ? null : zoomPoint(e))
            }}
            onPointerDown={(e) => {
              if (!zoom || e.button !== 0) return
              e.currentTarget.setPointerCapture(e.pointerId)
              panStart.current = { px: e.clientX, py: e.clientY, x: pan.x, y: pan.y }
              setPanning(true)
            }}
            onPointerMove={(e) => {
              const s = panStart.current
              if (s) setPan(clampPan(s.x + e.clientX - s.px, s.y + e.clientY - s.py, e.currentTarget))
            }}
            onPointerUp={() => {
              panStart.current = null
              setPanning(false)
            }}
            onPointerCancel={() => {
              panStart.current = null
              setPanning(false)
            }}
          >
            <div
              ref={layerRef}
              className={`absolute inset-0 m-auto ease-out ${panning ? '' : 'transition-transform duration-200'}`}
              style={{
                ...naturalBox(file),
                ...(zoom
                  ? { transform: `translate(${pan.x}px, ${pan.y}px) scale(${ZOOM})`, transformOrigin: `${zoom.x}% ${zoom.y}%` }
                  : undefined),
              }}
            >
              {preview && loadedSrc !== full && (
                <MediaImg authDrive={authOf(file)} src={preview} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-contain" />
              )}
              {full ? (
                <MediaImg
                  key={full}
                  authDrive={original ? undefined : authOf(file)}
                  // Already cached (preloaded neighbour/hover): show it in this same frame, no low-res stage.
                  ref={(el) => {
                    if (el?.complete && el.naturalWidth && loadedSrc !== full) setLoadedSrc(full)
                  }}
                  src={full}
                  alt={file.name}
                  referrerPolicy="no-referrer"
                  // Swap only once decoded, so the placeholder is never removed before pixels are ready.
                  onLoad={(e) => {
                    e.currentTarget.decode().catch(() => {}).finally(() => setLoadedSrc(full))
                  }}
                  className={`absolute inset-0 h-full w-full object-contain ${loadedSrc === full ? '' : 'opacity-0'}`}
                  draggable={false}
                />
              ) : (
                <span className="absolute inset-0 m-auto h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" aria-label="Loading" />
              )}
            </div>
          </div>
        )}
        </div>

        <div className={`pointer-events-none absolute inset-x-0 top-0 flex items-center gap-1 bg-gradient-to-b from-black/70 to-transparent p-2 ${chrome}`}>
          <button type="button" onClick={onClose} className={`${barButton} pointer-events-auto`} aria-label="Back" title="Back (Esc)" autoFocus>
            <Icon path={ICONS.back} />
          </button>
          <span className="flex-1 truncate px-2 text-sm text-white/80">
            {index + 1} / {files.length}
            {hasMore ? '+' : ''}
          </span>
          <div className="pointer-events-auto flex items-center gap-1">
            <button type="button" onClick={() => setShowInfo((s) => !s)} className={`${barButton} ${showInfo ? 'bg-white/15' : ''}`} aria-label="Info" aria-pressed={showInfo} title="Info (i)">
              <Icon path={ICONS.info} />
            </button>
            {canFullscreen && (
              <button
                type="button"
                onClick={toggleFullscreen}
                className={barButton}
                aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
                aria-pressed={isFullscreen}
                title={isFullscreen ? 'Exit full screen (f)' : 'Full screen (f)'}
              >
                <Icon path={isFullscreen ? ICONS.exitFullscreen : ICONS.fullscreen} />
              </button>
            )}
            <button type="button" onClick={() => onDownload(file)} className={barButton} aria-label="Download" title="Download">
              <Icon path={ICONS.download} />
            </button>
            {file.webViewLink && (
              <a href={file.webViewLink} target="_blank" rel="noreferrer" className={barButton} aria-label={file.baseUrl ? 'Open in Google Photos' : 'Open in Google Drive'} title={file.baseUrl ? 'Open in Google Photos' : 'Open in Google Drive'}>
                <Icon path={ICONS.openInDrive} />
              </a>
            )}
            {canDelete && (
              <button type="button" onClick={() => { setZoom(null); onDelete(file) }} className={barButton} aria-label="Move to trash" title="Move to trash (Delete)">
                <Icon path={ICONS.trash} />
              </button>
            )}
          </div>
        </div>

        <button type="button" disabled={!hasPrev} onClick={() => go(-1)} className={`${navButton} left-3 ${chrome}`} aria-label="Previous" title="Previous (←)">
          <Icon path={ICONS.prev} className="h-7 w-7" />
        </button>
        <button type="button" disabled={!hasNext} onClick={() => go(1)} className={`${navButton} right-3 ${chrome}`} aria-label="Next" title="Next (→)">
          <Icon path={ICONS.next} className="h-7 w-7" />
        </button>
      </div>

      {/* Always mounted so it can slide out as well as in; desktop: width pushes the photo aside, mobile: bottom sheet. */}
      <div
        inert={!showInfo}
        className={`shrink-0 overflow-hidden bg-white transition-[width,transform] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none max-sm:absolute max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-10 max-sm:h-[60%] max-sm:rounded-t-2xl ${
          showInfo ? 'sm:w-[360px]' : 'sm:w-0 max-sm:translate-y-full'
        }`}
      >
        <PhotoInfo file={file} drive={driveOf(file)} open={showInfo} onClose={() => setShowInfo(false)} />
      </div>
    </div>
  )
}

export default PhotoViewer
