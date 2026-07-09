import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Board, Note } from '../types'
import { NOTE_COLORS } from '../components/NoteCard'
import NoteCard from '../components/NoteCard'
import MembersDialog from '../components/MembersDialog'
import AppHeader from '../components/AppHeader'
import Spinner from '../components/Spinner'

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

  const scrollRef = useRef<HTMLDivElement>(null)

  const isOwner = board?.owner_id === user?.id

  // ---- Loading -------------------------------------------------------------
  const loadAuthors = useCallback(async () => {
    if (!boardId) return
    const { data } = await supabase
      .from('board_members')
      .select('user_id, profile:profiles(display_name, email)')
      .eq('board_id', boardId)
    const map: Record<string, string> = {}
    for (const row of data ?? []) {
      const p = row.profile as unknown as {
        display_name: string | null
        email: string
      } | null
      map[row.user_id as string] = p?.display_name || p?.email || 'Someone'
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
    // Place near the current scroll position with a little jitter.
    const el = scrollRef.current
    const baseX = (el?.scrollLeft ?? 0) + 60 + Math.random() * 40
    const baseY = (el?.scrollTop ?? 0) + 60 + Math.random() * 40
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
    // Optimistically add (realtime may also deliver it; we dedupe by id).
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
      <div className="flex h-full items-center justify-center bg-slate-900">
        <Spinner label="Loading board…" />
      </div>
    )
  }

  if (error && !board) {
    return (
      <div className="min-h-full bg-slate-900 text-white">
        <AppHeader />
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <p className="mb-4 text-slate-300">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900"
          >
            Back to boards
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-slate-900 text-white">
      <AppHeader>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="text-slate-400 hover:text-white"
            title="Back to boards"
          >
            ←
          </button>
          <h1 className="truncate text-base font-semibold">{board?.name}</h1>
        </div>
      </AppHeader>

      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-slate-900/80 px-4 py-2">
        <button
          onClick={addNote}
          className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-amber-300"
        >
          + Add note
        </button>
        <button
          onClick={() => setShowMembers(true)}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
        >
          👥 Members
        </button>
        <span className="ml-auto text-xs text-slate-500">
          {notes.length} note{notes.length === 1 ? '' : 's'}
        </span>
      </div>

      {error && (
        <p className="bg-red-500/10 px-4 py-1.5 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* Canvas */}
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-auto bg-slate-950/40"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        {/* Large scrollable surface so notes can be spread out. */}
        <div className="relative" style={{ width: 3000, height: 2000 }}>
          {notes.length === 0 && (
            <div className="pointer-events-none absolute left-1/2 top-40 -translate-x-1/2 text-center text-slate-500">
              <p className="text-lg">This board is empty.</p>
              <p className="text-sm">Click “+ Add note” to pin your first note.</p>
            </div>
          )}
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              canEdit={note.author_id === user?.id}
              authorName={authorNames[note.author_id] ?? 'Someone'}
              onMove={handleMove}
              onBringToFront={handleBringToFront}
              onPatch={handlePatch}
              onDelete={handleDelete}
            />
          ))}
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
