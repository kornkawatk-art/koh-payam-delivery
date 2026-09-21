import { useState } from 'react'
import { t, type Lang } from './i18n'
import PhotoCapture from '../../components/PhotoCapture'

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-claim`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const CLAIM_TYPES = ['missing_in_box', 'damaged', 'box_lost'] as const
type ClaimType = (typeof CLAIM_TYPES)[number]

type Props = {
  token: string
  items: { productName: string; itemId?: string | null; shippedQty: number }[]
  lang: Lang
  onDone: () => void
}

// Mobile Safari/Chrome don't reliably apply a synchronous `.select()` called
// inside a focus handler for `type="number"` inputs — the native focus/
// keyboard-open sequence hasn't settled yet. Deferring one tick with
// `setTimeout(…, 0)` (rather than `requestAnimationFrame`) matches this
// component's other deferred-work precedent in the codebase (PhotoCapture's
// timeout handling also reaches for `setTimeout`), and is trivially
// testable with `vi.useFakeTimers()` the same way that file's tests already
// do — no jsdom RAF polyfill quirks to worry about.
function selectOnFocus(e: React.FocusEvent<HTMLInputElement>) {
  const el = e.target
  setTimeout(() => el.select(), 0)
}

/**
 * Customer claim submission, opened by `CustomerOrderView` while the order is
 * inside its 48h claim window. Photos go straight to R2 via `PhotoCapture`
 * (scope="claim"); the form POSTs the collected keys to the `submit-claim`
 * edge function, which does its own token + window auth.
 *
 * Item selection depends on the claim type:
 *  - box_lost references no item at all.
 *  - missing_in_box and damaged both reference one or more items — a
 *    checkbox per item, each with its own qty once checked, capped at that
 *    item's shippedQty (an item that shipped 0 units isn't offered at all —
 *    that's the existing shortage/backorder flow, a different concept).
 */
export default function CustomerClaimForm({ token, items, lang, onDone }: Props) {
  const [type, setType] = useState<ClaimType>('missing_in_box')
  const [checkedItems, setCheckedItems] = useState<Record<number, number>>({})
  const [description, setDescription] = useState('')
  const [keys, setKeys] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [err, setErr] = useState(false)

  const checkedCount = Object.keys(checkedItems).length
  const canSubmit = type === 'box_lost' || checkedCount > 0
  const showItemChecklist = type === 'missing_in_box' || type === 'damaged'
  const claimableItems = items
    .map((it, index) => ({ ...it, index }))
    .filter((it) => it.shippedQty > 0)

  function changeType(ct: ClaimType) {
    setType(ct)
    setCheckedItems({})
  }

  function toggleItem(idx: number, checked: boolean) {
    setCheckedItems((prev) => {
      const next = { ...prev }
      if (checked) next[idx] = next[idx] ?? 1
      else delete next[idx]
      return next
    })
  }

  function setItemQty(idx: number, q: number) {
    setCheckedItems((prev) => ({ ...prev, [idx]: q }))
  }

  async function submit() {
    setBusy(true)
    setErr(false)
    try {
      const claimItems =
        type === 'box_lost'
          ? []
          : Object.entries(checkedItems).map(([idx, q]) => ({
              orderItemIndex: Number(idx),
              qty: q,
            }))
      const res = await fetch(FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({
          token,
          type,
          items: claimItems,
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
              onChange={() => changeType(ct)}
            />
            {t(lang, `claim_type_${ct}`)}
          </label>
        ))}
      </fieldset>

      {showItemChecklist && (
        <fieldset className="flex flex-col gap-2">
          <legend className="section-title">
            {t(lang, type === 'damaged' ? 'claim_form_damaged_items' : 'claim_form_missing_items')}
          </legend>
          {claimableItems.map(({ productName, itemId, shippedQty, index }) => {
            const checked = index in checkedItems
            return (
              <div key={`${productName}-${index}`} className="flex items-center gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggleItem(index, e.target.checked)}
                  />
                  <span>
                    {itemId && <span className="tnum text-ink-soft">{itemId} · </span>}
                    {productName}
                  </span>
                </label>
                {checked && (
                  <input
                    type="number"
                    min={1}
                    max={shippedQty}
                    inputMode="numeric"
                    aria-label={`${t(lang, 'claim_form_qty')}: ${productName}`}
                    value={checkedItems[index]}
                    onChange={(e) =>
                      setItemQty(
                        index,
                        Math.min(
                          shippedQty,
                          Math.max(1, Math.floor(Number(e.target.value)) || 1),
                        ),
                      )
                    }
                    onFocus={selectOnFocus}
                    className="w-20"
                  />
                )}
              </div>
            )
          })}
        </fieldset>
      )}

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
          max={5}
          onBusyChange={setPhotoBusy}
          onUploaded={(k) => setKeys((ks) => [...ks, k])}
          onRemoved={(k) => setKeys((ks) => ks.filter((kk) => kk !== k))}
        />
      </div>

      {err && <p className="alert alert-danger">{t(lang, 'claim_form_error')}</p>}

      {photoBusy && <p className="muted text-xs">{t(lang, 'claim_form_photo_uploading')}</p>}

      <button
        type="submit"
        disabled={busy || photoBusy || !canSubmit}
        className="btn btn-primary w-full"
      >
        {busy ? t(lang, 'claim_form_submitting') : t(lang, 'claim_form_submit')}
      </button>
    </form>
  )
}
