import { Link, NavLink } from 'react-router-dom'
import { Pin, LogOut, Users, LayoutGrid } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import Avatar from './Avatar'

export default function AppHeader({
  children,
}: {
  children?: React.ReactNode
}) {
  const { user, signOut } = useAuth()
  const { profile } = useProfile()

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 font-display text-sm font-bold transition ${
      isActive
        ? 'border-ink bg-coral text-white shadow-pop-sm'
        : 'border-transparent text-ink/60 hover:text-ink'
    }`

  return (
    <header className="sticky top-0 z-40 flex items-center gap-2 border-b-2 border-ink/10 bg-cream/90 px-4 py-3 backdrop-blur">
      <Link
        to="/"
        className="flex items-center gap-2 font-display text-lg font-bold text-ink"
      >
        <span className="flex h-9 w-9 -rotate-6 items-center justify-center rounded-2xl border-2 border-ink bg-coral shadow-pop-sm">
          <Pin className="h-5 w-5 text-white" strokeWidth={2.5} />
        </span>
        <span className="hidden sm:inline">Bulletin</span>
      </Link>

      <nav className="ml-2 flex items-center gap-1">
        <NavLink to="/" end className={navClass}>
          <LayoutGrid className="h-4 w-4" strokeWidth={2.5} />
          <span className="hidden sm:inline">Boards</span>
        </NavLink>
        <NavLink to="/friends" className={navClass}>
          <Users className="h-4 w-4" strokeWidth={2.5} />
          <span className="hidden sm:inline">Friends</span>
        </NavLink>
      </nav>

      <div className="flex-1">{children}</div>

      <Link
        to="/profile"
        title="Your profile"
        className="flex items-center gap-2 rounded-full border-2 border-ink bg-white py-1 pl-1 pr-3 shadow-pop-sm transition hover:-translate-y-0.5"
      >
        <Avatar
          name={profile?.display_name || user?.email || '?'}
          avatarUrl={profile?.avatar_url}
          size={28}
          ring={false}
        />
        <span className="hidden max-w-[8rem] truncate font-display text-sm font-bold text-ink sm:inline">
          {profile?.display_name || user?.email}
        </span>
      </Link>

      <button
        onClick={() => signOut()}
        className="btn-pop bg-white px-2.5 py-2"
        title="Sign out"
      >
        <LogOut className="h-4 w-4" strokeWidth={2.5} />
      </button>
    </header>
  )
}
