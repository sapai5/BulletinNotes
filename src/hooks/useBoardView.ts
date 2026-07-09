import { useCallback, useEffect, useRef, useState } from 'react'

// The fixed logical size of a board's canvas (notes are positioned within this).
export const CANVAS_W = 3000
export const CANVAS_H = 2000

const MIN_SCALE = 0.1
const MAX_SCALE = 4
const SAVE_KEY = (boardId: string) => `bb-view-${boardId}`

interface View {
  s: number // scale
  tx: number // translate x (px)
  ty: number // translate y (px)
}

const clampScale = (v: number, lo = MIN_SCALE, hi = MAX_SCALE) =>
  Math.min(hi, Math.max(lo, v))

function loadSaved(boardId: string): View | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY(boardId))
    if (!raw) return null
    const v = JSON.parse(raw)
    if (typeof v?.s === 'number') return v as View
    return null
  } catch {
    return null
  }
}

/**
 * Transform-based pan + zoom for the board.
 * The surface is translated + scaled via CSS transform (origin 0,0), so we can
 * anchor zoom to the pointer/finger position at ANY scale — unlike native
 * scrolling, which can't position content that's smaller than the viewport.
 */
export function useBoardView(boardId: string | undefined, enabled: boolean) {
  const containerRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)

  const [view, setView] = useState<View>({ s: 1, tx: 0, ty: 0 })
  const viewRef = useRef<View>(view)
  const initedFor = useRef<string | null>(null)
  const saveTimer = useRef<number | null>(null)

  const scheduleSave = useCallback(() => {
    if (!boardId) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(SAVE_KEY(boardId), JSON.stringify(viewRef.current))
      } catch {
        /* ignore quota errors */
      }
    }, 350)
  }, [boardId])

  // Keep the board from being panned completely off-screen, but always allow
  // free panning in both axes (a margin keeps at least part of it reachable).
  const clampView = useCallback((v: View): View => {
    const el = containerRef.current
    if (!el) return v
    const vw = el.clientWidth
    const vh = el.clientHeight
    const bw = CANVAS_W * v.s
    const bh = CANVAS_H * v.s
    const m = 220 // how far a board edge may travel inside the viewport
    const tx = Math.min(m, Math.max(vw - bw - m, v.tx))
    const ty = Math.min(m, Math.max(vh - bh - m, v.ty))
    return { s: v.s, tx, ty }
  }, [])

  const apply = useCallback(
    (v: View, save = true) => {
      const clamped = clampView(v)
      viewRef.current = clamped
      if (surfaceRef.current) {
        surfaceRef.current.style.transform = `translate(${clamped.tx}px, ${clamped.ty}px) scale(${clamped.s})`
      }
      setView(clamped)
      if (save) scheduleSave()
    },
    [clampView, scheduleSave],
  )

  // Zoom keeping (clientX, clientY) fixed on screen.
  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const fx = clientX - rect.left
      const fy = clientY - rect.top
      const { s: s0, tx, ty } = viewRef.current
      const s1 = clampScale(s0 * factor)
      if (s1 === s0) return
      // Canvas point under the focal stays put: t1 = f - (f - t0)/s0 * s1
      const tx1 = fx - ((fx - tx) / s0) * s1
      const ty1 = fy - ((fy - ty) / s0) * s1
      apply({ s: s1, tx: tx1, ty: ty1 })
    },
    [apply],
  )

  const panBy = useCallback(
    (dx: number, dy: number) => {
      const v = viewRef.current
      apply({ s: v.s, tx: v.tx + dx, ty: v.ty + dy })
    },
    [apply],
  )

  const fitToView = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const s = Math.max(
      0.05,
      Math.min(el.clientWidth / CANVAS_W, el.clientHeight / CANVAS_H),
    )
    // Center the whole board in the viewport.
    const tx = (el.clientWidth - CANVAS_W * s) / 2
    const ty = (el.clientHeight - CANVAS_H * s) / 2
    apply({ s, tx, ty })
  }, [apply])

  const zoomIn = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.25)
  }, [zoomAt])

  const zoomOut = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.25)
  }, [zoomAt])

  useEffect(() => {
    const el = containerRef.current
    if (!enabled || !el || !boardId) return

    if (initedFor.current !== boardId) {
      initedFor.current = boardId
      const saved = loadSaved(boardId)
      if (saved) apply({ ...saved, s: clampScale(saved.s) }, false)
      else fitToView()
    }

    // ---- Pointer pan + pinch (mouse + touch, unified) ----
    const pointers = new Map<number, { x: number; y: number }>()
    let lastDist = 0
    let lastMid: { x: number; y: number } | null = null

    const isOnNote = (t: EventTarget | null) =>
      t instanceof Element && !!t.closest('[data-note]')

    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      const prev = pointers.get(e.pointerId)!
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const pts = [...pointers.values()]
      if (pts.length === 1) {
        panBy(e.clientX - prev.x, e.clientY - prev.y)
      } else if (pts.length === 2) {
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
        const mid = {
          x: (pts[0].x + pts[1].x) / 2,
          y: (pts[0].y + pts[1].y) / 2,
        }
        if (lastDist > 0) {
          zoomAt(mid.x, mid.y, dist / lastDist)
          if (lastMid) panBy(mid.x - lastMid.x, mid.y - lastMid.y)
        }
        lastDist = dist
        lastMid = mid
      }
    }
    const endPointer = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      pointers.delete(e.pointerId)
      if (pointers.size < 2) {
        lastDist = 0
        lastMid = null
      }
      if (pointers.size === 0) {
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', endPointer)
        window.removeEventListener('pointercancel', endPointer)
      }
    }
    const onPointerDown = (e: PointerEvent) => {
      if (isOnNote(e.target)) return // let the note handle its own drag
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (pointers.size === 0) {
        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', endPointer)
        window.addEventListener('pointercancel', endPointer)
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey) {
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01))
      } else {
        panBy(-e.deltaX, -e.deltaY)
      }
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', endPointer)
      window.removeEventListener('pointercancel', endPointer)
      el.removeEventListener('wheel', onWheel)
    }
  }, [enabled, boardId, apply, fitToView, zoomAt, panBy])

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [boardId])

  return {
    containerRef,
    surfaceRef,
    scale: view.s,
    tx: view.tx,
    ty: view.ty,
    zoomIn,
    zoomOut,
    fitToView,
    panBy,
    getView: () => viewRef.current,
  }
}
