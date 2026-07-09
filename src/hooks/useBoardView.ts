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

export interface NoteDragApi {
  onNoteDragStart: (id: string) => void
  onNoteDragMove: (id: string, x: number, y: number) => void
  onNoteDragEnd: (id: string) => void
}

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
export function useBoardView(
  boardId: string | undefined,
  enabled: boolean,
  noteApi?: NoteDragApi,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const noteApiRef = useRef(noteApi)
  noteApiRef.current = noteApi

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

    // ---- Unified pointer gestures: pan, pinch-zoom, and note drag ----
    const pointers = new Map<
      number,
      { x: number; y: number; noteId: string | null; editable: boolean }
    >()
    let gesture: 'none' | 'pan' | 'note' = 'none'
    let lastDist = 0
    let lastMid: { x: number; y: number } | null = null
    let holdTimer = 0
    let autopanRAF = 0
    const drag = {
      id: '',
      grabX: 0,
      grabY: 0,
      nx0: 0,
      ny0: 0,
      nw: 0,
      nh: 0,
      sx: 0,
      sy: 0,
      lx: 0,
      ly: 0,
    }

    const noteElOf = (t: EventTarget | null) =>
      t instanceof Element
        ? (t.closest('[data-note-id]') as HTMLElement | null)
        : null

    const moveNote = () => {
      const v = viewRef.current
      const r = el.getBoundingClientRect()
      const nx = Math.min(
        Math.max(0, CANVAS_W - drag.nw),
        Math.max(0, (drag.lx - r.left - v.tx) / v.s - drag.grabX),
      )
      const ny = Math.min(
        Math.max(0, CANVAS_H - drag.nh),
        Math.max(0, (drag.ly - r.top - v.ty) / v.s - drag.grabY),
      )
      noteApiRef.current?.onNoteDragMove(drag.id, nx, ny)
    }

    const autopanTick = () => {
      if (gesture !== 'note') return
      const r = el.getBoundingClientRect()
      const EDGE = 50
      const MAX = 9
      const dl = drag.lx - r.left
      const dr = r.right - drag.lx
      const dt = drag.ly - r.top
      const db = r.bottom - drag.ly
      let dx = 0
      let dy = 0
      if (dl < EDGE) dx = MAX * (1 - Math.max(0, dl) / EDGE)
      else if (dr < EDGE) dx = -MAX * (1 - Math.max(0, dr) / EDGE)
      if (dt < EDGE) dy = MAX * (1 - Math.max(0, dt) / EDGE)
      else if (db < EDGE) dy = -MAX * (1 - Math.max(0, db) / EDGE)
      if (dx || dy) {
        panBy(dx, dy)
        moveNote()
      }
      autopanRAF = requestAnimationFrame(autopanTick)
    }

    const pickup = () => {
      gesture = 'note'
      const v = viewRef.current
      const r = el.getBoundingClientRect()
      const fcx = (drag.lx - r.left - v.tx) / v.s
      const fcy = (drag.ly - r.top - v.ty) / v.s
      drag.grabX = fcx - drag.nx0
      drag.grabY = fcy - drag.ny0
      navigator.vibrate?.(15)
      noteApiRef.current?.onNoteDragStart(drag.id)
      autopanRAF = requestAnimationFrame(autopanTick)
    }

    const endNoteDrag = () => {
      cancelAnimationFrame(autopanRAF)
      if (drag.id) noteApiRef.current?.onNoteDragEnd(drag.id)
    }

    const onMove = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId)
      if (!p) return
      const prevX = p.x
      const prevY = p.y
      p.x = e.clientX
      p.y = e.clientY
      const pts = [...pointers.values()]

      if (pts.length >= 2) {
        if (gesture === 'note') endNoteDrag()
        clearTimeout(holdTimer)
        gesture = 'pan'
        const a = pts[0]
        const b = pts[1]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        if (lastDist > 0) {
          zoomAt(mid.x, mid.y, dist / lastDist)
          if (lastMid) panBy(mid.x - lastMid.x, mid.y - lastMid.y)
        }
        lastDist = dist
        lastMid = mid
        return
      }

      // single pointer
      if (gesture === 'note') {
        drag.lx = e.clientX
        drag.ly = e.clientY
        moveNote()
        return
      }
      if (gesture === 'none') {
        drag.lx = e.clientX
        drag.ly = e.clientY
        const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy)
        if (moved > 8) {
          clearTimeout(holdTimer)
          gesture = 'pan'
        } else {
          return
        }
      }
      if (gesture === 'pan') panBy(e.clientX - prevX, e.clientY - prevY)
    }

    const onEnd = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      pointers.delete(e.pointerId)
      clearTimeout(holdTimer)
      if (gesture === 'note') endNoteDrag()
      if (pointers.size < 2) {
        lastDist = 0
        lastMid = null
      }
      if (pointers.size === 0) {
        gesture = 'none'
        drag.id = ''
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onEnd)
        window.removeEventListener('pointercancel', onEnd)
      } else {
        gesture = 'pan' // a finger is still down → keep panning
      }
    }

    const onDown = (e: PointerEvent) => {
      const target = e.target
      // Controls / resize handle are handled locally by the note.
      if (target instanceof Element && target.closest('[data-no-drag]')) return
      const noteEl = noteElOf(target)
      const editable = noteEl?.getAttribute('data-note-editable') === 'true'
      // Desktop editable-note dragging stays inside NoteCard (mouse).
      if (e.pointerType === 'mouse' && noteEl && editable) return
      if (e.pointerType === 'mouse' && e.button !== 0) return

      if (pointers.size === 0) {
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onEnd)
        window.addEventListener('pointercancel', onEnd)
      }
      pointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        noteId: noteEl?.getAttribute('data-note-id') ?? null,
        editable,
      })

      if (pointers.size === 2) {
        clearTimeout(holdTimer)
        if (gesture === 'note') endNoteDrag()
        gesture = 'pan'
        lastDist = 0
        lastMid = null
        return
      }

      // single pointer
      if (e.pointerType === 'touch' && noteEl && editable) {
        drag.id = noteEl.getAttribute('data-note-id') as string
        drag.nx0 = parseFloat(noteEl.getAttribute('data-nx') || '0')
        drag.ny0 = parseFloat(noteEl.getAttribute('data-ny') || '0')
        drag.nw = parseFloat(noteEl.getAttribute('data-nw') || '0')
        drag.nh = parseFloat(noteEl.getAttribute('data-nh') || '0')
        drag.sx = e.clientX
        drag.sy = e.clientY
        drag.lx = e.clientX
        drag.ly = e.clientY
        gesture = 'none' // undecided: hold → drag note, move → pan
        holdTimer = window.setTimeout(pickup, 260)
      } else {
        gesture = 'pan'
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey) {
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01))
      } else {
        panBy(-e.deltaX, -e.deltaY)
      }
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      el.removeEventListener('wheel', onWheel)
      clearTimeout(holdTimer)
      cancelAnimationFrame(autopanRAF)
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
