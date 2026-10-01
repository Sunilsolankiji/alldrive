/** Minimal shape the summary needs; matches UploadItem. */
export interface UploadLike {
  status: 'pending' | 'uploading' | 'done' | 'failed' | 'canceled'
  /** Percentage of this file transferred, 0-100. */
  pct: number
}

/** Counts and overall percentage for a list of uploads. */
export const uploadSummary = (items: UploadLike[]) => {
  const count = (s: UploadLike['status']) => items.filter((i) => i.status === s).length
  const active = count('pending') + count('uploading')
  const done = count('done')
  const failed = count('failed')
  const canceled = count('canceled')
  // Settled files occupy a whole slot; the in-flight one counts as a fraction so the bar never jumps backwards.
  const settled = done + failed + canceled
  const transferred = items.reduce(
    (sum, i) => sum + (i.status === 'pending' || i.status === 'uploading' ? i.pct / 100 : 1),
    0
  )
  const finishedLabel = [
    done ? `Uploaded ${done} item${done === 1 ? '' : 's'}` : '',
    failed ? `${failed} failed` : '',
    canceled ? `${canceled} canceled` : '',
  ].filter(Boolean)
  return {
    total: items.length,
    active,
    done,
    failed,
    canceled,
    busy: active > 0,
    percent: items.length ? Math.round((transferred / items.length) * 100) : 100,
    label: active
      ? `Uploading ${Math.min(settled + 1, items.length)} of ${items.length}`
      : finishedLabel.length
        ? finishedLabel.join(', ')
        : 'Uploaded 0 items',
  }
}
