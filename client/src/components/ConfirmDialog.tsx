import { useEffect, useRef } from 'react'

interface Props {
  title: string
  message: string
  confirmLabel: string
  onResult: (confirmed: boolean) => void
}

/** Modal confirmation on top of everything (native <dialog> top layer, so it covers the photo viewer too). */
const ConfirmDialog = ({ title, message, confirmLabel, onResult }: Props) => {
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
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-white p-6 text-gray-800 shadow-xl backdrop:bg-black/50"
    >
      <form method="dialog">
        <h2 id="confirm-title" className="mb-2 text-lg font-medium text-gray-900">{title}</h2>
        <p className="mb-6 text-sm text-gray-600">{message}</p>
        <div className="flex justify-end gap-2">
          <button value="cancel" autoFocus className="rounded-full px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50">
            Cancel
          </button>
          <button value="confirm" className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default ConfirmDialog
