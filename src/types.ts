// Domain types shared across the app. These mirror the Supabase schema
// defined in supabase/schema.sql.

export interface Profile {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
}

export type BoardRole = 'owner' | 'editor'

export interface Board {
  id: string
  name: string
  owner_id: string
  created_at: string
}

export interface BoardMember {
  board_id: string
  user_id: string
  role: BoardRole
  created_at: string
  // Joined profile info (populated by some queries).
  profile?: Profile
}

export type NoteKind = 'note' | 'drawing'

// A freeform pen stroke on a drawing note. Points are normalized (0..1)
// relative to the drawing surface, stored flat: [x0, y0, x1, y1, ...].
export interface Stroke {
  color: string
  width: number
  pts: number[]
}

export interface Note {
  id: string
  board_id: string
  author_id: string
  text: string
  color: string
  tags: string[]
  image_url: string | null
  kind: NoteKind
  strokes: Stroke[]
  // Freeform position + size on the canvas, in pixels.
  x: number
  y: number
  width: number
  height: number
  z_index: number
  created_at: string
  updated_at: string
}

// A board plus the caller's role in it, as returned by the boards list query.
export interface BoardWithRole extends Board {
  role: BoardRole
}

export type FriendshipStatus = 'pending' | 'accepted'

export interface Friendship {
  id: string
  requester_id: string
  addressee_id: string
  status: FriendshipStatus
  created_at: string
}

// A friendship row joined with the *other* person's profile, plus a computed
// direction so the UI knows whether a pending request is incoming or outgoing.
export interface FriendEntry {
  friendshipId: string
  status: FriendshipStatus
  direction: 'incoming' | 'outgoing' | 'friend'
  profile: Profile
}

// Live activity broadcast over a board's realtime channel (ephemeral).
export interface GhostActivity {
  userId: string
  name: string
  avatarUrl: string | null
  noteId: string
  x: number
  y: number
  width: number
  height: number
  color: string
  text: string
  kind: 'creating' | 'editing' | 'moving' | 'resizing'
  at: number
}
