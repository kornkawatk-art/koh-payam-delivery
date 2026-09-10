import { useState } from 'react'
import { t, type Lang } from './i18n'
import PhotoCapture from '../../components/PhotoCapture'

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-claim`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const CLAIM_TYPES = ['missing_in_box', 'damaged', 'box_lost'] as const
type ClaimType = (typeof CLAIM_TYPES)[number]

type Props = {
  token: string
  items: { productName: string; qtyOrdered: number }[]
  lang: Lang
  onDone: () => void
}

/**
 * Customer claim submission, opened by `CustomerOrderView` while the order is
 * inside its 48h claim window. Photos go straight to R2 via `PhotoCapture`
 * (scope="claim"); the form POSTs the collected keys to the `submit-claim`
 * edge function, which does its own token + window auth.
 */
export default function CustomerClaimForm({ token, items, lang, onDone }: Props) {
  const [type, setType] = useState<ClaimType>('missing_in_box')
  const [itemIndex, setItemIndex] = useState(0)
  const [qty, setQty] = useState(1)
  const [description, setDescription] = useState('')
  const [keys, setKeys] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  const needsItem = type !== 'box_lost'

  async function submit() {
    setBusy(true)
    setErr(false)
    try {
      const res = await fetch(FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({
          token,
          type,
          orderItemIndex: needsItem ? itemIndex : null,
          qty,
          description,
          photoKeys: keys,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error('submit failed')
      onDone()
    } catch {
      setErr(true)
      setBusy(false)
    }
  }

  return (
    <form
      className="mt-4 flex flex-col gap-3 rounded border p-3"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-semibold">{t(lang, 'claim_form_type')}</legend>
        {CLAIM_TYPES.map((ct) => (
          <label key={ct} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="claim_type"
              value={ct}
              checked={type === ct}
              onChange={() => setType(ct)}
            />
            {t(lang, `claim_type_${ct}`)}
          </label>
        ))}
      </fieldset>

      {needsItem && (
        <label className="flex flex-col gap-1 text-sm">
          {t(lang, 'claim_form_item')}
          <select
            value={itemIndex}
            onChange={(e) => setItemIndex(Number(e.target.value))}
            className="rounded border p-1"
          >
            {items.map((it, i) => (
              <option key={`${it.productName}-${i}`} value={i}>
                {it.productName}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm">
        {t(lang, 'claim_form_qty')}
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
          className="w-24 rounded border p-1"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t(lang, 'claim_form_description')}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="rounded border p-1"
        />
      </label>

      <div className="text-sm">
        <p className="mb-1 font-medium">{t(lang, 'claim_form_photos')}</p>
        <PhotoCapture
          scope="claim"
          token={token}
          max={3}
          onUploaded={(k) => setKeys((ks) => [...ks, k])}
        />
      </div>

      {err && <p className="text-sm text-red-600">{t(lang, 'claim_form_error')}</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
      >
        {busy ? t(lang, 'claim_form_submitting') : t(lang, 'claim_form_submit')}
      </button>
    </form>
  )
}
