import { useEffect, useState } from 'react'

interface Props {
  name: string
  avatarUrl?: string | null
  size?: number
  online?: boolean
  ring?: boolean
}

// Deterministic pastel background from the name, used when there's no picture.
const TINTS = [
  '#ffb4a2',
  '#ffc8dd',
  '#b9fbc0',
  '#a2d2ff',
  '#cdb4db',
  '#fdffb6',
]

function tintFor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997
  return TINTS[h % TINTS.length]
}

export default function Avatar({
  name,
  avatarUrl,
  size = 40,
  online,
  ring = true,
}: Props) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [avatarUrl])
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase()
  const showImage = avatarUrl && !failed
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {showImage ? (
        <img
          src={avatarUrl}
          alt={name}
          onError={() => setFailed(true)}
          className={`h-full w-full rounded-full object-cover ${
            ring ? 'border-2 border-ink' : ''
          }`}
          draggable={false}
        />
      ) : (
        <span
          className={`flex h-full w-full items-center justify-center rounded-full font-display font-bold text-ink ${
            ring ? 'border-2 border-ink' : ''
          }`}
          style={{ backgroundColor: tintFor(name), fontSize: size * 0.45 }}
        >
          {initial}
        </span>
      )}
      {online !== undefined && (
        <span
          title={online ? 'Online' : 'Offline'}
          className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-white ${
            online ? 'bg-emerald-500' : 'bg-slate-400'
          }`}
          style={{ width: size * 0.3, height: size * 0.3 }}
        />
      )}
    </span>
  )
}
