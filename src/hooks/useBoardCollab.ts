import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import type { GhostActivity } from '../types'

export interface BoardViewer {
  userId: string
  name: string
  avatarUrl: string | null
}

// What NoteCard supplies; identity + timestamp are filled in by the hook.
export type ActivityInput = Omit<
  GhostActivity,
  'userId' | 'name' | 'avatarUrl' | 'at'
>

const GHOST_TTL_MS = 5000

/**
 * Board-scoped realtime collaboration:
 *  - presence: who is currently viewing this board (avatars)
 *  - broadcast: live "shadow" of notes others are editing/moving/resizing
 */
export function useBoardCollab(boardId: string | undefined) {
  const { user } = useAuth()
  const { profile } = useProfile()
  const [viewers, setViewers] = useState<BoardViewer[]>([])
  const [ghosts, setGhosts] = useState<Record<string, GhostActivity>>({})
  const channelRef = useRef<RealtimeChannel | null>(null)

  // Keep the latest identity in a ref so emit callbacks stay stable.
  const identity = useRef({
    id: '',
    name: 'Someone',
    avatarUrl: null as string | null,
  })
  identity.current = {
    id: user?.id ?? '',
    name: profile?.display_name || user?.email || 'Someone',
    avatarUrl: profile?.avatar_url ?? null,
  }

  useEffect(() => {
    if (!boardId || !user) return

    const channel = supabase.channel(`board-collab-${boardId}`, {
      config: { presence: { key: user.id } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{
          name: string
          avatar_url: string | null
        }>()
        const list: BoardViewer[] = Object.entries(state).map(
          ([userId, metas]) => ({
            userId,
            name: metas[0]?.name ?? 'Someone',
            avatarUrl: metas[0]?.avatar_url ?? null,
          }),
        )
        setViewers(list)
      })
      .on('broadcast', { event: 'activity' }, ({ payload }) => {
        const a = payload as GhostActivity
        if (a.userId === user.id) return
        setGhosts((prev) => ({ ...prev, [a.userId]: a }))
      })
      .on('broadcast', { event: 'activity_end' }, ({ payload }) => {
        const { userId } = payload as { userId: string }
        setGhosts((prev) => {
          const next = { ...prev }
          delete next[userId]
          return next
        })
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            name: identity.current.name,
            avatar_url: identity.current.avatarUrl,
            online_at: new Date().toISOString(),
          })
        }
      })

    channelRef.current = channel

    // Expire stale ghosts (in case an end event was missed).
    const prune = setInterval(() => {
      setGhosts((prev) => {
        const now = Date.now()
        let changed = false
        const next: Record<string, GhostActivity> = {}
        for (const [k, v] of Object.entries(prev)) {
          if (now - v.at < GHOST_TTL_MS) next[k] = v
          else changed = true
        }
        return changed ? next : prev
      })
    }, 1000)

    return () => {
      clearInterval(prune)
      supabase.removeChannel(channel)
      channelRef.current = null
      setViewers([])
      setGhosts({})
    }
  }, [boardId, user])

  const emitActivity = useCallback((input: ActivityInput) => {
    const channel = channelRef.current
    if (!channel) return
    const payload: GhostActivity = {
      ...input,
      userId: identity.current.id,
      name: identity.current.name,
      avatarUrl: identity.current.avatarUrl,
      at: Date.now(),
    }
    channel.send({ type: 'broadcast', event: 'activity', payload })
  }, [])

  const emitActivityEnd = useCallback(() => {
    const channel = channelRef.current
    if (!channel) return
    channel.send({
      type: 'broadcast',
      event: 'activity_end',
      payload: { userId: identity.current.id },
    })
  }, [])

  return { viewers, ghosts, emitActivity, emitActivityEnd }
}
