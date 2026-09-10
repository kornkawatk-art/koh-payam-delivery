import { Button } from './Button'

type Props = {
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 whitespace-pre-line text-sm text-gray-700">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded border px-3 py-2 text-sm" onClick={onCancel}>
            ยกเลิก
          </button>
          <Button className="text-sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
