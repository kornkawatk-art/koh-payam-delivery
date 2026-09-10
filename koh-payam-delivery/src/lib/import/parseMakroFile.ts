import * as XLSX from 'xlsx'

export type RawRow = Record<string, string>

export async function parseMakroFile(input: File | ArrayBuffer): Promise<RawRow[]> {
  const buf = input instanceof File ? await input.arrayBuffer() : input
  const wb = XLSX.read(buf, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
  return json.map((r) => {
    const out: RawRow = {}
    for (const [k, v] of Object.entries(r)) out[String(k).trim()] = String(v ?? '').trim()
    return out
  })
}
