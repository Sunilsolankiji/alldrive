import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  title: string
  message: ReactNode
  confirmLabel: string
  /** Red confirm button for destructive actions. */
  danger?: boolean
  onResult: (confirmed: boolean) => void
}

/** Modal confirmation on top of everything (native <dialog> top layer, so it covers the photo viewer too). */
const ConfirmDialog = ({ title, message, confirmLabel, danger, onResult }: Props) => {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal()
    // Keep page shortcuts (viewer arrows/Esc/Delete) from firing underneath; default actions still work.
    const stop = (e: KeyboardEvent) => e.stopImmediatePropagation()
    window.addEventListener('keydown', stop, true)
    return () => window.removeEventListener('keydown', stop, true)
  }, [])

  return (
    <dialog
      ref={ref}
      onClose={() => onResult(ref.current?.returnValue === 'confirm')}
      onClick={(e) => e.target === ref.current && ref.current.close('cancel')}
      aria-labelledby="confirm-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-6 text-gray-800 shadow-xl [color-scheme:light] backdrop:bg-black/60"
    >
      <form method="dialog">
        <h2 id="confirm-title" className="mb-3 text-xl font-semibold text-gray-900">{title}</h2>
        <div className="mb-6 text-base leading-relaxed text-gray-700 [overflow-wrap:anywhere]">{message}</div>
        <div className="flex justify-end gap-2">
          <button value="cancel" autoFocus className="rounded-full px-5 py-2 text-sm font-medium text-blue-700 outline-none hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500">
            Cancel
          </button>
          <button
            value="confirm"
            className={`rounded-full px-5 py-2 text-sm font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${danger ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500' : 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default ConfirmDialog
