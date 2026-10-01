/**
 * Several drives are paged independently, so a drive that still has pages may hold items
 * that sort before anything past its last loaded item. Only return items up to the
 * earliest such frontier so later pages never insert above what's already shown.
 */
export const visibleUpToFrontier = <T>(
  all: T[],
  frontiers: (T | undefined)[],
  compare: (a: T, b: T) => number
): T[] => {
  const cutoff = frontiers.reduce<T | undefined>(
    (min, last) => (last !== undefined && (min === undefined || compare(last, min) < 0) ? last : min),
    undefined
  )
  return cutoff === undefined ? all : all.filter((f) => compare(f, cutoff) <= 0)
}
