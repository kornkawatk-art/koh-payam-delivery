export type FreshDryItem = { is_fresh: boolean | null }

/**
 * Whether to show the "ของสด"/"ของแห้ง" split at all, plus each group.
 * `show` stays false when every item's is_fresh is null/undefined (an order
 * imported before the Dept column was captured) -- the table then renders
 * flat, matching how the order looked before this feature existed, rather
 * than misclassifying every line as dry.
 */
export function splitFreshDry<T extends FreshDryItem>(
  items: T[],
): { show: boolean; fresh: T[]; dry: T[] } {
  return {
    show: items.some((it) => it.is_fresh != null),
    fresh: items.filter((it) => it.is_fresh === true),
    dry: items.filter((it) => it.is_fresh !== true),
  }
}
