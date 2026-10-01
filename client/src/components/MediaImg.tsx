import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { authedBlobUrl } from '../api/googlePhotos'
import type { LocalDriveAccount } from '../types'

type Props = ComponentProps<'img'> & {
  /** When set, `src` is a Google Photos URL fetched with this account's token (an <img> can't send headers). */
  authDrive?: LocalDriveAccount
  /** Wait until near the viewport before fetching (the authed path can't use loading="lazy"). */
  lazy?: boolean
}

/** <img> that also works for Google Photos URLs, which need the Authorization header. */
const MediaImg = ({ src, authDrive, lazy, ref, ...rest }: Props) => {
  const [blob, setBlob] = useState<{ src: string; url: string } | null>(null)
  const [near, setNear] = useState(!lazy)
  const elRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!authDrive || near || !elRef.current) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '800px' })
    io.observe(elRef.current)
    return () => io.disconnect()
  }, [authDrive, near])

  useEffect(() => {
    if (!authDrive || !src || !near) return
    let live = true
    authedBlobUrl(src, authDrive)
      .catch(() => src) // header refused (CORS): try the URL as a normal image
      .then((url) => live && setBlob({ src, url }))
    return () => {
      live = false
    }
  }, [src, authDrive, near])

  if (!authDrive) return <img src={src} ref={ref} {...rest} />
  if (!blob || blob.src !== src) return <span ref={elRef} aria-hidden="true" className="absolute inset-0" />
  return <img src={blob.url} ref={ref} {...rest} />
}

export default MediaImg
