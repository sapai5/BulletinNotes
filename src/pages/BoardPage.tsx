import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Plus,
  Users,
  StickyNote,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Board, Note } from '../types'
import { NOTE_COLORS } from '../components/NoteCard'
import NoteCard from '../components/NoteCard'
import GhostNote from '../components/GhostNote'
import Avatar from '../components/Avatar'
import MembersDialog from '../components/MembersDialog'
import AppHeader from '../components/AppHeader'
import Spinner from '../components/Spinner'
import { useBoardCollab } from '../hooks/useBoardCollab'
import { useBoardView, CANVAS_W, CANVAS_H } from '../hooks/useBoardView'

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [board, setBoard] = useState<Board | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showMembers, setShowMembers] = useState(false)

  const isOwner = board?.owner_id === user?.id

  const { viewers, ghosts, emitActivity, emitActivityEnd } =
    useBoardCollab(boardId)

  const { scrollRef, sizerRef, surfaceRef, scale, zoomIn, zoomOut, fitToView } =
    useBoardView(boardId, !loading && !!board)

  // ---- Loading -------------------------------------------------------------
  const loadAuthors = useCallback(async () => {
    if (!boardId) return
    // board_members has no direct FK to profiles (both reference auth.users),
    // so we can't embed profiles — fetch the member ids, then their profiles.
    const { data: members } = await supabase
      .from('board_members')
      .select('user_id')
      .eq('board_id', boardId)
    const ids = (members ?? []).map((m) => m.user_id as string)
    if (!ids.length) {
      setAuthorNames({})
      return
    }
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, display_name, email')
      .in('id', ids)
    const map: Record<string, string> = {}
    for (const p of profs ?? []) {
      const prof = p as { id: string; display_name: string | null; email: string }
      map[prof.id] = prof.display_name || prof.email || 'Someone'
    }
    setAuthorNames(map)
  }, [boardId])

  const load = useCallback(async () => {
    if (!boardId) return
    setError(null)

    const { data: boardData, error: boardErr } = await supabase
      .from('boards')
      .select('*')
      .eq('id', boardId)
      .maybeSingle()

    if (boardErr || !boardData) {
      setError(
        boardErr?.message ??
          'Board not found, or you do not have access to it.',
      )
      setLoading(false)
      return
    }
    setBoard(boardData as Board)

    const { data: noteData, error: noteErr } = await supabase
      .from('notes')
      .select('*')
      .eq('board_id', boardId)
      .order('z_index', { ascending: true })

    if (noteErr) {
      setError(noteErr.message)
    } else {
      setNotes((noteData ?? []) as Note[])
    }
    await loadAuthors()
    setLoading(false)
  }, [boardId, loadAuthors])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // ---- Realtime ------------------------------------------------------------
  useEffect(() => {
    if (!boardId) return
    const channel = supabase
      .channel(`board-${boardId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notes',
          filter: `board_id=eq.${boardId}`,
        },
        (payload) => {
          setNotes((prev) => {
            if (payload.eventType === 'INSERT') {
              const n = payload.new as Note
              if (prev.some((p) => p.id === n.id)) return prev
              return [...prev, n]
            }
            if (payload.eventType === 'UPDATE') {
              const n = payload.new as Note
              return prev.map((p) => (p.id === n.id ? { ...p, ...n } : p))
            }
            if (payload.eventType === 'DELETE') {
              const oldId = (payload.old as { id: string }).id
              return prev.filter((p) => p.id !== oldId)
            }
            return prev
          })
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'board_members',
          filter: `board_id=eq.${boardId}`,
        },
        () => {
          loadAuthors()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [boardId, loadAuthors])

  // ---- Mutations -----------------------------------------------------------
  const maxZ = notes.reduce((m, n) => Math.max(m, n.z_index), 0)

  async function addNote() {
    if (!boardId || !user) return
    // Place the note near the center of what's currently visible, converting
    // viewport pixels to canvas coordinates (accounting for zoom).
    const el = scrollRef.current
    const s = scale || 1
    const cx = ((el?.scrollLeft ?? 0) + (el?.clientWidth ?? 600) / 2) / s
    const cy = ((el?.scrollTop ?? 0) + (el?.clientHeight ?? 400) / 2) / s
    const jitter = () => Math.random() * 40 - 20
    const baseX = Math.max(0, Math.min(CANVAS_W - 220, cx - 110 + jitter()))
    const baseY = Math.max(0, Math.min(CANVAS_H - 220, cy - 110 + jitter()))
    const color = NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)]

    const { data, error } = await supabase
      .from('notes')
      .insert({
        board_id: boardId,
        author_id: user.id,
        text: '',
        color,
        x: Math.round(baseX),
        y: Math.round(baseY),
        z_index: maxZ + 1,
      })
      .select()
      .single()

    if (error) {
      setError(error.message)
      return
    }
    setNotes((prev) =>
      prev.some((p) => p.id === data.id) ? prev : [...prev, data as Note],
    )
  }

  function patchLocal(id: string, patch: Partial<Note>) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)))
  }

  async function persist(id: string, patch: Partial<Note>) {
    const { error } = await supabase.from('notes').update(patch).eq('id', id)
    if (error) setError(error.message)
  }

  function handlePatch(id: string, patch: Partial<Note>) {
    patchLocal(id, patch)
    persist(id, patch)
  }

  function handleMove(id: string, x: number, y: number) {
    patchLocal(id, { x, y })
    persist(id, { x, y })
  }

  function handleResize(id: string, width: number, height: number) {
    patchLocal(id, { width, height })
    persist(id, { width, height })
  }

  function handleBringToFront(id: string) {
    const newZ = maxZ + 1
    patchLocal(id, { z_index: newZ })
    persist(id, { z_index: newZ })
  }

  async function handleDelete(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id))
    const { error } = await supabase.from('notes').delete().eq('id', id)
    if (error) setError(error.message)
  }

  // ---- Render --------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-cream">
        <Spinner label="Loading board…" />
      </div>
    )
  }

  if (error && !board) {
    return (
      <div className="min-h-full bg-cream text-ink">
        <AppHeader />
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <p className="mb-4 font-display text-lg font-semibold text-ink/70">
            {error}
          </p>
          <button
            onClick={() => navigate('/')}
            className="btn-pop bg-coral px-4 py-2.5 text-white"
          >
            Back to boards
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-cream text-ink">
      <AppHeader>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/')}
            className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink bg-white shadow-pop-sm transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            title="Back to boards"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
          </button>
          <h1 className="truncate font-display text-lg font-bold">
            {board?.name}
          </h1>
        </div>
      </AppHeader>

      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b-2 border-ink/10 bg-cream/90 px-4 py-2.5">
        <button onClick={addNote} className="btn-pop bg-coral px-3 py-1.5 text-sm text-white">
          <Plus className="h-4 w-4" strokeWidth={3} />
          Add note
        </button>
        <button
          onClick={() => setShowMembers(true)}
          className="btn-pop bg-white px-3 py-1.5 text-sm"
        >
          <Users className="h-4 w-4" strokeWidth={2.5} />
          Members
        </button>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 rounded-full border-2 border-ink bg-white px-1 py-1 shadow-pop-sm">
          <button
            onClick={zoomOut}
            className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-ink/10"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" strokeWidth={2.5} />
          </button>
          <button
            onClick={fitToView}
            className="flex items-center gap-1 rounded-full px-1.5 font-display text-xs font-bold hover:bg-ink/10"
            title="Fit whole board"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            onClick={zoomIn}
            className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-ink/10"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" strokeWidth={2.5} />
          </button>
          <button
            onClick={fitToView}
            className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-ink/10"
            title="Fit whole board"
          >
            <Maximize2 className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>

        <span className="ml-auto font-display text-xs font-bold text-ink/50">
          {notes.length} note{notes.length === 1 ? '' : 's'}
        </span>
        {viewers.length > 0 && (
          <div className="flex items-center -space-x-2" title="Here now">
            {viewers.slice(0, 5).map((v) => (
              <div key={v.userId} className="ring-2 ring-cream rounded-full">
                <Avatar
                  name={v.name}
                  avatarUrl={v.avatarUrl}
                  size={28}
                  online
                />
              </div>
            ))}
            {viewers.length > 5 && (
              <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink bg-white font-display text-[10px] font-bold">
                +{viewers.length - 5}
              </span>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="bg-coral/20 px-4 py-1.5 font-body text-sm font-semibold text-ink">
          {error}
        </p>
      )}

      {/* Canvas */}
      <div
        ref={scrollRef}
        className="corkboard relative flex-1 overflow-auto"
        style={{ touchAction: 'pan-x pan-y' }}
      >
        {/* Sizer carries the scaled dimensions so scrollbars are correct. */}
        <div
          ref={sizerRef}
          style={{
            width: CANVAS_W * scale,
            height: CANVAS_H * scale,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {/* Surface is the fixed logical canvas, visually scaled. */}
          <div
            ref={surfaceRef}
            style={{
              width: CANVAS_W,
              height: CANVAS_H,
              transformOrigin: '0 0',
              transform: `scale(${scale})`,
              position: 'relative',
            }}
          >
            {notes.length === 0 && (
              <div className="pointer-events-none absolute left-1/2 top-40 -translate-x-1/2 text-center">
                <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl border-2 border-ink bg-white shadow-pop animate-float">
                  <StickyNote className="h-8 w-8 text-coral" strokeWidth={2.5} />
                </div>
                <p className="font-display text-xl font-bold text-white drop-shadow">
                  This board is empty!
                </p>
                <p className="font-body font-semibold text-white/90 drop-shadow">
                  Hit “Add note” to pin your first one.
                </p>
              </div>
            )}
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                canEdit={note.author_id === user?.id}
                authorName={authorNames[note.author_id] ?? 'Someone'}
                scale={scale}
                onMove={handleMove}
                onResize={handleResize}
                onBringToFront={handleBringToFront}
                onPatch={handlePatch}
                onDelete={handleDelete}
                onActivity={emitActivity}
                onActivityEnd={emitActivityEnd}
              />
            ))}

            {/* Live "shadows" of what other viewers are doing right now. */}
            {Object.values(ghosts).map((g) => (
              <GhostNote key={g.userId} ghost={g} />
            ))}
          </div>
        </div>
      </div>

      {showMembers && boardId && user && (
        <MembersDialog
          boardId={boardId}
          isOwner={!!isOwner}
          currentUserId={user.id}
          onClose={() => setShowMembers(false)}
        />
      )}
    </div>
  )
}
