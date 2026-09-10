const LABEL: Record<string, string> = {
  imported: 'นำเข้าแล้ว',
  packed: 'แพ็คเสร็จ',
  at_pier: 'ถึงท่าเรือ',
  shipped: 'ส่งแล้ว',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded-full border px-2 py-0.5 text-xs">{LABEL[status] ?? status}</span>
  )
}
