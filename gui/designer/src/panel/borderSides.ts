// A value given PER SIDE: the four sides in the engine's own order, the map
// shape a border property takes when it is not a scalar, and the handful of
// primitives every border module builds on (make a uniform map, ask whether it
// is blank / uniform / equal to another, narrow it to its non-blank sides,
// replace one side). A no-import leaf: `borderTypes` names `SideMap` in the
// views it declares, and the border read (`borderModel`), the write
// (`borderOps`) and the editor's diagram all build on the primitives.

/** The four sides, in the engine's map order (border.rs). */
export const SIDES = ['top', 'right', 'bottom', 'left'] as const;
export type Side = (typeof SIDES)[number];
export type SideMap<T> = Readonly<Record<Side, T>>;

/** The same value on every side. */
export function uniform<T>(value: T): SideMap<T> {
  return { top: value, right: value, bottom: value, left: value };
}

/** True when a per-side map is all-zero (width) or all-empty (color/style). */
export function allBlank<T>(sides: SideMap<T>, blank: T): boolean {
  return SIDES.every((s) => sides[s] === blank);
}

/** True when a per-side map holds the same value on every side. */
export function allEqual<T>(sides: SideMap<T>): boolean {
  return SIDES.every((s) => sides[s] === sides.top);
}

/** Two per-side maps hold the same value on every side. */
export function sameSides<T>(a: SideMap<T>, b: SideMap<T>): boolean {
  return SIDES.every((s) => a[s] === b[s]);
}

/** The non-blank sides of a per-side map, as a plain object for a `putValue`. */
export function sparseMap<T>(sides: SideMap<T>, blank: T): Record<string, T> {
  const out: Record<string, T> = {};
  for (const s of SIDES) {
    if (sides[s] !== blank) {
      out[s] = sides[s];
    }
  }
  return out;
}

/** The map with one side replaced. */
export function withSide<T>(sides: SideMap<T>, side: Side, value: T): SideMap<T> {
  return { ...sides, [side]: value };
}
