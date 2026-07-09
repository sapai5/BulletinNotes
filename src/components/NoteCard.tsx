import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Note } from '../types'
import { supabase, NOTE_IMAGES_BUCKET } from '../lib/supabase'

export const NOTE_COLORS = [
  '#fef08a', // yellow
  '#fca5a5', // red
  '#a7f3d0', // green
  '#93c5fd', // blue
  '#f5d0fe', // purple
  '#fed7aa', // orange
  '#e2e8f0', // gray
]

interface Props {
  note: Note
  canEdit: boolean
  authorName: string
  onMove: (id: string, x: number, y: number) => void
  onBringToFront: (id: string) => void
  onPatch: (id: string, patch: Partial<Note>) => void
  onDelete: (id: string) => void
}

export default function NoteCard({
  note,
  canEdit,
  authorName,
  onMove,
  onBringToFront,
  onPatch,
  onDelete,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: note.x, y: note.y })
  const [dragging, setDragging] = useState(false)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(note.text)
  const [showPalette, setShowPalette] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [uploading, setUploading] = useState(false)

  // Drag bookkeeping stored in a ref so listeners see fresh values.
  const drag = useRef({ startX: 0, startY: 0, originX: 0, originY: 0 })

  // Keep local position in sync when the note moves remotely (realtime).
  useEffect(() => {
    if (!dragging) setPos({ x: note.x, y: note.y })
  }, [note.x, note.y, dragging])

  useEffect(() => {
    if (!editing) setText(note.text)
  }, [note.text, editing])

  function handlePointerDown(e: ReactPointerEvent) {
    if (!canEdit) return
    // Ignore drags that start on interactive controls.
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    e.preventDefault()
    onBringToFront(note.id)
    setDragging(true)
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
    }
    document.body.classList.add('dragging')

    const handleMove = (ev: PointerEvent) => {
      const nx = drag.current.originX + (ev.clientX - drag.current.startX)
      const ny = drag.current.originY + (ev.clientY - drag.current.startY)
      setPos({ x: Math.max(0, nx), y: Math.max(0, ny) })
    }
    const handleUp = () => {
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleUp)
      document.body.classList.remove('dragging')
      setDragging(false)
      setPos((p) => {
        onMove(note.id, p.x, p.y)
        return p
      })
    }
    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleUp)
  }

  function commitText() {
    setEditing(false)
    if (text !== note.text) onPatch(note.id, { text })
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
      const ext = file.name.split('.').pop() ?? 'png'
      const path = `${note.board_id}/${note.id}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(NOTE_IMAGES_BUCKET)
        .upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data } = supabase.storage
        .from(NOTE_IMAGES_BUCKET)
        .getPublicUrl(path)
      onPatch(note.id, { image_url: data.publicUrl })
    } catch (err) {
      alert(
        'Image upload failed: ' +
          (err instanceof Error ? err.message : 'unknown error'),
      )
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div
      ref={cardRef}
      onPointerDown={handlePointerDown}
      style={{
        left: pos.x,
        top: pos.y,
        width: note.width,
        minHeight: note.height,
        backgroundColor: note.color,
        zIndex: note.z_index,
        cursor: canEdit ? 'grab' : 'default',
      }}
      className="absolute flex flex-col rounded-md p-3 text-slate-900 shadow-lg ring-1 ring-black/10 transition-shadow"
    >
      {/* Header row */}
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="truncate text-[11px] font-medium text-slate-700/70">
          {authorName}
        </span>
        {canEdit && (
          <div className="flex items-center gap-1" data-no-drag>
            <button
              title="Change color"
              onClick={() => setShowPalette((s) => !s)}
              className="flex h-5 w-5 items-center justify-center rounded-full ring-1 ring-black/20"
              style={{ backgroundColor: note.color }}
            />
            <label
              title="Add image"
              className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-xs hover:bg-black/10"
            >
              {uploading ? '…' : '🖼'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImage}
              />
            </label>
            <button
              title="Delete note"
              onClick={() => {
                if (confirm('Delete this note?')) onDelete(note.id)
              }}
              className="flex h-5 w-5 items-center justify-center rounded text-xs hover:bg-black/10"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {showPalette && canEdit && (
        <div
          data-no-drag
          className="mb-2 flex flex-wrap gap-1 rounded bg-white/50 p-1"
        >
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => {
                onPatch(note.id, { color: c })
                setShowPalette(false)
              }}
              className="h-5 w-5 rounded-full ring-1 ring-black/20"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}

      {note.image_url && (
        <img
          src={note.image_url}
          alt=""
          className="mb-2 max-h-40 w-full rounded object-cover"
          draggable={false}
        />
      )}

      {/* Body text */}
      {editing ? (
        <textarea
          data-no-drag
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          className="min-h-[60px] flex-1 resize-none rounded bg-white/40 p-1 text-sm outline-none"
        />
      ) : (
        <p
          data-no-drag={canEdit ? true : undefined}
          onClick={() => canEdit && setEditing(true)}
          className="flex-1 whitespace-pre-wrap break-words text-sm"
        >
          {note.text || (
            <span className="italic text-slate-500">
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
            className="group inline-flex items-center gap-1 rounded-full bg-black/10 px-2 py-0.5 text-[11px]"
          >
            #{tag}
            {canEdit && (
              <button
                onClick={() => removeTag(tag)}
                className="text-slate-600 hover:text-red-600"
              >
                ×
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
            className="w-14 rounded-full bg-white/40 px-2 py-0.5 text-[11px] outline-none placeholder:text-slate-500"
          />
        )}
      </div>
    </div>
  )
}
