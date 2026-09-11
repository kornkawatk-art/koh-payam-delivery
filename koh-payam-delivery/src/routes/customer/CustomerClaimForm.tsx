import { useState } from 'react'
import { t, type Lang } from './i18n'
import PhotoCapture from '../../components/PhotoCapture'

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-claim`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const CLAIM_TYPES = ['missing_in_box', 'damaged', 'box_lost'] as const
type ClaimType = (typeof CLAIM_TYPES)[number]

type Props = {
  token: string
  items: { productName: string }[]
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
  const [photoBusy, setPhotoBusy] = useState(false)
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
      className="flex flex-col gap-4 rounded-lg border border-line bg-paper p-4"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="section-title">{t(lang, 'claim_form_type')}</legend>
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
        <label className="field text-sm">
          <span className="field-label">{t(lang, 'claim_form_item')}</span>
          <select value={itemIndex} onChange={(e) => setItemIndex(Number(e.target.value))}>
            {items.map((it, i) => (
              <option key={`${it.productName}-${i}`} value={i}>
                {it.productName}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="field text-sm">
        <span className="field-label">{t(lang, 'claim_form_qty')}</span>
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
          className="w-28"
        />
      </label>

      <label className="field text-sm">
        <span className="field-label">{t(lang, 'claim_form_description')}</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </label>

      <div className="text-sm">
        <p className="field-label mb-1.5">{t(lang, 'claim_form_photos')}</p>
        <PhotoCapture
          scope="claim"
          token={token}
          max={3}
          onBusyChange={setPhotoBusy}
          onUploaded={(k) => setKeys((ks) => [...ks, k])}
        />
      </div>

      {err && <p className="alert alert-danger">{t(lang, 'claim_form_error')}</p>}

      {photoBusy && <p className="muted text-xs">{t(lang, 'claim_form_photo_uploading')}</p>}

      <button type="submit" disabled={busy || photoBusy} className="btn btn-primary w-full">
        {busy ? t(lang, 'claim_form_submitting') : t(lang, 'claim_form_submit')}
      </button>
    </form>
  )
}
