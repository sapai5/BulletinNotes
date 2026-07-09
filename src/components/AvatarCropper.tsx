import { useCallback, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { ZoomIn, ZoomOut, Check, X, Loader2 } from 'lucide-react'

interface Props {
  imageSrc: string
  onCancel: () => void
  onCropped: (blob: Blob) => Promise<void> | void
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', (e) => reject(e))
    img.crossOrigin = 'anonymous'
    img.src = url
  })
}

// Crops the selected area to a square JPEG (capped at 512px) via canvas.
async function getCroppedBlob(imageSrc: string, crop: Area): Promise<Blob> {
  const image = await createImage(imageSrc)
  const outSize = Math.min(Math.round(crop.width), 512)
  const canvas = document.createElement('canvas')
  canvas.width = outSize
  canvas.height = outSize
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create canvas context')
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    outSize,
    outSize,
  )
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Crop failed'))),
      'image/jpeg',
      0.9,
    )
  })
}

export default function AvatarCropper({ imageSrc, onCancel, onCropped }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [areaPixels, setAreaPixels] = useState<Area | null>(null)
  const [saving, setSaving] = useState(false)

  const onCropComplete = useCallback((_area: Area, areaPx: Area) => {
    setAreaPixels(areaPx)
  }, [])

  async function handleSave() {
    if (!areaPixels) return
    setSaving(true)
    try {
      const blob = await getCroppedBlob(imageSrc, areaPixels)
      await onCropped(blob)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md animate-pop rounded-blob border-2 border-ink bg-cream p-5 shadow-pop-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">
            Crop your picture
          </h2>
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink bg-white shadow-pop-sm transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>

        {/* Cropper area */}
        <div className="relative h-72 w-full overflow-hidden rounded-2xl border-2 border-ink bg-slate-900">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        {/* Zoom control */}
        <div className="mt-4 flex items-center gap-3">
          <ZoomOut className="h-5 w-5 shrink-0 text-ink/60" strokeWidth={2.5} />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-ink/15 accent-coral"
          />
          <ZoomIn className="h-5 w-5 shrink-0 text-ink/60" strokeWidth={2.5} />
        </div>

        <p className="mt-2 text-center font-body text-xs font-semibold text-ink/50">
          Drag to reposition • pinch or use the slider to zoom
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="btn-pop bg-white px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !areaPixels}
            className="btn-pop bg-coral px-4 py-2 text-sm text-white"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />
            ) : (
              <Check className="h-4 w-4" strokeWidth={3} />
            )}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
