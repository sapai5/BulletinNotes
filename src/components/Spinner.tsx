import { Loader2 } from 'lucide-react'

export default function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-ink">
      <Loader2 className="h-9 w-9 animate-spin text-coral" strokeWidth={2.5} />
      {label && (
        <span className="font-display text-sm font-semibold">{label}</span>
      )}
    </div>
  )
}
