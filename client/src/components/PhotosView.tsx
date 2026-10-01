import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as googlePhotos from '../api/googlePhotos'
import * as localDriveApi from '../api/localDrive'
import { useGooglePhotos } from '../hooks/useGooglePhotos'
import { fileKey } from '../hooks/usePagedDriveFiles'
import type { DriveFile, LocalDriveAccount } from '../types'
import { aspectRatio, isVideo, justify, takenAt } from '../utils/photoLayout'
import { username } from '../utils/username'
import MediaImg from './MediaImg'
import PhotoViewer, { ICONS, Icon, preloadFull } from './PhotoViewer'
import VideoDuration from './VideoDuration'

interface Props {
  drives: LocalDriveAccount[]
  search: string
  typeFilter?: (mimeType: string) => boolean
  hidden: Set<string>
  reloadKey: number
  /** Resolves true if the files were deleted. */
  onDelete: (files: DriveFile[]) => Promise<boolean>
}

const GAP = 4
const noop = () => {}

const rowHeight = (width: number) => (width < 600 ? 110 : width < 1200 ? 180 : 220)

const dayLabel = (d: Date) => {
  const today = new Date()
  const days = Math.round(
    (new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5
  )
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  })
}

/** "" for the current month (the heading would be redundant), "September" for the current year,
 *  "September 2024" otherwise — same year rule as the day labels. */
const monthLabel = (d: Date) => {
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  if (sameYear && d.getMonth() === now.getMonth()) return ''
  return d.toLocaleDateString(undefined, { month: 'long', year: sameYear ? undefined : 'numeric' })
}

/** Groups consecutive files by day, remembering each file's index in the flat list. */
const groupByDay = (files: DriveFile[]) => {
  const groups: {
    label: string
    monthLabel: string
    monthKey: string
    items: { file: DriveFile; index: number }[]
  }[] = []
  let lastDay = ''
  files.forEach((file, index) => {
    const d = new Date(takenAt(file))
    if (d.toDateString() !== lastDay) {
      groups.push({
        label: dayLabel(d),
        monthLabel: monthLabel(d),
        monthKey: `${d.getFullYear()}-${d.getMonth()}`,
        items: [],
      })
    }
    lastDay = d.toDateString()
    groups[groups.length - 1].items.push({ file, index })
  })
  return groups
}

const CheckCircle = ({ checked, className }: { checked: boolean; className: string }) => (
  <span
    className={`flex items-center justify-center rounded-full border-2 transition-colors ${
      checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-white bg-black/10 text-transparent hover:text-white/80'
    } ${className}`}
  >
    <Icon path={ICONS.check} className="h-3.5 w-3.5" />
  </span>
)

const PhotosView = ({ drives, search, typeFilter, hidden, reloadKey, onDelete }: Props) => {
  const { files, loading, error, needsAccess, picking, pick } = useGooglePhotos(drives, reloadKey)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [viewerIndex, setViewerIndex] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [width, setWidth] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const query = search.trim().toLowerCase()
  const visible = useMemo(
    () =>
      files.filter(
        (f) =>
          !hidden.has(fileKey(f)) &&
          (!query || f.name.toLowerCase().includes(query)) &&
          (!typeFilter || typeFilter(f.mimeType))
      ),
    [files, hidden, query, typeFilter]
  )
  const groups = useMemo(() => groupByDay(visible), [visible])
  const driveOf = useCallback((f: DriveFile) => drives.find((d) => d.id === f.driveAccountId), [drives])

  const toggle = (f: DriveFile) =>
    setSelected((prev) => {
      const next = new Set(prev)
      const k = fileKey(f)
      if (!next.delete(k)) next.add(k)
      return next
    })
  const toggleGroup = (keys: string[]) =>
    setSelected((prev) => {
      const next = new Set(prev)
      const all = keys.every((k) => next.has(k))
      keys.forEach((k) => (all ? next.delete(k) : next.add(k)))
      return next
    })
  const selecting = selected.size > 0
  const selectedFiles = visible.filter((f) => selected.has(fileKey(f)))
  const canDeleteSelected = selectedFiles.every((f) => !f.baseUrl)

  useEffect(() => {
    if (!selecting || viewerIndex >= 0) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(new Set())
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selecting, viewerIndex])

  const download = async (list: DriveFile[]) => {
    setBusy(true)
    for (const f of list) {
      const drive = driveOf(f)
      if (!drive) continue
      try {
        await localDriveApi.downloadFile(drive, f)
      } catch {
        alert(`Failed to download "${f.name}".`)
      }
    }
    setBusy(false)
  }

  const remove = async (list: DriveFile[]) => {
    setBusy(true)
    const ok = await onDelete(list)
    setBusy(false)
    if (!ok) return
    setSelected(new Set())
    // the viewer stays on the same index, which now shows the next photo
    if (viewerIndex >= 0) {
      const left = visible.length - list.length
      setViewerIndex(left <= 0 ? -1 : Math.min(viewerIndex, left - 1))
    }
  }

  const target = rowHeight(width)

  return (
    <div ref={rootRef}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">Photos uploaded with AllDrive, plus any you add from Google Photos.</p>
        {drives.length === 1 ? (
          <button type="button" disabled={picking} onClick={() => pick(drives[0])} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50">
            {picking ? 'Waiting for Google Photos…' : 'Add from Google Photos'}
          </button>
        ) : (
          drives.length > 1 && (
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50">
                {picking ? 'Waiting for Google Photos…' : 'Add from Google Photos ▾'}
              </summary>
              <ul className="absolute right-0 z-30 mt-1 min-w-full rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                {drives.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      disabled={picking}
                      onClick={(e) => {
                        e.currentTarget.closest('details')?.removeAttribute('open')
                        void pick(d)
                      }}
                      className="w-full whitespace-nowrap px-4 py-2 text-left text-sm text-gray-800 hover:bg-gray-100 disabled:opacity-50"
                      title={d.accountEmail}
                    >
                      {username(d.accountEmail)}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )
        )}
      </div>
      {loading && !files.length && (
        <div className="flex animate-pulse flex-wrap gap-1">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="h-44 flex-auto bg-gray-200" style={{ flexBasis: 180 }} />
          ))}
        </div>
      )}

      {selecting && (
        <div className="sticky top-0 z-20 mb-4 flex items-center gap-2 rounded-2xl bg-blue-600 px-3 py-2 text-white shadow-lg">
          <button type="button" onClick={() => setSelected(new Set())} className="rounded-full p-2 hover:bg-white/15" aria-label="Clear selection" title="Clear selection (Esc)">
            <Icon path={ICONS.close} />
          </button>
          <span className="flex-1 font-medium">{selected.size} selected</span>
          <button type="button" disabled={busy} onClick={() => download(selectedFiles)} className="rounded-full p-2 hover:bg-white/15 disabled:opacity-50" aria-label="Download selected" title="Download">
            <Icon path={ICONS.download} />
          </button>
          {canDeleteSelected && (
            <button type="button" disabled={busy} onClick={() => remove(selectedFiles)} className="rounded-full p-2 hover:bg-white/15 disabled:opacity-50" aria-label="Move selected to trash" title="Move to trash">
              <Icon path={ICONS.trash} />
            </button>
          )}
        </div>
      )}

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {needsAccess.length > 0 && (
        <div role="alert" className="mb-4 space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 sm:p-4">
          {needsAccess.map((d) => (
            <div key={d.id} className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <p className="text-sm text-amber-800">
                <span className="font-semibold" title={d.accountEmail}>{username(d.accountEmail)}</span> hasn’t allowed
                Google Photos access. Reconnect and tick the Google Photos permissions.
              </p>
              <button
                onClick={() => localDriveApi.startGoogleConnect(d.accountEmail, true)}
                className="shrink-0 rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-700"
              >
                Reconnect
              </button>
            </div>
          ))}
        </div>
      )}

      {width > 0 &&
        groups.map((g, groupIndex) => {
          const keys = g.items.map((i) => fileKey(i.file))
          const allSelected = keys.every((k) => selected.has(k))
          const canSelectGroup = keys.length > 1
          const ratios = g.items.map((i) => aspectRatio(i.file))
          return (
            <section key={keys[0]} className="group/day mb-6">
              {g.monthLabel && (groupIndex === 0 || groups[groupIndex - 1].monthKey !== g.monthKey) && (
                // mt on the heading would be cancelled by `first:` (it's always first in its section)
                <h2 className={`mb-3 text-2xl font-semibold text-gray-900 ${groupIndex ? 'mt-10' : ''}`}>{g.monthLabel}</h2>
              )}
              <div className="group/date relative mb-2 flex items-center">
                {canSelectGroup && (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={allSelected}
                    aria-label={`Select all from ${g.label}`}
                    onClick={() => toggleGroup(keys)}
                    className={`absolute left-0 flex h-5 w-5 items-center justify-center border-2 rounded-full transition-[opacity,transform] duration-200 ${
                      allSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-400 text-transparent'
                    } ${selecting ? 'translate-x-0' : '-translate-x-1 opacity-0 group-hover/day:translate-x-0 group-hover/day:opacity-100 focus-visible:translate-x-0 focus-visible:opacity-100'}`}
                  >
                    <Icon path={ICONS.check} className="h-3.5 w-3.5" />
                  </button>
                )}
                <h3 className={`text-sm font-medium text-gray-800 ${canSelectGroup ? 'transition-transform duration-200' : ''} ${
                  canSelectGroup && (selecting ? 'translate-x-7' : 'group-hover/day:translate-x-7 focus-within:translate-x-7')
                }`}>
                  {g.label}
                </h3>
              </div>

              <div className="flex flex-col" style={{ gap: GAP }}>
                {justify(ratios, width, target, GAP).map((row) => (
                  <div key={row.start} className="flex" style={{ gap: GAP, height: row.height }}>
                    {g.items.slice(row.start, row.end).map(({ file, index }, i) => {
                      const k = keys[row.start + i]
                      const isSel = selected.has(k)
                      return (
                        <div
                          key={k}
                          className={`group relative shrink-0 overflow-hidden ${isSel ? 'bg-blue-100' : 'bg-gray-200'}`}
                          style={{ width: ratios[row.start + i] * row.height }}
                        >
                          <button
                            type="button"
                            onClick={() => (selecting ? toggle(file) : setViewerIndex(index))}
                            // ponytail: one cache-warm request per hovered photo; cheap thumbnail-CDN hits, no throttling.
                            onPointerEnter={() => !selecting && preloadFull(file, driveOf(file))}
                            onFocus={() => !selecting && preloadFull(file, driveOf(file))}
                            className="absolute inset-0 h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600"
                            aria-label={`${selecting ? 'Select' : 'Open'} ${file.name}`}
                          >
                            {file.thumbnailLink || file.baseUrl ? (
                              <MediaImg
                                authDrive={file.photosAuth ? driveOf(file) : undefined}
                                lazy
                                src={
                                  file.baseUrl
                                    ? googlePhotos.sizedBaseUrl(file.baseUrl, 'h440')
                                    : localDriveApi.sizedThumbnail(file.thumbnailLink!, 'h440')
                                }
                                alt=""
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                draggable={false}
                                className={`h-full w-full object-cover transition-transform duration-150 ${isSel ? 'scale-[0.86] rounded-lg' : ''}`}
                              />
                            ) : (
                              <span className="flex h-full items-center justify-center text-3xl">{isVideo(file) ? '🎬' : '🖼️'}</span>
                            )}
                            {!isSel && (
                              <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                            )}
                          </button>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={isSel}
                            aria-label={`Select ${file.name}`}
                            onClick={() => toggle(file)}
                            className={`absolute left-2 top-2 transition-opacity ${
                              isSel || selecting ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                            }`}
                          >
                            <CheckCircle checked={isSel} className="h-5 w-5" />
                          </button>
                          {isVideo(file) && (
                            <span className="pointer-events-none absolute right-2 top-2 flex items-center text-xs font-medium leading-none tabular-nums text-white drop-shadow">
                              <VideoDuration file={file} />
                              {/* The play path is already offset right in its 24px box; no extra nudge needed. */}
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-white">
                                <Icon path={ICONS.play} className="h-3.5 w-3.5" />
                              </span>
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </section>
          )
        })}

      {!loading && !visible.length && (
        <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
          <p className="mb-3 text-5xl">🖼️</p>
          <h3 className="text-lg font-semibold text-gray-900">No Google Photos yet</h3>
          <p className="max-w-md text-gray-500">
            Upload photos with AllDrive, or use “Add from Google Photos” to choose existing ones. Google doesn’t let apps read the whole library.
          </p>
        </div>
      )}

      {viewerIndex >= 0 && (
        <PhotoViewer
          files={visible}
          index={Math.min(viewerIndex, visible.length - 1)}
          onIndex={setViewerIndex}
          onClose={() => setViewerIndex(-1)}
          hasMore={false}
          loadMore={noop}
          driveOf={driveOf}
          onDownload={(f) => void download([f])}
          onDelete={(f) => void remove([f])}
        />
      )}
    </div>
  )
}

export default PhotosView
