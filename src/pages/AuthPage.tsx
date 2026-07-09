import { useState, type FormEvent } from 'react'
import { Pin, Mail, Lock, User, Sparkles } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

type Mode = 'signin' | 'signup'

export default function AuthPage() {
  const { signInWithPassword, signUpWithPassword, signInWithGoogle } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      if (mode === 'signin') {
        await signInWithPassword(email, password)
      } else {
        const { needsConfirmation } = await signUpWithPassword(
          email,
          password,
          displayName.trim() || email.split('@')[0],
        )
        if (needsConfirmation) {
          setInfo('Check your inbox to confirm your email, then sign in.')
          setMode('signin')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogle() {
    setError(null)
    setBusy(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-peach via-bubble to-sky p-4">
      {/* floating decorative blobs */}
      <div className="pointer-events-none absolute left-10 top-16 h-24 w-24 rotate-12 rounded-blob bg-lemon/70 shadow-pop animate-float" />
      <div className="pointer-events-none absolute bottom-16 right-12 h-20 w-20 -rotate-6 rounded-blob bg-mint/70 shadow-pop animate-float [animation-delay:1s]" />

      <div className="relative w-full max-w-sm animate-pop rounded-blob border-2 border-ink bg-cream p-8 shadow-pop-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 -rotate-6 items-center justify-center rounded-3xl border-2 border-ink bg-coral shadow-pop">
            <Pin className="h-8 w-8 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">
            Bulletin Board Notes
          </h1>
          <p className="mt-1 font-body text-sm font-semibold text-ink/60">
            {mode === 'signin'
              ? 'Welcome back! Sign in to your boards'
              : 'Join the fun — make your account'}
          </p>
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          className="btn-pop mb-4 w-full bg-white px-4 py-3 text-sm"
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <div className="mb-4 flex items-center gap-3 font-display text-xs font-semibold text-ink/40">
          <div className="h-0.5 flex-1 rounded-full bg-ink/15" />
          or
          <div className="h-0.5 flex-1 rounded-full bg-ink/15" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'signup' && (
            <Field
              icon={<User className="h-4 w-4" strokeWidth={2.5} />}
              type="text"
              placeholder="Display name"
              value={displayName}
              onChange={setDisplayName}
            />
          )}
          <Field
            icon={<Mail className="h-4 w-4" strokeWidth={2.5} />}
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={setEmail}
          />
          <Field
            icon={<Lock className="h-4 w-4" strokeWidth={2.5} />}
            type="password"
            required
            minLength={6}
            placeholder="Password (min 6 chars)"
            value={password}
            onChange={setPassword}
          />

          {error && (
            <p className="rounded-2xl border-2 border-ink/10 bg-coral/20 px-3 py-2 font-body text-sm font-semibold text-ink">
              {error}
            </p>
          )}
          {info && (
            <p className="rounded-2xl border-2 border-ink/10 bg-mint/40 px-3 py-2 font-body text-sm font-semibold text-ink">
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn-pop w-full bg-coral px-4 py-3 text-base text-white"
          >
            <Sparkles className="h-4 w-4" strokeWidth={2.5} />
            {busy
              ? 'Please wait…'
              : mode === 'signin'
                ? 'Sign in'
                : 'Sign up'}
          </button>
        </form>

        <p className="mt-5 text-center font-body text-sm font-semibold text-ink/60">
          {mode === 'signin' ? "Don't have an account? " : 'Already have one? '}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setError(null)
              setInfo(null)
            }}
            className="font-display font-bold text-coral underline decoration-wavy underline-offset-2 hover:text-ink"
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}

function Field({
  icon,
  value,
  onChange,
  ...rest
}: {
  icon: React.ReactNode
  value: string
  onChange: (v: string) => void
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border-2 border-ink bg-white px-3 py-2.5 shadow-pop-sm focus-within:-translate-y-0.5 focus-within:shadow-pop">
      <span className="text-ink/50">{icon}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent font-body text-sm font-semibold text-ink placeholder-ink/40 focus:outline-none"
      />
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.42 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 6.68 9.14 4.75 12 4.75Z"
      />
    </svg>
  )
}
