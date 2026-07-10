import { useEffect, useRef } from 'react'
import type { Stroke } from '../types'

interface Props {
  strokes: Stroke[]
  penColor: string
  penWidth: number
  editable: boolean
  // Called when a finished stroke should be added + persisted.
  onCommitStroke: (stroke: Stroke) => void
}

/**
 * A mini-whiteboard surface. Draws with mouse, finger, or Apple Pencil via
 * pointer events. Points are stored normalized (0..1) so a drawing scales with
 * the note when it's resized or the board is zoomed.
 *
 * The wrapper is marked [data-no-drag] so the board's gesture manager and the
 * note's drag handler ignore touches here — this area is for drawing.
 */
export default function DrawingCanvas({
  strokes,
  penColor,
  penWidth,
  editable,
  onCommitStroke,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const current = useRef<Stroke | null>(null)
  const drawingId = useRef<number | null>(null)

  // Draw every stroke (plus the in-progress one) onto the canvas.
  const redraw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const all = current.current ? [...strokes, current.current] : strokes
    for (const s of all) {
      if (s.pts.length < 2) continue
      ctx.strokeStyle = s.color
      ctx.lineWidth = s.width
      ctx.beginPath()
      ctx.moveTo(s.pts[0] * w, s.pts[1] * h)
      for (let i = 2; i < s.pts.length; i += 2) {
        ctx.lineTo(s.pts[i] * w, s.pts[i + 1] * h)
      }
      // A single dot (tap) → draw a small circle.
      if (s.pts.length === 2) {
        ctx.lineTo(s.pts[0] * w + 0.1, s.pts[1] * h + 0.1)
      }
      ctx.stroke()
    }
  }

  // Keep the backing store sized to the element (device pixels) and redraw.
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      // offsetWidth/Height are layout pixels (unaffected by board zoom).
      const w = wrap.offsetWidth
      const h = wrap.offsetHeight
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      redraw()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Redraw when the stored strokes change (e.g. realtime updates or undo/clear).
  useEffect(() => {
    redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes])

  function pointFromEvent(e: React.PointerEvent) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const nx = (e.clientX - rect.left) / rect.width
    const ny = (e.clientY - rect.top) / rect.height
    return [Math.min(1, Math.max(0, nx)), Math.min(1, Math.max(0, ny))]
  }

  function handleDown(e: React.PointerEvent) {
    if (!editable) return
    e.stopPropagation()
    e.preventDefault()
    drawingId.current = e.pointerId
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const [nx, ny] = pointFromEvent(e)
    current.current = {
      color: penColor,
      width: penWidth * dpr,
      pts: [nx, ny],
    }
    redraw()
  }

  function handleMove(e: React.PointerEvent) {
    if (drawingId.current !== e.pointerId || !current.current) return
    e.stopPropagation()
    const [nx, ny] = pointFromEvent(e)
    current.current.pts.push(nx, ny)
    redraw()
  }

  function handleUp(e: React.PointerEvent) {
    if (drawingId.current !== e.pointerId) return
    e.stopPropagation()
    drawingId.current = null
    const stroke = current.current
    current.current = null
    if (stroke && stroke.pts.length >= 2) onCommitStroke(stroke)
    redraw()
  }

  return (
    <div
      ref={wrapRef}
      data-no-drag
      className="relative flex-1 overflow-hidden rounded-lg bg-white"
      style={{ touchAction: 'none' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ cursor: editable ? 'crosshair' : 'default' }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
      />
    </div>
  )
}
