/**
 * Makro "Dept" numbers -> the department groups the team reports shortages
 * to (one owner per group). Several numbers share a group (e.g. 7/8/9 are all
 * DF1). Order here is the fixed display order on the shortage report, so
 * each owner always finds their section in the same place.
 */
export const DEPT_GROUPS = [
  { code: 'FV', depts: ['1'] },
  { code: 'BUT', depts: ['2'] },
  { code: 'FS', depts: ['3'] },
  { code: 'BK', depts: ['4'] },
  { code: 'FZ', depts: ['5'] },
  { code: 'DF1', depts: ['7', '8', '9'] },
  { code: 'DF2', depts: ['6', '10'] },
  { code: 'NF', depts: ['34', '41', '45', '46'] },
] as const

export type DeptGroupCode = (typeof DEPT_GROUPS)[number]['code'] | 'UNKNOWN'

/** Label for the catch-all group: no Dept recorded, or a number not listed above. */
export const UNKNOWN_DEPT_LABEL = 'ไม่ทราบแผนก'

const BY_DEPT = new Map<string, DeptGroupCode>(
  DEPT_GROUPS.flatMap((g) => g.depts.map((d) => [d, g.code] as const)),
)

/** Group for a raw Dept value ('7', ' 07 ', null, ...). */
export function deptGroupOf(dept: string | null | undefined): DeptGroupCode {
  const n = Number((dept ?? '').trim())
  if (!Number.isInteger(n) || n <= 0) return 'UNKNOWN'
  return BY_DEPT.get(String(n)) ?? 'UNKNOWN'
}

export function deptGroupLabel(code: DeptGroupCode): string {
  return code === 'UNKNOWN' ? UNKNOWN_DEPT_LABEL : code
}

/**
 * One identity color per department, used wherever the shortage report shows
 * a department (chart bars, section headers, filter chips, product bars) --
 * the color follows the department, never its rank, so a filter never
 * repaints anything. Hues are the dataviz reference categorical palette,
 * mapped for easy recall (FV green, BUT red, FS blue, BK yellow, FZ aqua)
 * and validated in this order (light mode): lightness/chroma PASS, normal-
 * vision PASS; red/green sits in the CVD 6-8 band and yellow/aqua/magenta
 * are under 3:1 on white -- both legal only with a visible label beside
 * every colored mark, which the report always has. Never used as TEXT color.
 * Unknown is a neutral gray, not a ninth hue.
 */
export const DEPT_COLORS: Record<DeptGroupCode, string> = {
  FV: '#008300',
  BUT: '#e34948',
  FS: '#2a78d6',
  BK: '#eda100',
  FZ: '#1baf7a',
  DF1: '#eb6834',
  DF2: '#4a3aa7',
  NF: '#e87ba4',
  UNKNOWN: '#a8a29e',
}

/** Every group in display order, the unknown bucket last. */
export const DEPT_GROUP_ORDER: DeptGroupCode[] = [...DEPT_GROUPS.map((g) => g.code), 'UNKNOWN']
