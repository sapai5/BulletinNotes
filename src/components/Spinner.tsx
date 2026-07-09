export default function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-slate-300">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-slate-200"
        role="status"
        aria-label={label ?? 'Loading'}
      />
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}
