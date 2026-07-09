import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { X, UserPlus, Crown, Users, Info } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useUI } from '../context/UIContext'
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
  const { confirm } = useUI()
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('board_members')
      .select('board_id, user_id, role, created_at')
      .eq('board_id', boardId)
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    const base = (data ?? []) as unknown as BoardMember[]
    const ids = base.map((m) => m.user_id)

    let profilesById: Record<string, Profile> = {}
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('*')
        .in('id', ids)
      profilesById = Object.fromEntries(
        (profs ?? []).map((p) => [(p as Profile).id, p as Profile]),
      )
    }

    setMembers(
      base.map((m) => ({ ...m, profile: profilesById[m.user_id] ?? null })),
    )
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
    const ok = await confirm({
      title: 'Remove this member?',
      message: "They'll lose access to this board.",
      confirmText: 'Remove',
      danger: true,
    })
    if (!ok) return
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md animate-pop rounded-blob border-2 border-ink bg-cream p-6 text-ink shadow-pop-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold">
            <Users className="h-5 w-5 text-coral" strokeWidth={2.5} />
            Members
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink bg-white shadow-pop-sm transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
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
              className="flex-1 rounded-2xl border-2 border-ink bg-white px-3 py-2 font-body text-sm font-semibold placeholder-ink/40 shadow-pop-sm focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="btn-pop bg-coral px-4 py-2 text-sm text-white"
            >
              <UserPlus className="h-4 w-4" strokeWidth={2.5} />
              Invite
            </button>
          </form>
        )}

        {error && (
          <p className="mb-2 rounded-2xl border-2 border-ink/10 bg-coral/20 px-3 py-2 font-body text-sm font-semibold">
            {error}
          </p>
        )}
        {info && (
          <p className="mb-2 rounded-2xl border-2 border-ink/10 bg-mint/40 px-3 py-2 font-body text-sm font-semibold">
            {info}
          </p>
        )}
        {isOwner && (
          <p className="mb-3 flex items-start gap-1.5 font-body text-xs font-semibold text-ink/50">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
            The person must have signed up at least once before you can invite
            them.
          </p>
        )}

        {loading ? (
          <p className="font-body text-sm font-semibold text-ink/50">Loading…</p>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li
                key={m.user_id}
                className="flex items-center justify-between rounded-2xl border-2 border-ink/15 bg-white/70 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-bold">
                    {m.profile?.display_name || m.profile?.email || m.user_id}
                    {m.user_id === currentUserId && (
                      <span className="font-body font-semibold text-ink/40">
                        {' '}
                        (you)
                      </span>
                    )}
                  </p>
                  {m.profile?.email && (
                    <p className="truncate font-body text-xs font-semibold text-ink/50">
                      {m.profile.email}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border-2 border-ink/60 bg-white px-2 py-0.5 font-display text-xs font-bold">
                    {m.role === 'owner' ? (
                      <>
                        <Crown
                          className="h-3.5 w-3.5 text-coral"
                          strokeWidth={2.5}
                        />
                        owner
                      </>
                    ) : (
                      'editor'
                    )}
                  </span>
                  {isOwner && m.role !== 'owner' && (
                    <button
                      onClick={() => remove(m.user_id)}
                      className="font-body text-xs font-bold text-ink/40 hover:text-coral"
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
