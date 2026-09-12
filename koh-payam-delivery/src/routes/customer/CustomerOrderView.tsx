import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { t, type Lang } from './i18n'
import OrderStatusTimeline from '../../components/OrderStatusTimeline'
import CustomerClaimForm from './CustomerClaimForm'
import { formatDate, formatDateTime, formatTHB } from '../../lib/format'

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/order-view`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

type Item = {
  productName: string
  itemId: string | null
  orderedQty: number
  shippedQty: number
  isShort: boolean
}
type Claim = {
  id: string
  type: string
  items: { productName: string | null; qty: number }[]
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
  siblingOrders: { orderNo: string; status: string; token: string }[]
  paperBoxCount: number
  foamBoxCount: number
  pieceCount: number
  outstandingAmount: number | null
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
    <div className="flex justify-end">
      <div className="inline-flex overflow-hidden rounded-lg border border-line text-sm">
        <button
          onClick={() => switchLang('en')}
          className={
            'px-3 py-1.5 font-medium transition-colors ' +
            (lang === 'en' ? 'bg-ink text-white' : 'text-ink-soft hover:bg-paper')
          }
        >
          EN
        </button>
        <button
          onClick={() => switchLang('th')}
          className={
            'px-3 py-1.5 font-medium transition-colors ' +
            (lang === 'th' ? 'bg-ink text-white' : 'text-ink-soft hover:bg-paper')
          }
        >
          ไทย
        </button>
      </div>
    </div>
  )

  const shell = (inner: ReactNode) => (
    <div className="min-h-screen bg-paper px-4 py-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        {toggle}
        {inner}
      </div>
    </div>
  )

  if (err)
    return shell(<p className="card text-sm text-ink-soft">{t(lang, err)}</p>)

  if (!data)
    return shell(<p className="card text-sm text-ink-soft">{t(lang, 'loading')}</p>)

  const showClaimClosed =
    !data.canClaim && data.status === 'shipped' && data.claimDeadlineAt != null

  return shell(
    <div className="card flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="page-title">
          {t(lang, 'title')} · {data.orderNo}
        </h1>
        <p className="muted">
          {t(lang, 'customer')}: {data.customerNameEn}
        </p>
        <p className="muted">
          {t(lang, 'ship_date')}: {formatDate(data.shipDate, lang)}
        </p>
      </header>

      {data.siblingOrders.length > 0 && (
        <section className="flex flex-col gap-2 text-sm">
          <h2 className="section-title">
            {t(lang, 'related_orders_heading', { n: data.siblingOrders.length })}
          </h2>
          <ul className="flex flex-col gap-2">
            {data.siblingOrders.map((sib) => (
              <li
                key={sib.orderNo}
                className="flex items-center justify-between rounded-lg border border-line p-3"
              >
                <span>
                  {sib.orderNo} · {t(lang, `status_${sib.status}`)}
                </span>
                <Link className="link" to={`/o/${sib.token}`}>
                  {t(lang, 'view')}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <OrderStatusTimeline status={data.status} lang={lang} />

      <section className="flex flex-col gap-2">
        <h2 className="section-title">{t(lang, 'items')}</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t(lang, 'col_item_id')}</th>
                <th>{t(lang, 'col_item')}</th>
                <th>{t(lang, 'col_ordered')}</th>
                <th>{t(lang, 'col_shipped')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it, i) => (
                <tr key={`${it.productName}-${i}`} className={it.isShort ? 'bg-warn-soft' : ''}>
                  <td className="tnum">{it.itemId}</td>
                  <td>
                    {it.productName}
                    {it.isShort && (
                      <span className="badge badge-warn ml-1.5">{t(lang, 'badge_short')}</span>
                    )}
                  </td>
                  <td className="tnum">{it.orderedQty}</td>
                  <td className="tnum">{it.shippedQty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-1.5 text-sm">
        <h2 className="section-title">{t(lang, 'shortages_heading')}</h2>
        {data.shortages.length === 0 ? (
          <p className="muted">{t(lang, 'none')}</p>
        ) : (
          <>
            <p className="muted">{t(lang, 'shortages_note')}</p>
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

      <section className="flex flex-col gap-1 rounded-lg bg-paper p-3 text-sm text-ink-soft">
        <p>
          {t(lang, 'boxes')}: {t(lang, 'paper')} {data.paperBoxCount} · {t(lang, 'foam')}{' '}
          {data.foamBoxCount} · {t(lang, 'pieces')} {data.pieceCount}
        </p>
        {data.boatName && (
          <p>
            {t(lang, 'boat')}: {data.boatName}
          </p>
        )}
        {data.outstandingAmount != null && data.outstandingAmount > 0 && (
          <p>
            {t(lang, 'outstanding_amount_label')}: {formatTHB(data.outstandingAmount)}
          </p>
        )}
      </section>

      {data.evidencePhotos.length > 0 && (
        <section className="flex flex-col gap-2 text-sm">
          <h2 className="section-title">{t(lang, 'evidence')}</h2>
          <div className="flex flex-wrap gap-2">
            {data.evidencePhotos.map((src) => (
              <img
                key={src}
                src={src}
                alt={t(lang, 'evidence')}
                className="h-24 w-24 rounded-lg border border-line object-cover"
              />
            ))}
          </div>
        </section>
      )}

      {data.claims.length > 0 && (
        <section className="flex flex-col gap-2 text-sm">
          <h2 className="section-title">{t(lang, 'claims')}</h2>
          <ul className="flex flex-col gap-2">
            {data.claims.map((c) => (
              <li key={c.id} className="rounded-lg border border-line p-3">
                {t(lang, `claim_type_${c.type}`)} · {t(lang, `claim_status_${c.status}`)}
                {c.resolution ? ` · ${t(lang, `claim_resolution_${c.resolution}`)}` : ''}
                {c.items.length > 0 && (
                  <span className="mt-1 block">
                    {c.items.map((it, i) => (
                      <span key={i}>
                        {i > 0 ? ', ' : ''}
                        {it.productName} × {it.qty}
                      </span>
                    ))}
                  </span>
                )}
                <span className="mt-1 block text-ink-faint">
                  {formatDateTime(c.createdAt, lang)}
                </span>
                {c.description && <span className="block">{c.description}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.canClaim && !claiming && (
        <button className="btn btn-primary w-full" onClick={() => setClaiming(true)}>
          {t(lang, 'report_problem')}
        </button>
      )}

      {data.canClaim && !claiming && data.claimDeadlineAt && (
        <p className="text-xs text-ink-faint">
          {t(lang, 'claim_deadline')} {formatDateTime(data.claimDeadlineAt, lang)}
        </p>
      )}

      {showClaimClosed && <p className="muted">{t(lang, 'claim_closed')}</p>}

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
    </div>,
  )
}
