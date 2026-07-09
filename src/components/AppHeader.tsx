import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function AppHeader({
  children,
}: {
  children?: React.ReactNode
}) {
  const { user, signOut } = useAuth()

  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-white/10 bg-slate-900/80 px-4 py-3 backdrop-blur">
      <Link to="/" className="flex items-center gap-2 font-semibold text-white">
        <span className="text-xl">📌</span>
        <span className="hidden sm:inline">Bulletin Board</span>
      </Link>

      <div className="flex-1">{children}</div>

      <span className="hidden max-w-[12rem] truncate text-sm text-slate-400 sm:inline">
        {user?.email}
      </span>
      <button
        onClick={() => signOut()}
        className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800"
      >
        Sign out
      </button>
    </header>
  )
}
