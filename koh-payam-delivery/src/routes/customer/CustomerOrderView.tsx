import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { t, type Lang } from './i18n'
import OrderStatusTimeline from '../../components/OrderStatusTimeline'
import CustomerClaimForm from './CustomerClaimForm'
import { formatDate, formatDateTime } from '../../lib/format'

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/order-view`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

type Item = { productName: string; orderedQty: number; shippedQty: number; isShort: boolean }
type Claim = {
  id: string
  type: string
  qty: number
  description: string
  status: string
  resolution: string | null
  createdAt: string
}
type OrderView = {
  orderNo: string
  customerNameEn: string
  shipDate: string
  status: string
  boatName: string | null
  paperBoxCount: number
  foamBoxCount: number
  items: Item[]
  shortages: { productName: string; orderedQty: number; shippedQty: number }[]
  evidencePhotos: string[]
  claimDeadlineAt: string | null
  canClaim: boolean
  claims: Claim[]
}

function readLang(): Lang {
  try {
    return (localStorage.getItem('cust_lang') as Lang) || 'en'
  } catch {
    return 'en'
  }
}

export default function CustomerOrderView() {
  const { token } = useParams()
  const [lang, setLang] = useState<Lang>(readLang)
  const [data, setData] = useState<OrderView | null>(null)
  const [err, setErr] = useState<'not_found' | 'error' | null>(null)
  const [claiming, setClaiming] = useState(false)

  const load = useCallback(() => {
    setErr(null)
    setData(null)
    fetch(`${FN}?token=${encodeURIComponent(token ?? '')}`, {
      headers: { Authorization: `Bearer ${ANON}` },
    })
      .then((res) => {
        if (!res.ok) {
          setErr(res.status === 404 ? 'not_found' : 'error')
          return null
        }
        return res.json() as Promise<OrderView>
      })
      .then((json) => {
        if (json) setData(json)
      })
      .catch(() => setErr('error'))
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  function switchLang(l: Lang) {
    setLang(l)
    try {
      localStorage.setItem('cust_lang', l)
    } catch {
      /* ignore */
    }
  }

  const toggle = (
    <div className="mb-3 flex justify-end gap-3 text-sm">
      <button
        onClick={() => switchLang('en')}
        className={lang === 'en' ? 'font-bold underline' : 'text-gray-500'}
      >
        EN
      </button>
      <button
        onClick={() => switchLang('th')}
        className={lang === 'th' ? 'font-bold underline' : 'text-gray-500'}
      >
        ไทย
      </button>
    </div>
  )

  if (err)
    return (
      <div className="mx-auto max-w-lg p-4">
        {toggle}
        <p className="rounded border p-4 text-sm text-gray-700">{t(lang, err)}</p>
      </div>
    )

  if (!data)
    return (
      <div className="mx-auto max-w-lg p-4">
        {toggle}
        <p className="p-2 text-sm text-gray-500">{t(lang, 'loading')}</p>
      </div>
    )

  const showClaimClosed =
    !data.canClaim && data.status === 'shipped' && data.claimDeadlineAt != null

  return (
    <div className="mx-auto max-w-lg p-4">
      {toggle}

      <h1 className="text-xl font-semibold">
        {t(lang, 'title')} · {data.orderNo}
      </h1>
      <p className="text-sm text-gray-600">
        {t(lang, 'customer')}: {data.customerNameEn}
      </p>
      <p className="text-sm text-gray-600">
        {t(lang, 'ship_date')}: {formatDate(data.shipDate, lang)}
      </p>

      <OrderStatusTimeline status={data.status} lang={lang} />

      <section className="mt-4">
        <h2 className="text-sm font-semibold">{t(lang, 'items')}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="font-medium">{t(lang, 'col_item')}</th>
              <th className="font-medium">{t(lang, 'col_ordered')}</th>
              <th className="font-medium">{t(lang, 'col_shipped')}</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((it, i) => (
              <tr
                key={`${it.productName}-${i}`}
                className={'border-t ' + (it.isShort ? 'bg-amber-50' : '')}
              >
                <td className="py-0.5">
                  {it.productName}
                  {it.isShort && (
                    <span className="ml-1 rounded bg-amber-200 px-1 text-xs text-amber-900">
                      {t(lang, 'badge_short')}
                    </span>
                  )}
                </td>
                <td className="py-0.5">{it.orderedQty}</td>
                <td className="py-0.5">{it.shippedQty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-4 text-sm">
        <h2 className="font-semibold">{t(lang, 'shortages_heading')}</h2>
        {data.shortages.length === 0 ? (
          <p className="text-gray-500">{t(lang, 'none')}</p>
        ) : (
          <>
            <p className="text-gray-500">{t(lang, 'shortages_note')}</p>
            <ul className="list-inside list-disc">
              {data.shortages.map((s, i) => (
                <li key={`${s.productName}-${i}`}>
                  {s.productName} —{' '}
                  {t(lang, 'shipped_of_ordered', {
                    shipped: s.shippedQty,
                    ordered: s.orderedQty,
                  })}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="mt-4 text-sm text-gray-700">
        <p>
          {t(lang, 'boxes')}: {t(lang, 'paper')} {data.paperBoxCount} · {t(lang, 'foam')}{' '}
          {data.foamBoxCount}
        </p>
        {data.boatName && (
          <p>
            {t(lang, 'boat')}: {data.boatName}
          </p>
        )}
      </section>

      {data.evidencePhotos.length > 0 && (
        <section className="mt-4 text-sm">
          <h2 className="font-semibold">{t(lang, 'evidence')}</h2>
          <div className="flex flex-wrap gap-2">
            {data.evidencePhotos.map((src) => (
              <img
                key={src}
                src={src}
                alt={t(lang, 'evidence')}
                className="h-24 w-24 rounded border object-cover"
              />
            ))}
          </div>
        </section>
      )}

      {data.claims.length > 0 && (
        <section className="mt-4 text-sm">
          <h2 className="font-semibold">{t(lang, 'claims')}</h2>
          <ul className="flex flex-col gap-1">
            {data.claims.map((c) => (
              <li key={c.id} className="rounded border p-2">
                {t(lang, `claim_type_${c.type}`)} × {c.qty} · {t(lang, `claim_status_${c.status}`)}
                {c.resolution ? ` · ${t(lang, `claim_resolution_${c.resolution}`)}` : ''}
                <span className="block text-gray-500">{formatDateTime(c.createdAt, lang)}</span>
                {c.description && <span className="block">{c.description}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.canClaim && !claiming && (
        <button
          className="mt-4 rounded bg-black px-3 py-2 text-sm text-white"
          onClick={() => setClaiming(true)}
        >
          {t(lang, 'report_problem')}
        </button>
      )}

      {data.canClaim && !claiming && data.claimDeadlineAt && (
        <p className="mt-2 text-xs text-gray-500">
          {t(lang, 'claim_deadline')} {formatDateTime(data.claimDeadlineAt, lang)}
        </p>
      )}

      {showClaimClosed && (
        <p className="mt-4 text-sm text-gray-500">{t(lang, 'claim_closed')}</p>
      )}

      {claiming && (
        <CustomerClaimForm
          token={token!}
          items={data.items}
          lang={lang}
          onDone={() => {
            setClaiming(false)
            load()
          }}
        />
      )}
    </div>
  )
}
