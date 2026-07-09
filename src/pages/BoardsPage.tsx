import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus,
  StickyNote,
  Crown,
  Users,
  Trash2,
  LogOut,
  Sparkles,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useUI } from '../context/UIContext'
import type { BoardWithRole } from '../types'
import Spinner from '../components/Spinner'
import AppHeader from '../components/AppHeader'

// Rotating set of pastel backgrounds so each board card feels unique.
const CARD_TINTS = [
  'bg-lemon',
  'bg-mint',
  'bg-bubble',
  'bg-sky',
  'bg-grape',
  'bg-peach',
]

export default function BoardsPage() {
  const { user } = useAuth()
  const { confirm, toast } = useUI()
  const [boards, setBoards] = useState<BoardWithRole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const loadBoards = useCallback(async () => {
    if (!user) return
    setError(null)
    // Only MY membership rows. Without this filter, RLS also returns other
    // members of boards I belong to, which would duplicate boards in the list.
    const { data, error } = await supabase
      .from('board_members')
      .select('role, board:boards(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const rows = (data ?? [])
      .filter((r) => r.board)
      .map((r) => {
        const board = r.board as unknown as {
          id: string
          name: string
          owner_id: string
          created_at: string
        }
        return { ...board, role: r.role } as BoardWithRole
      })
    setBoards(rows)
    setLoading(false)
  }, [user])

  useEffect(() => {
    loadBoards()
  }, [loadBoards])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    setError(null)
    const { error } = await supabase.rpc('create_board', { _name: name })
    setCreating(false)
    if (error) {
      setError(error.message)
      return
    }
    setNewName('')
    loadBoards()
  }

  async function handleDelete(board: BoardWithRole) {
    const ok = await confirm({
      title: `Delete "${board.name}"?`,
      message:
        'This removes all its notes for everyone and cannot be undone.',
      confirmText: 'Delete',
      danger: true,
    })
    if (!ok) return
    const { error } = await supabase.from('boards').delete().eq('id', board.id)
    if (error) {
      toast(error.message, 'error')
      return
    }
    toast('Board deleted', 'success')
    loadBoards()
  }

  async function handleLeave(board: BoardWithRole) {
    const ok = await confirm({
      title: `Leave "${board.name}"?`,
      message: "You'll lose access until someone invites you again.",
      confirmText: 'Leave',
      danger: true,
    })
    if (!ok) return
    const { error } = await supabase
      .from('board_members')
      .delete()
      .eq('board_id', board.id)
      .eq('user_id', user!.id)
    if (error) {
      toast(error.message, 'error')
      return
    }
    toast('Left board', 'success')
    loadBoards()
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-cream via-bubble/30 to-sky/30 text-ink">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-1 font-display text-3xl font-bold">Your boards</h1>
        <p className="mb-6 flex items-center gap-1.5 font-body font-semibold text-ink/60">
          Make a board, then invite pals to pin notes together
          <Sparkles className="h-4 w-4 text-coral" strokeWidth={2.5} />
        </p>

        <form
          onSubmit={handleCreate}
          className="mb-8 flex flex-col gap-3 sm:flex-row"
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New board name…"
            maxLength={120}
            className="flex-1 rounded-2xl border-2 border-ink bg-white px-4 py-3 font-body font-semibold text-ink placeholder-ink/40 shadow-pop-sm focus:-translate-y-0.5 focus:shadow-pop focus:outline-none"
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="btn-pop bg-coral px-5 py-3 text-white"
          >
            <Plus className="h-5 w-5" strokeWidth={3} />
            {creating ? 'Creating…' : 'Create board'}
          </button>
        </form>

        {error && (
          <p className="mb-4 rounded-2xl border-2 border-ink/10 bg-coral/20 px-4 py-2 font-body font-semibold">
            {error}
          </p>
        )}

        {loading ? (
          <div className="py-16">
            <Spinner label="Loading boards…" />
          </div>
        ) : boards.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-blob border-4 border-dashed border-ink/20 py-16 text-center">
            <Sparkles className="h-10 w-10 text-coral animate-float" />
            <p className="font-display text-lg font-semibold text-ink/70">
              No boards yet — create your first one above!
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {boards.map((board, i) => {
              const isOwner = board.role === 'owner'
              const tint = CARD_TINTS[i % CARD_TINTS.length]
              return (
                <li
                  key={board.id}
                  className={`group relative rounded-blob border-2 border-ink ${tint} p-5 shadow-pop transition hover:-translate-y-1 hover:rotate-1 hover:shadow-pop-lg`}
                >
                  <Link to={`/boards/${board.id}`} className="block">
                    <div className="mb-8 flex items-start justify-between">
                      <span className="flex h-11 w-11 -rotate-6 items-center justify-center rounded-2xl border-2 border-ink bg-white shadow-pop-sm">
                        <StickyNote
                          className="h-6 w-6 text-ink"
                          strokeWidth={2.5}
                        />
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-white px-2.5 py-1 font-display text-xs font-bold">
                        {isOwner ? (
                          <>
                            <Crown
                              className="h-3.5 w-3.5 text-coral"
                              strokeWidth={2.5}
                            />
                            Owner
                          </>
                        ) : (
                          <>
                            <Users
                              className="h-3.5 w-3.5"
                              strokeWidth={2.5}
                            />
                            Member
                          </>
                        )}
                      </span>
                    </div>
                    <h2 className="truncate font-display text-xl font-bold">
                      {board.name}
                    </h2>
                  </Link>
                  <button
                    onClick={() =>
                      isOwner ? handleDelete(board) : handleLeave(board)
                    }
                    className="mt-3 inline-flex items-center gap-1 font-body text-xs font-bold text-ink/50 hover:text-coral"
                  >
                    {isOwner ? (
                      <>
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                        Delete board
                      </>
                    ) : (
                      <>
                        <LogOut className="h-3.5 w-3.5" strokeWidth={2.5} />
                        Leave board
                      </>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </div>
  )
}
