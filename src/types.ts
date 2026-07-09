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

export interface Note {
  id: string
  board_id: string
  author_id: string
  text: string
  color: string
  tags: string[]
  image_url: string | null
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
