import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { BoardWithRole } from '../types'
import Spinner from '../components/Spinner'
import AppHeader from '../components/AppHeader'

export default function BoardsPage() {
  const { user } = useAuth()
  const [boards, setBoards] = useState<BoardWithRole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const loadBoards = useCallback(async () => {
    setError(null)
    // Fetch memberships joined with their board rows.
    const { data, error } = await supabase
      .from('board_members')
      .select('role, board:boards(*)')
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
  }, [])

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
    if (
      !confirm(
        `Delete board "${board.name}"? This removes all its notes for everyone and cannot be undone.`,
      )
    )
      return
    const { error } = await supabase.from('boards').delete().eq('id', board.id)
    if (error) {
      setError(error.message)
      return
    }
    loadBoards()
  }

  async function handleLeave(board: BoardWithRole) {
    if (!confirm(`Leave board "${board.name}"?`)) return
    const { error } = await supabase
      .from('board_members')
      .delete()
      .eq('board_id', board.id)
      .eq('user_id', user!.id)
    if (error) {
      setError(error.message)
      return
    }
    loadBoards()
  }

  return (
    <div className="min-h-full bg-slate-900 text-white">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-1 text-2xl font-bold">Your boards</h1>
        <p className="mb-6 text-sm text-slate-400">
          Create a board, then invite people to pin notes together.
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
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm placeholder-slate-500 focus:border-amber-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-300 disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create board'}
          </button>
        </form>

        {error && (
          <p className="mb-4 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        {loading ? (
          <div className="py-16">
            <Spinner label="Loading boards…" />
          </div>
        ) : boards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 py-16 text-center text-slate-400">
            No boards yet. Create your first one above.
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {boards.map((board) => {
              const isOwner = board.role === 'owner'
              return (
                <li
                  key={board.id}
                  className="group relative rounded-xl bg-slate-800 p-5 ring-1 ring-white/5 transition hover:ring-amber-400/40"
                >
                  <Link to={`/boards/${board.id}`} className="block">
                    <div className="mb-8 flex items-start justify-between">
                      <span className="text-2xl">📋</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          isOwner
                            ? 'bg-amber-400/20 text-amber-300'
                            : 'bg-sky-400/20 text-sky-300'
                        }`}
                      >
                        {isOwner ? 'Owner' : 'Member'}
                      </span>
                    </div>
                    <h2 className="truncate text-lg font-semibold">
                      {board.name}
                    </h2>
                  </Link>
                  <button
                    onClick={() =>
                      isOwner ? handleDelete(board) : handleLeave(board)
                    }
                    className="mt-3 text-xs text-slate-500 hover:text-red-400"
                  >
                    {isOwner ? 'Delete board' : 'Leave board'}
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
