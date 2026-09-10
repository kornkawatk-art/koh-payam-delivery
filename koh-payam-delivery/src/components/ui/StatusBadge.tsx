const LABEL: Record<string, string> = {
  imported: 'นำเข้าแล้ว',
  packed: 'แพ็คเสร็จ',
  at_pier: 'ถึงท่าเรือ',
  shipped: 'ส่งแล้ว',
}

const TONE: Record<string, string> = {
  imported: 'badge-neutral',
  packed: 'badge-warn',
  at_pier: 'badge-brand',
  shipped: 'badge-ok',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${TONE[status] ?? 'badge-neutral'}`}>
      {LABEL[status] ?? status}
    </span>
  )
}
