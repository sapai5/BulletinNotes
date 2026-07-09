import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { BoardMember, Profile } from '../types'

interface Props {
  boardId: string
  isOwner: boolean
  currentUserId: string
  onClose: () => void
}

interface MemberRow extends Omit<BoardMember, 'profile'> {
  profile: Profile | null
}

export default function MembersDialog({
  boardId,
  isOwner,
  currentUserId,
  onClose,
}: Props) {
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('board_members')
      .select('board_id, user_id, role, created_at, profile:profiles(*)')
      .eq('board_id', boardId)
    if (error) {
      setError(error.message)
    } else {
      setMembers(
        (data ?? []).map((m) => ({
          ...(m as unknown as BoardMember),
          profile: (m.profile as unknown as Profile) ?? null,
        })),
      )
    }
    setLoading(false)
  }, [boardId])

  useEffect(() => {
    load()
  }, [load])

  async function invite(e: FormEvent) {
    e.preventDefault()
    const target = email.trim()
    if (!target) return
    setBusy(true)
    setError(null)
    setInfo(null)
    const { error } = await supabase.rpc('invite_member_by_email', {
      _board_id: boardId,
      _email: target,
      _role: 'editor',
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setInfo(`Added ${target}`)
    setEmail('')
    load()
  }

  async function remove(userId: string) {
    if (!confirm('Remove this member from the board?')) return
    const { error } = await supabase
      .from('board_members')
      .delete()
      .eq('board_id', boardId)
      .eq('user_id', userId)
    if (error) {
      setError(error.message)
      return
    }
    load()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-slate-800 p-6 text-white ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Members</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {isOwner && (
          <form onSubmit={invite} className="mb-4 flex gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Invite by email…"
              className="flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm placeholder-slate-500 focus:border-amber-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-300 disabled:opacity-50"
            >
              Invite
            </button>
          </form>
        )}

        {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
        {info && <p className="mb-2 text-sm text-emerald-400">{info}</p>}
        {isOwner && (
          <p className="mb-3 text-xs text-slate-500">
            The person must have signed up at least once before you can invite
            them.
          </p>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li
                key={m.user_id}
                className="flex items-center justify-between rounded-lg bg-slate-900/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    {m.profile?.display_name || m.profile?.email || m.user_id}
                    {m.user_id === currentUserId && (
                      <span className="text-slate-500"> (you)</span>
                    )}
                  </p>
                  {m.profile?.email && (
                    <p className="truncate text-xs text-slate-500">
                      {m.profile.email}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      m.role === 'owner'
                        ? 'bg-amber-400/20 text-amber-300'
                        : 'bg-sky-400/20 text-sky-300'
                    }`}
                  >
                    {m.role}
                  </span>
                  {isOwner && m.role !== 'owner' && (
                    <button
                      onClick={() => remove(m.user_id)}
                      className="text-xs text-slate-500 hover:text-red-400"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
