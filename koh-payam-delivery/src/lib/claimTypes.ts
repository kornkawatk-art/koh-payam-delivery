/** Team-facing Thai names for claims.type (the customer page has its own i18n). */
export const CLAIM_TYPE_TH: Record<string, string> = {
  missing_in_box: 'ของขาดในกล่อง',
  damaged: 'สินค้าเสียหาย',
  broken_eggs: 'ไข่แตก',
  box_lost: 'กล่องสูญหาย',
}

export const claimTypeTH = (type: string) => CLAIM_TYPE_TH[type] ?? type
