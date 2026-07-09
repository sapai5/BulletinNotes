import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

interface PresenceContextValue {
  onlineIds: Set<string>
  isOnline: (userId: string) => boolean
}

const PresenceContext = createContext<PresenceContextValue | undefined>(
  undefined,
)

// A single global channel that every signed-in client joins so we can tell who
// is currently online. Presence is ephemeral and maintained by Supabase.
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!user) {
      setOnlineIds(new Set())
      return
    }

    const channel = supabase.channel('online-users', {
      config: { presence: { key: user.id } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        setOnlineIds(new Set(Object.keys(state)))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString() })
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  const value = useMemo<PresenceContextValue>(
    () => ({
      onlineIds,
      isOnline: (id: string) => onlineIds.has(id),
    }),
    [onlineIds],
  )

  return (
    <PresenceContext.Provider value={value}>
      {children}
    </PresenceContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePresence() {
  const ctx = useContext(PresenceContext)
  if (!ctx) throw new Error('usePresence must be used within a PresenceProvider')
  return ctx
}
