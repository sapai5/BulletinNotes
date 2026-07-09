import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { ProfileProvider } from './context/ProfileContext'
import { PresenceProvider } from './context/PresenceContext'
import AuthPage from './pages/AuthPage'
import BoardsPage from './pages/BoardsPage'
import BoardPage from './pages/BoardPage'
import ProfilePage from './pages/ProfilePage'
import FriendsPage from './pages/FriendsPage'
import Spinner from './components/Spinner'

export default function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-cream">
        <Spinner label="Loading…" />
      </div>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<AuthPage />} />
      </Routes>
    )
  }

  return (
    <ProfileProvider>
      <PresenceProvider>
        <Routes>
          <Route path="/" element={<BoardsPage />} />
          <Route path="/boards/:boardId" element={<BoardPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PresenceProvider>
    </ProfileProvider>
  )
}
