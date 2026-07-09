import { useCallback, useEffect, useRef, useState } from 'react'

// The fixed logical size of a board's canvas (notes are positioned within this).
export const CANVAS_W = 3000
export const CANVAS_H = 2000

const MIN_SCALE = 0.2
const MAX_SCALE = 3
const SAVE_KEY = (boardId: string) => `bb-view-${boardId}`

interface SavedView {
  scale: number
  left: number
  top: number
}

const clamp = (v: number, lo = MIN_SCALE, hi = MAX_SCALE) =>
  Math.min(hi, Math.max(lo, v))

function loadSaved(boardId: string): SavedView | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY(boardId))
    if (!raw) return null
    const v = JSON.parse(raw)
    if (typeof v?.scale === 'number') return v as SavedView
    return null
  } catch {
    return null
  }
}

/**
 * Pan + zoom for the board canvas.
 * - Panning uses the container's native scroll.
 * - Zoom is a CSS transform on the surface; the sizer carries the scaled size
 *   so scrollbars/extent stay correct. Focal-point math keeps the point under
 *   the cursor/fingers fixed while zooming.
 * - First visit fits the whole board; return visits restore the saved view.
 */
export function useBoardView(boardId: string | undefined, enabled: boolean) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const sizerRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)

  const [scale, setScale] = useState(1)
  const scaleRef = useRef(1)
  const initedFor = useRef<string | null>(null)
  const saveTimer = useRef<number | null>(null)

  // Apply a scale + optional scroll imperatively (no async gap → no flicker).
  const applyScale = useCallback((s1: number, left?: number, top?: number) => {
    const el = scrollRef.current
    scaleRef.current = s1
    if (sizerRef.current) {
      sizerRef.current.style.width = `${CANVAS_W * s1}px`
      sizerRef.current.style.height = `${CANVAS_H * s1}px`
    }
    if (surfaceRef.current) {
      surfaceRef.current.style.transform = `scale(${s1})`
    }
    if (el && left !== undefined && top !== undefined) {
      el.scrollLeft = left
      el.scrollTop = top
    }
    setScale(s1)
  }, [])

  const scheduleSave = useCallback(() => {
    if (!boardId) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      const el = scrollRef.current
      if (!el) return
      try {
        localStorage.setItem(
          SAVE_KEY(boardId),
          JSON.stringify({
            scale: scaleRef.current,
            left: el.scrollLeft,
            top: el.scrollTop,
          }),
        )
      } catch {
        /* ignore quota errors */
      }
    }, 400)
  }, [boardId])

  // Zoom keeping (clientX, clientY) fixed on screen.
  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const el = scrollRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const fx = clientX - rect.left
      const fy = clientY - rect.top
      const s0 = scaleRef.current
      const s1 = clamp(s0 * factor)
      if (s1 === s0) return
      const canvasX = (el.scrollLeft + fx) / s0
      const canvasY = (el.scrollTop + fy) / s0
      applyScale(s1, canvasX * s1 - fx, canvasY * s1 - fy)
      scheduleSave()
    },
    [applyScale, scheduleSave],
  )

  const fitToView = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const s = clamp(
      Math.min(el.clientWidth / CANVAS_W, el.clientHeight / CANVAS_H),
    )
    applyScale(s, 0, 0)
    scheduleSave()
  }, [applyScale, scheduleSave])

  const zoomIn = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.2)
  }, [zoomAt])

  const zoomOut = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.2)
  }, [zoomAt])

  // Initialise + attach gesture listeners once the canvas is mounted.
  useEffect(() => {
    const el = scrollRef.current
    if (!enabled || !el || !boardId) return

    if (initedFor.current !== boardId) {
      initedFor.current = boardId
      const saved = loadSaved(boardId)
      if (saved) {
        applyScale(clamp(saved.scale), saved.left, saved.top)
      } else {
        fitToView()
      }
    }

    // Trackpad pinch / ctrl+wheel zoom.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return // let normal wheel scroll (pan)
      e.preventDefault()
      const factor = Math.exp(-e.deltaY * 0.01)
      zoomAt(e.clientX, e.clientY, factor)
    }

    // Touch pinch.
    let lastDist = 0
    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const mid = (t: TouchList) => ({
      x: (t[0].clientX + t[1].clientX) / 2,
      y: (t[0].clientY + t[1].clientY) / 2,
    })
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) lastDist = dist(e.touches)
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      e.preventDefault()
      const d = dist(e.touches)
      if (lastDist > 0) {
        const m = mid(e.touches)
        zoomAt(m.x, m.y, d / lastDist)
      }
      lastDist = d
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) lastDist = 0
    }

    const onScroll = () => scheduleSave()

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('scroll', onScroll)
    }
  }, [enabled, boardId, applyScale, fitToView, zoomAt, scheduleSave])

  // Reset the init guard when switching boards.
  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [boardId])

  return { scrollRef, sizerRef, surfaceRef, scale, zoomIn, zoomOut, fitToView }
}
