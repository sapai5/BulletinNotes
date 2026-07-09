import { Pencil, Move, Scaling } from 'lucide-react'
import type { GhostActivity } from '../types'

const GHOST_COLORS = [
  '#ff8fab',
  '#8ac6ff',
  '#7ee0a0',
  '#c79bff',
  '#ffb15e',
  '#ff6b9d',
]

function colorFor(userId: string) {
  let h = 0
  for (let i = 0; i < userId.length; i++)
    h = (h * 31 + userId.charCodeAt(i)) % 997
  return GHOST_COLORS[h % GHOST_COLORS.length]
}

const KIND_ICON = {
  creating: Pencil,
  editing: Pencil,
  moving: Move,
  resizing: Scaling,
} as const

export default function GhostNote({ ghost }: { ghost: GhostActivity }) {
  const color = colorFor(ghost.userId)
  const Icon = KIND_ICON[ghost.kind] ?? Pencil

  return (
    <div
      className="pointer-events-none absolute z-[9998] rounded-2xl border-2 border-dashed p-3 pt-5 opacity-70 transition-all duration-150"
      style={{
        left: ghost.x,
        top: ghost.y,
        width: ghost.width,
        height: ghost.height,
        backgroundColor: ghost.color,
        borderColor: color,
        boxShadow: `0 0 0 3px ${color}55`,
      }}
    >
      {/* Name tag */}
      <div
        className="absolute -top-3 left-2 flex items-center gap-1 rounded-full border-2 border-white px-2 py-0.5 font-display text-[11px] font-bold text-white shadow"
        style={{ backgroundColor: color }}
      >
        <Icon className="h-3 w-3" strokeWidth={3} />
        {ghost.name}
      </div>
      <p className="h-full overflow-hidden whitespace-pre-wrap break-words font-body text-sm font-semibold text-ink/80">
        {ghost.text}
      </p>
    </div>
  )
}
