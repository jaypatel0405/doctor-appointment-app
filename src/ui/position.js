// Popover placement helpers shared by Select and DatePicker.

const EDGE = 16

// The sticky .appbar's height (--nav: 72, 56 on phones).
export function navHeight() {
  if (typeof window === 'undefined') return 72
  const value = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--nav')
  )
  return Number.isFinite(value) ? value : 72
}

// Radix collision padding: keep the popover clear of the sticky bar at the top.
export function collisionPadding() {
  return { top: navHeight() + 8, bottom: EDGE, left: EDGE, right: EDGE }
}

// Before a popover opens below `trigger`, scroll the page (instantly, so the popover is placed
// against the final position) until `needed` px fit under it, without pushing the trigger
// itself under the bar.
export function makeRoomBelow(trigger, needed) {
  if (!trigger || typeof window === 'undefined') return
  const rect = trigger.getBoundingClientRect()
  const top = navHeight() + 8
  const shortfall = rect.bottom + 6 + needed + EDGE - window.innerHeight
  if (shortfall <= 0) return
  const room = Math.max(0, rect.top - top)
  const delta = Math.min(shortfall, room)
  if (delta > 0) window.scrollBy({ top: delta, behavior: 'instant' })
}
