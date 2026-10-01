import { useEffect, useRef, useState } from 'react'
import * as googlePhotos from '../api/googlePhotos'
import { fileKey } from '../hooks/usePagedDriveFiles'
import type { DriveFile } from '../types'
import { formatDuration } from '../utils/photoLayout'

// Google Photos APIs don't report video length, so it's read from the file's own metadata.
const probed = new Map<string, Promise<number>>()
const queue: (() => void)[] = []
let active = 0
// ponytail: 3 parallel metadata probes, never cancelled once started; fine for a scrolling grid.
const MAX_ACTIVE = 3

const next = () => {
  while (active < MAX_ACTIVE && queue.length) queue.shift()!()
}

const probe = (src: string) =>
  new Promise<number>((resolve, reject) => {
    queue.push(() => {
      active++
      const v = document.createElement('video')
      const done = (ms?: number) => {
        clearTimeout(timer)
        v.removeAttribute('src')
        v.load() // abort the download once the header is read
        active--
        next()
        if (ms) resolve(ms)
        else reject(new Error('no duration'))
      }
      const timer = setTimeout(() => done(), 20_000)
      v.preload = 'metadata'
      v.muted = true
      v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration * 1000 : undefined)
      v.onerror = () => done()
      v.src = src
    })
    next()
  })

const durationOf = (file: DriveFile) => {
  const k = fileKey(file)
  if (!probed.has(k)) {
    const p = probe(googlePhotos.originalUrl(file))
    p.catch(() => {}) // remembered as unknown; no retry storm while scrolling
    probed.set(k, p)
  }
  return probed.get(k)!
}

/** Video length, e.g. "1:23". Uses Drive metadata when present, otherwise probes Photos videos once visible. */
const VideoDuration = ({ file }: { file: DriveFile }) => {
  const known = Number(file.videoMediaMetadata?.durationMillis) || 0
  // Picker URLs need an auth header, which a <video> element can't send.
  const canProbe = !known && !!file.baseUrl && !file.photosAuth
  const [ms, setMs] = useState(known)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!canProbe || !ref.current) return
    let live = true
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      io.disconnect()
      durationOf(file).then((d) => live && setMs(d), () => {})
    })
    io.observe(ref.current)
    return () => {
      live = false
      io.disconnect()
    }
  }, [canProbe, file])

  const text = formatDuration(known || ms)
  // Spacing lives here, so an unknown length doesn't leave a gap beside the play icon.
  return <span ref={ref} className={text ? 'mr-1' : undefined}>{text}</span>
}

export default VideoDuration
