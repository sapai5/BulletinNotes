import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  Palette,
  ImagePlus,
  Trash2,
  Loader2,
  MoveDiagonal2,
  X,
} from 'lucide-react'
import type { Note } from '../types'
import { supabase, NOTE_IMAGES_BUCKET } from '../lib/supabase'
import { prepareImageForUpload, errorMessage } from '../lib/imageUpload'
import { useUI } from '../context/UIContext'
import type { ActivityInput } from '../hooks/useBoardCollab'

export const NOTE_COLORS = [
  '#fef08a', // yellow
  '#ffc8dd', // bubble pink
  '#b9fbc0', // mint
  '#a2d2ff', // sky
  '#cdb4db', // grape
  '#ffb4a2', // peach
  '#fdffb6', // lemon
  '#ffffff', // white
]

const MIN_W = 160
const MIN_H = 150

interface Props {
  note: Note
  canEdit: boolean
  authorName: string
  scale: number
  containerRef: React.RefObject<HTMLDivElement | null>
  panBy: (dx: number, dy: number) => void
  getView: () => { s: number; tx: number; ty: number }
  onMove: (id: string, x: number, y: number) => void
  onResize: (id: string, width: number, height: number) => void
  onBringToFront: (id: string) => void
  onPatch: (id: string, patch: Partial<Note>) => void
  onDelete: (id: string) => void
  onActivity?: (input: ActivityInput) => void
  onActivityEnd?: () => void
}

// Deterministic tiny rotation per note so the board feels hand-pinned.
function tiltFor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1000
  return (h / 1000) * 5 - 2.5 // -2.5deg .. +2.5deg
}

export default function NoteCard({
  note,
  canEdit,
  authorName,
  scale,
  containerRef,
  panBy,
  getView,
  onMove,
  onResize,
  onBringToFront,
  onPatch,
  onDelete,
  onActivity,
  onActivityEnd,
}: Props) {
  const { confirm, toast } = useUI()
  const [pos, setPos] = useState({ x: note.x, y: note.y })
  const [size, setSize] = useState({ w: note.width, h: note.height })
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(note.text)
  const [showPalette, setShowPalette] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [uploading, setUploading] = useState(false)
  const [lifted, setLifted] = useState(false)

  const drag = useRef({ startX: 0, startY: 0, originX: 0, originY: 0 })
  const rsz = useRef({ startX: 0, startY: 0, originW: 0, originH: 0 })
  const posRef = useRef({ x: note.x, y: note.y })
  const suppressClick = useRef(false)

  const tilt = tiltFor(note.id)

  // Throttled broadcast of live activity so others see a "shadow".
  const lastEmit = useRef(0)
  function emit(
    kind: ActivityInput['kind'],
    extra: Partial<ActivityInput> = {},
    throttleMs = 0,
  ) {
    if (!onActivity) return
    if (throttleMs) {
      const now = Date.now()
      if (now - lastEmit.current < throttleMs) return
      lastEmit.current = now
    }
    onActivity({
      noteId: note.id,
      x: pos.x,
      y: pos.y,
      width: size.w,
      height: size.h,
      color: note.color,
      text,
      kind,
      ...extra,
    })
  }

  useEffect(() => {
    if (!dragging) setPos({ x: note.x, y: note.y })
  }, [note.x, note.y, dragging])

  useEffect(() => {
    posRef.current = pos
  }, [pos])

  useEffect(() => {
    if (!resizing) setSize({ w: note.width, h: note.height })
  }, [note.width, note.height, resizing])

  useEffect(() => {
    if (!editing) setText(note.text)
  }, [note.text, editing])

  // ---- Drag ----------------------------------------------------------------
  function handlePointerDown(e: ReactPointerEvent) {
    if (!canEdit) return
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    onBringToFront(note.id)
    if (e.pointerType === 'touch') startTouch(e)
    else startMouseDrag(e)
  }

  // Desktop: immediate drag, delta-based (÷scale to convert screen→canvas).
  function startMouseDrag(e: ReactPointerEvent) {
    e.preventDefault()
    setDragging(true)
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
    }
    document.body.classList.add('dragging')

    let moved = false
    const move = (ev: PointerEvent) => {
      moved = true
      const nx = Math.max(0, drag.current.originX + (ev.clientX - drag.current.startX) / scale)
      const ny = Math.max(0, drag.current.originY + (ev.clientY - drag.current.startY) / scale)
      setPos({ x: nx, y: ny })
      emit('moving', { x: nx, y: ny }, 55)
    }
    const up = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.body.classList.remove('dragging')
      setDragging(false)
      if (moved) {
        suppressClick.current = true
        window.setTimeout(() => (suppressClick.current = false), 300)
      }
      setPos((p) => {
        onMove(note.id, p.x, p.y)
        return p
      })
      onActivityEnd?.()
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
  }

  // Mobile: touch a note to PAN the board; long-press to pick the note up,
  // then drag it. Dragging near a screen edge auto-pans the board.
  function startTouch(e: ReactPointerEvent) {
    const startX = e.clientX
    const startY = e.clientY
    const state = {
      picked: false,
      panning: false,
      grabX: 0,
      grabY: 0,
      lastX: startX,
      lastY: startY,
      prevX: startX,
      prevY: startY,
    }
    let autopanRAF = 0

    const rect = () => containerRef.current?.getBoundingClientRect()

    const updateFromFinger = () => {
      const r = rect()
      if (!r) return
      const v = getView()
      const nx = Math.max(0, (state.lastX - r.left - v.tx) / v.s - state.grabX)
      const ny = Math.max(0, (state.lastY - r.top - v.ty) / v.s - state.grabY)
      posRef.current = { x: nx, y: ny }
      setPos({ x: nx, y: ny })
      emit('moving', { x: nx, y: ny }, 55)
    }

    const autopanTick = () => {
      if (!state.picked) return
      const r = rect()
      if (r) {
        const EDGE = 64
        const SPEED = 14
        let dx = 0
        let dy = 0
        if (state.lastX - r.left < EDGE) dx = SPEED
        else if (r.right - state.lastX < EDGE) dx = -SPEED
        if (state.lastY - r.top < EDGE) dy = SPEED
        else if (r.bottom - state.lastY < EDGE) dy = -SPEED
        if (dx || dy) {
          panBy(dx, dy)
          updateFromFinger()
        }
      }
      autopanRAF = requestAnimationFrame(autopanTick)
    }

    const pickup = () => {
      state.picked = true
      setDragging(true)
      setLifted(true)
      document.body.classList.add('dragging')
      navigator.vibrate?.(15)
      const r = rect()
      const v = getView()
      if (r) {
        const fcx = (state.lastX - r.left - v.tx) / v.s
        const fcy = (state.lastY - r.top - v.ty) / v.s
        state.grabX = fcx - posRef.current.x
        state.grabY = fcy - posRef.current.y
      }
      autopanRAF = requestAnimationFrame(autopanTick)
    }

    let timer = window.setTimeout(pickup, 260)

    const move = (ev: PointerEvent) => {
      state.lastX = ev.clientX
      state.lastY = ev.clientY
      if (state.picked) {
        updateFromFinger()
        return
      }
      const moved = Math.hypot(ev.clientX - startX, ev.clientY - startY)
      if (!state.panning && moved > 8) {
        // Moved before the hold completed → treat as a board pan.
        window.clearTimeout(timer)
        state.panning = true
      }
      if (state.panning) {
        panBy(ev.clientX - state.prevX, ev.clientY - state.prevY)
      }
      state.prevX = ev.clientX
      state.prevY = ev.clientY
    }

    const up = () => {
      window.clearTimeout(timer)
      cancelAnimationFrame(autopanRAF)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', up)
      if (state.picked) {
        document.body.classList.remove('dragging')
        setDragging(false)
        setLifted(false)
        onMove(note.id, posRef.current.x, posRef.current.y)
        onActivityEnd?.()
      }
      if (state.picked || state.panning) {
        suppressClick.current = true
        window.setTimeout(() => (suppressClick.current = false), 300)
      }
    }

    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', up)
  }

  // ---- Resize --------------------------------------------------------------
  function handleResizeDown(e: ReactPointerEvent) {
    if (!canEdit) return
    e.preventDefault()
    e.stopPropagation()
    onBringToFront(note.id)
    setResizing(true)
    rsz.current = {
      startX: e.clientX,
      startY: e.clientY,
      originW: size.w,
      originH: size.h,
    }
    document.body.classList.add('resizing')

    const move = (ev: PointerEvent) => {
      const w = Math.max(MIN_W, rsz.current.originW + (ev.clientX - rsz.current.startX) / scale)
      const h = Math.max(MIN_H, rsz.current.originH + (ev.clientY - rsz.current.startY) / scale)
      setSize({ w, h })
      emit('resizing', { width: w, height: h }, 55)
    }
    const up = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.body.classList.remove('resizing')
      setResizing(false)
      setSize((s) => {
        onResize(note.id, Math.round(s.w), Math.round(s.h))
        return s
      })
      onActivityEnd?.()
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
  }

  function commitText() {
    setEditing(false)
    if (text !== note.text) onPatch(note.id, { text })
    onActivityEnd?.()
  }

  function addTag() {
    const t = tagDraft.trim().replace(/^#/, '')
    if (!t) return
    if (note.tags.includes(t)) {
      setTagDraft('')
      return
    }
    onPatch(note.id, { tags: [...note.tags, t] })
    setTagDraft('')
  }

  function removeTag(tag: string) {
    onPatch(note.id, { tags: note.tags.filter((t) => t !== tag) })
  }

  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const { blob, ext, contentType } = await prepareImageForUpload(file)
      const path = `${note.board_id}/${note.id}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(NOTE_IMAGES_BUCKET)
        .upload(path, blob, { upsert: true, contentType })
      if (upErr) throw upErr
      const { data } = supabase.storage
        .from(NOTE_IMAGES_BUCKET)
        .getPublicUrl(path)
      onPatch(note.id, { image_url: data.publicUrl })
    } catch (err) {
      toast(errorMessage(err), 'error')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const active = dragging || resizing

  return (
    <div
      data-note
      onPointerDown={handlePointerDown}
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        backgroundColor: note.color,
        zIndex: note.z_index,
        transform: lifted
          ? 'rotate(-1deg) scale(1.08)'
          : active
            ? 'rotate(0deg) scale(1.02)'
            : `rotate(${tilt}deg)`,
      }}
      className={`absolute flex flex-col rounded-2xl border-2 p-3 pt-5 text-ink transition-[box-shadow,transform] duration-150 ${
        lifted
          ? 'border-coral shadow-pop-lg ring-4 ring-coral/40 animate-wiggle'
          : 'border-ink/80 shadow-pop hover:shadow-pop-lg'
      } ${canEdit ? 'cursor-grab-cute' : ''}`}
    >
      {/* Tape strip */}
      <div className="pointer-events-none absolute -top-2.5 left-1/2 h-5 w-16 -translate-x-1/2 -rotate-2 rounded-sm bg-white/50 ring-1 ring-ink/10 backdrop-blur-[1px]" />

      {/* Header row */}
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="max-w-[55%] truncate font-display text-[11px] font-bold text-ink/60">
          {authorName}
        </span>
        {canEdit && (
          <div className="flex items-center gap-1" data-no-drag>
            <button
              title="Change color"
              onClick={() => setShowPalette((s) => !s)}
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink/70 bg-white/70 hover:bg-white"
            >
              <Palette className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
            <label
              title="Add image"
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border-2 border-ink/70 bg-white/70 hover:bg-white"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
              ) : (
                <ImagePlus className="h-3.5 w-3.5" strokeWidth={2.5} />
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImage}
              />
            </label>
            <button
              title="Delete note"
              onClick={async () => {
                if (
                  await confirm({
                    title: 'Delete this note?',
                    confirmText: 'Delete',
                    danger: true,
                  })
                )
                  onDelete(note.id)
              }}
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink/70 bg-white/70 text-coral hover:bg-coral hover:text-white"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>

      {showPalette && canEdit && (
        <div
          data-no-drag
          className="mb-2 flex flex-wrap gap-1 rounded-xl border-2 border-ink/20 bg-white/60 p-1.5"
        >
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => {
                onPatch(note.id, { color: c })
                setShowPalette(false)
              }}
              className="h-6 w-6 rounded-full border-2 border-ink/60 transition hover:scale-110"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}

      {note.image_url && (
        <img
          src={note.image_url}
          alt=""
          className="mb-2 max-h-40 w-full rounded-xl border-2 border-ink/20 object-cover"
          draggable={false}
        />
      )}

      {/* Body text */}
      {editing ? (
        <textarea
          data-no-drag
          autoFocus
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            emit('editing', { text: e.target.value })
          }}
          onBlur={commitText}
          className="min-h-[48px] flex-1 resize-none rounded-lg bg-white/40 p-1.5 font-body text-sm font-semibold outline-none"
        />
      ) : (
        <p
          data-no-drag={canEdit ? true : undefined}
          onClick={() => {
            if (suppressClick.current) return
            if (canEdit) setEditing(true)
          }}
          className="flex-1 overflow-auto whitespace-pre-wrap break-words font-body text-sm font-semibold"
        >
          {note.text || (
            <span className="italic text-ink/40">
              {canEdit ? 'Click to add text…' : ''}
            </span>
          )}
        </p>
      )}

      {/* Tags */}
      <div className="mt-2 flex flex-wrap items-center gap-1" data-no-drag>
        {note.tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full border-2 border-ink/30 bg-white/60 px-2 py-0.5 font-display text-[11px] font-bold"
          >
            #{tag}
            {canEdit && (
              <button
                onClick={() => removeTag(tag)}
                className="text-ink/50 hover:text-coral"
              >
                <X className="h-3 w-3" strokeWidth={3} />
              </button>
            )}
          </span>
        ))}
        {canEdit && (
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag()
              }
            }}
            onBlur={addTag}
            placeholder="+tag"
            className="w-14 rounded-full bg-white/40 px-2 py-0.5 font-body text-[11px] font-semibold outline-none placeholder:text-ink/40"
          />
        )}
      </div>

      {/* Resize handle */}
      {canEdit && (
        <button
          data-no-drag
          onPointerDown={handleResizeDown}
          title="Drag to resize"
          className="absolute -bottom-1 -right-1 flex h-6 w-6 cursor-nwse-resize items-center justify-center rounded-full border-2 border-ink/70 bg-white text-ink/70 shadow-pop-sm hover:text-ink"
        >
          <MoveDiagonal2 className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      )}
    </div>
  )
}
