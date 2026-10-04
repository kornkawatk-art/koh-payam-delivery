// Eggs ship by the tray or bundle but break by the egg, so a "ไข่แตก"
// (broken_eggs) claim counts eggs. Makro names say how many eggs one unit
// holds: "เอโร่ ไข่ไก่ เบอร์ 1 มีฝา 30 ฟอง" is one 30-egg tray, "... 30 ฟอง x 5"
// a bundle of 5 trays (150 eggs). Pure -- shared by the customer claim form
// (Vite) and the submit-claim edge function (Deno), so no imports here.

/** Eggs in ONE Makro unit of this product, or null when it isn't sold by the egg. */
export function eggsPerUnit(productName: string): number | null {
  const name = String(productName ?? '')
  const eggs = /(\d+)\s*ฟอง/.exec(name)
  if (!eggs) return null
  // A pack multiplier sits at the very end ("... 30 ฟอง x 5"); only counts
  // when it comes after the egg count.
  const bundle = /[x×]\s*(\d+)\s*$/i.exec(name.slice(eggs.index))
  const n = Number(eggs[1]) * (bundle ? Number(bundle[1]) : 1)
  return n > 0 ? n : null
}

/** Most eggs a customer can report broken on a line that shipped `shippedQty` units. */
export function maxBrokenEggs(productName: string, shippedQty: number): number {
  const per = eggsPerUnit(productName)
  return per ? per * Math.max(0, Math.floor(Number(shippedQty) || 0)) : 0
}
