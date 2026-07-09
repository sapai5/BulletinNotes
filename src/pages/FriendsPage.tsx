import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { UserPlus, Check, X, Clock, UserMinus, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { usePresence } from '../context/PresenceContext'
import { useUI } from '../context/UIContext'
import type { Friendship, FriendEntry, Profile } from '../types'
import AppHeader from '../components/AppHeader'
import Avatar from '../components/Avatar'
import Spinner from '../components/Spinner'

export default function FriendsPage() {
  const { user } = useAuth()
  const { isOnline } = usePresence()
  const { confirm } = useUI()
  const [entries, setEntries] = useState<FriendEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setError(null)

    const { data: rows, error: fErr } = await supabase
      .from('friendships')
      .select('*')
      .order('created_at', { ascending: false })

    if (fErr) {
      setError(fErr.message)
      setLoading(false)
      return
    }

    const friendships = (rows ?? []) as Friendship[]
    // The "other person" for each friendship.
    const otherIds = friendships.map((f) =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id,
    )

    let profilesById: Record<string, Profile> = {}
    if (otherIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('*')
        .in('id', otherIds)
      profilesById = Object.fromEntries(
        (profs ?? []).map((p) => [(p as Profile).id, p as Profile]),
      )
    }

    const mapped: FriendEntry[] = friendships
      .map((f) => {
        const otherId =
          f.requester_id === user.id ? f.addressee_id : f.requester_id
        const profile = profilesById[otherId]
        if (!profile) return null
        const direction: FriendEntry['direction'] =
          f.status === 'accepted'
            ? 'friend'
            : f.requester_id === user.id
              ? 'outgoing'
              : 'incoming'
        return {
          friendshipId: f.id,
          status: f.status,
          direction,
          profile,
        }
      })
      .filter((x): x is FriendEntry => x !== null)

    setEntries(mapped)
    setLoading(false)
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  // Live-refresh when friendships change for this user.
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`friendships-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        () => load(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, load])

  async function addFriend(e: FormEvent) {
    e.preventDefault()
    const target = email.trim()
    if (!target) return
    setBusy(true)
    setError(null)
    setInfo(null)
    const { error } = await supabase.rpc('send_friend_request_by_email', {
      _email: target,
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setInfo(`Request sent to ${target}`)
    setEmail('')
    load()
  }

  async function accept(entry: FriendEntry) {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', entry.friendshipId)
    if (error) setError(error.message)
    else load()
  }

  async function removeFriendship(entry: FriendEntry) {
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', entry.friendshipId)
    if (error) setError(error.message)
    else load()
  }

  const incoming = entries.filter((e) => e.direction === 'incoming')
  const outgoing = entries.filter((e) => e.direction === 'outgoing')
  const friends = entries
    .filter((e) => e.direction === 'friend')
    .sort((a, b) => {
      // Online friends first.
      const ao = isOnline(a.profile.id) ? 0 : 1
      const bo = isOnline(b.profile.id) ? 0 : 1
      return ao - bo
    })

  return (
    <div className="min-h-full bg-gradient-to-br from-cream via-bubble/30 to-sky/30 text-ink">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-1 font-display text-3xl font-bold">Friends</h1>
        <p className="mb-6 font-body font-semibold text-ink/60">
          Add pals by email and see who's online right now.
        </p>

        <form onSubmit={addFriend} className="mb-6 flex flex-col gap-3 sm:flex-row">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Friend's email…"
            className="flex-1 rounded-2xl border-2 border-ink bg-white px-4 py-3 font-body font-semibold text-ink placeholder-ink/40 shadow-pop-sm focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="btn-pop bg-coral px-5 py-3 text-white"
          >
            <UserPlus className="h-5 w-5" strokeWidth={2.5} />
            Add friend
          </button>
        </form>

        {error && (
          <p className="mb-4 rounded-2xl border-2 border-ink/10 bg-coral/20 px-4 py-2 font-body font-semibold">
            {error}
          </p>
        )}
        {info && (
          <p className="mb-4 rounded-2xl border-2 border-ink/10 bg-mint/40 px-4 py-2 font-body font-semibold">
            {info}
          </p>
        )}

        {loading ? (
          <div className="py-16">
            <Spinner label="Loading friends…" />
          </div>
        ) : (
          <div className="space-y-8">
            {incoming.length > 0 && (
              <Section title="Friend requests" count={incoming.length}>
                {incoming.map((e) => (
                  <Row key={e.friendshipId} entry={e} online={isOnline(e.profile.id)}>
                    <button
                      onClick={() => accept(e)}
                      className="btn-pop bg-mint px-3 py-1.5 text-sm"
                      title="Accept"
                    >
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </button>
                    <button
                      onClick={() => removeFriendship(e)}
                      className="btn-pop bg-white px-3 py-1.5 text-sm"
                      title="Decline"
                    >
                      <X className="h-4 w-4" strokeWidth={3} />
                    </button>
                  </Row>
                ))}
              </Section>
            )}

            {outgoing.length > 0 && (
              <Section title="Sent requests" count={outgoing.length}>
                {outgoing.map((e) => (
                  <Row key={e.friendshipId} entry={e} online={isOnline(e.profile.id)}>
                    <span className="flex items-center gap-1 font-display text-xs font-bold text-ink/50">
                      <Clock className="h-4 w-4" strokeWidth={2.5} />
                      Pending
                    </span>
                    <button
                      onClick={() => removeFriendship(e)}
                      className="btn-pop bg-white px-3 py-1.5 text-sm"
                      title="Cancel request"
                    >
                      <X className="h-4 w-4" strokeWidth={3} />
                    </button>
                  </Row>
                ))}
              </Section>
            )}

            <Section title="Your friends" count={friends.length}>
              {friends.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-blob border-4 border-dashed border-ink/20 py-12 text-center">
                  <Users className="h-9 w-9 text-coral" />
                  <p className="font-display font-semibold text-ink/60">
                    No friends yet — add someone above!
                  </p>
                </div>
              ) : (
                friends.map((e) => (
                  <Row key={e.friendshipId} entry={e} online={isOnline(e.profile.id)}>
                    <span
                      className={`font-display text-xs font-bold ${
                        isOnline(e.profile.id)
                          ? 'text-emerald-600'
                          : 'text-ink/40'
                      }`}
                    >
                      {isOnline(e.profile.id) ? 'Online' : 'Offline'}
                    </span>
                    <button
                      onClick={async () => {
                        if (
                          await confirm({
                            title: `Remove ${
                              e.profile.display_name || e.profile.email
                            }?`,
                            message: "You'll need to add them again to reconnect.",
                            confirmText: 'Unfriend',
                            danger: true,
                          })
                        )
                          removeFriendship(e)
                      }}
                      className="btn-pop bg-white px-3 py-1.5 text-sm"
                      title="Unfriend"
                    >
                      <UserMinus className="h-4 w-4" strokeWidth={2.5} />
                    </button>
                  </Row>
                ))
              )}
            </Section>
          </div>
        )}
      </main>
    </div>
  )
}

function Section({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-bold text-ink/80">
        {title}{' '}
        <span className="rounded-full bg-ink/10 px-2 py-0.5 text-sm">
          {count}
        </span>
      </h2>
      <ul className="space-y-2">{children}</ul>
    </section>
  )
}

function Row({
  entry,
  online,
  children,
}: {
  entry: FriendEntry
  online: boolean
  children: React.ReactNode
}) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border-2 border-ink/15 bg-white/70 px-3 py-2.5">
      <Avatar
        name={entry.profile.display_name || entry.profile.email}
        avatarUrl={entry.profile.avatar_url}
        size={44}
        online={online}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display font-bold">
          {entry.profile.display_name || entry.profile.email}
        </p>
        <p className="truncate font-body text-xs font-semibold text-ink/50">
          {entry.profile.email}
        </p>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </li>
  )
}
