import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Boat, CheckCircle, Warning } from '@phosphor-icons/react'
import { t, type Lang } from './i18n'
import OrderStatusTimeline from '../../components/OrderStatusTimeline'
import CustomerClaimForm from './CustomerClaimForm'
import { ZoomableImage } from '../../components/ui/ZoomableImage'
import { StatTile, InfoItem } from '../../components/ui/Stat'
import { AmountDue } from '../../components/ui/AmountDue'
import { formatDate, formatDateTime } from '../../lib/format'

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
  items: { productName: string | null; itemId?: string | null; qty: number }[]
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-ink to-brand-ink text-xs font-semibold text-white">
              KP
            </span>
            <span className="text-sm font-semibold text-ink">
              {lang === 'th' ? 'เกาะพยาม' : 'Koh Payam'}
            </span>
          </div>
          {toggle}
        </div>
        {inner}
      </div>
    </div>
  )

  if (err)
    return shell(<p className="card text-sm text-ink-soft">{t(lang, err)}</p>)

  if (!data)
    return shell(
      <div className="card flex flex-col gap-4" role="status">
        <span className="sr-only">{t(lang, 'loading')}</span>
        <span className="block h-7 w-2/3 animate-pulse rounded-md bg-line/80" aria-hidden="true" />
        <span className="block h-4 w-1/2 animate-pulse rounded-md bg-line/80" aria-hidden="true" />
        <span className="block h-24 animate-pulse rounded-lg bg-line/60" aria-hidden="true" />
        <span className="block h-4 w-3/4 animate-pulse rounded-md bg-line/80" aria-hidden="true" />
        <span className="block h-4 w-2/5 animate-pulse rounded-md bg-line/80" aria-hidden="true" />
      </div>,
    )

  const showClaimClosed =
    !data.canClaim && data.status === 'shipped' && data.claimDeadlineAt != null

  return shell(
    <div className="card flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {t(lang, 'title')} · {data.orderNo}
        </h1>
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-paper px-3 py-2.5 text-sm">
          <div className="min-w-0">
            <dt className="text-xs text-ink-faint">{t(lang, 'customer')}</dt>
            <dd className="truncate font-medium text-ink">{data.customerNameEn}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">{t(lang, 'ship_date')}</dt>
            <dd className="font-medium text-ink">{formatDate(data.shipDate, lang)}</dd>
          </div>
        </dl>
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

      <section className="flex flex-col gap-3" aria-label={t(lang, 'boxes')}>
        {data.outstandingAmount != null && data.outstandingAmount > 0 && (
          <AmountDue
            tone="brand"
            label={t(lang, 'outstanding_amount_label')}
            amount={data.outstandingAmount}
          />
        )}
        <h2 className="section-title">{t(lang, 'boxes')}</h2>
        <dl className="grid grid-cols-3 gap-2">
          <StatTile label={t(lang, 'paper')} value={data.paperBoxCount} />
          <StatTile label={t(lang, 'foam')} value={data.foamBoxCount} />
          <StatTile label={t(lang, 'pieces')} value={data.pieceCount} />
        </dl>
        {data.boatName && (
          <dl>
            <InfoItem icon={Boat} label={t(lang, 'boat')} value={data.boatName} />
          </dl>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="section-title">{t(lang, 'items')}</h2>
        <div className="table-wrap table-flat">
          <table className="data-table stack-table">
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
                  <td data-label={t(lang, 'col_item_id')} className="tnum">
                    {it.itemId}
                  </td>
                  <td className="stack-lead">
                    {it.productName}
                    {it.isShort && (
                      <span className="badge badge-warn ml-1.5">{t(lang, 'badge_short')}</span>
                    )}
                  </td>
                  <td data-label={t(lang, 'col_ordered')} className="tnum">
                    {it.orderedQty}
                  </td>
                  <td data-label={t(lang, 'col_shipped')} className="tnum">
                    {it.shippedQty}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">{t(lang, 'shortages_heading')}</h2>
          {data.shortages.length === 0 ? (
            <span className="badge badge-ok">
              <CheckCircle size={12} weight="fill" aria-hidden="true" />
              {t(lang, 'none')}
            </span>
          ) : (
            <span className="badge badge-warn tnum">{data.shortages.length}</span>
          )}
        </div>
        {data.shortages.length > 0 && (
          <div className="rounded-xl bg-warn-soft px-3 py-2 ring-1 ring-warn/25">
            <p className="flex items-center gap-1.5 py-1 text-xs font-medium text-warn-ink">
              <Warning size={14} weight="fill" aria-hidden="true" />
              {t(lang, 'shortages_note')}
            </p>
            <ul className="divide-y divide-warn/15">
              {data.shortages.map((s, i) => (
                <li
                  key={`${s.productName}-${i}`}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="min-w-0 font-medium text-ink">{s.productName}</span>
                  <span className="tnum shrink-0 text-xs font-semibold text-warn-ink">
                    {t(lang, 'shipped_of_ordered', {
                      shipped: s.shippedQty,
                      ordered: s.orderedQty,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {data.evidencePhotos.length > 0 && (
        <section className="flex flex-col gap-2 text-sm">
          <h2 className="section-title">{t(lang, 'evidence')}</h2>
          <div className="flex flex-wrap gap-2">
            {data.evidencePhotos.map((src) => (
              <ZoomableImage key={src} src={src} alt={t(lang, 'evidence')} />
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
                        {it.itemId ? `${it.itemId} · ` : ''}
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
