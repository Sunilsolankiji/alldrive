import { useEffect, useRef } from 'react'

/**
 * Calls `onVisible` when scrolled near the end. The observer re-arms on every render
 * (a new `onVisible` each time), so it fires again after each page if still in view.
 */
const LoadMoreSentinel = ({ onVisible }: { onVisible: () => void }) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && onVisible(), {
      rootMargin: '800px',
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [onVisible])

  return (
    <div ref={ref} className="flex justify-center py-8 text-sm text-gray-400">
      Loading more…
    </div>
  )
}

export default LoadMoreSentinel
