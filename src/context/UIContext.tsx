import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  X,
} from 'lucide-react'

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  message: string
  kind: ToastKind
}

interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

interface UIContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  toast: (message: string, kind?: ToastKind) => void
}

const UIContext = createContext<UIContextValue | undefined>(undefined)

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
      setDialog(opts)
    })
  }, [])

  const closeDialog = useCallback((result: boolean) => {
    resolver.current?.(result)
    resolver.current = null
    setDialog(null)
  }, [])

  const toast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = uid()
    setToasts((t) => [...t, { id, message, kind }])
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
    }, 4200)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const value = useMemo<UIContextValue>(() => ({ confirm, toast }), [
    confirm,
    toast,
  ])

  return (
    <UIContext.Provider value={value}>
      {children}

      {/* Confirm modal */}
      {dialog && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
          onClick={() => closeDialog(false)}
        >
          <div
            className="w-full max-w-sm animate-pop rounded-blob border-2 border-ink bg-cream p-6 text-ink shadow-pop-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start gap-3">
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-2 border-ink shadow-pop-sm ${
                  dialog.danger ? 'bg-coral text-white' : 'bg-lemon text-ink'
                }`}
              >
                <AlertTriangle className="h-6 w-6" strokeWidth={2.5} />
              </span>
              <div className="min-w-0 pt-1">
                <h2 className="font-display text-lg font-bold leading-tight">
                  {dialog.title}
                </h2>
              </div>
            </div>
            {dialog.message && (
              <p className="mb-5 font-body font-semibold text-ink/70">
                {dialog.message}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => closeDialog(false)}
                className="btn-pop bg-white px-4 py-2 text-sm"
              >
                {dialog.cancelText ?? 'Cancel'}
              </button>
              <button
                autoFocus
                onClick={() => closeDialog(true)}
                className={`btn-pop px-4 py-2 text-sm text-white ${
                  dialog.danger ? 'bg-coral' : 'bg-sky !text-ink'
                }`}
              >
                {dialog.confirmText ?? 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast stack */}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[10001] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={() => dismissToast(t.id)} />
        ))}
      </div>
    </UIContext.Provider>
  )
}

const TOAST_STYLES: Record<
  ToastKind,
  { bg: string; icon: typeof Info }
> = {
  success: { bg: 'bg-mint', icon: CheckCircle2 },
  error: { bg: 'bg-coral', icon: XCircle },
  info: { bg: 'bg-sky', icon: Info },
}

function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastItem
  onDismiss: () => void
}) {
  const { bg, icon: Icon } = TOAST_STYLES[toast.kind]
  return (
    <div
      className={`pointer-events-auto flex w-full max-w-sm animate-pop items-center gap-2 rounded-2xl border-2 border-ink ${bg} px-4 py-3 text-ink shadow-pop`}
    >
      <Icon className="h-5 w-5 shrink-0" strokeWidth={2.5} />
      <span className="flex-1 font-body text-sm font-bold">{toast.message}</span>
      <button
        onClick={onDismiss}
        className="shrink-0 text-ink/60 hover:text-ink"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" strokeWidth={3} />
      </button>
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUI() {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI must be used within a UIProvider')
  return ctx
}
