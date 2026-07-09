import { useEffect, useRef, useState } from 'react'
import { Camera, Loader2, Check } from 'lucide-react'
import { supabase, AVATARS_BUCKET } from '../lib/supabase'
import { prepareImageForUpload, errorMessage } from '../lib/imageUpload'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import AppHeader from '../components/AppHeader'
import Avatar from '../components/Avatar'
import AvatarCropper from '../components/AvatarCropper'

export default function ProfilePage() {
  const { user } = useAuth()
  const { profile, refresh } = useProfile()
  const [displayName, setDisplayName] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (profile) setDisplayName(profile.display_name ?? '')
  }, [profile])

  async function saveName() {
    if (!user) return
    const name = displayName.trim()
    if (!name) {
      setError('Username cannot be empty')
      return
    }
    setSaving(true)
    setError(null)
    setSaved(false)
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: name })
      .eq('id', user.id)
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setSaved(true)
    await refresh()
    setTimeout(() => setSaved(false), 2000)
  }

  // Step 1: user picks a file → convert HEIC if needed → open the cropper.
  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setError(null)
    setUploading(true)
    try {
      const { blob } = await prepareImageForUpload(file)
      setCropSrc(URL.createObjectURL(blob))
    } catch (err) {
      setError('Could not load image: ' + errorMessage(err))
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function closeCropper() {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  // Step 2: cropper returns the cropped blob → upload it.
  async function handleCropped(blob: Blob) {
    if (!user) return
    setUploading(true)
    setError(null)
    try {
      const path = `${user.id}/avatar-${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage
        .from(AVATARS_BUCKET)
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (upErr) throw upErr
      const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path)
      const { error: updErr } = await supabase
        .from('profiles')
        .update({ avatar_url: data.publicUrl })
        .eq('id', user.id)
      if (updErr) throw updErr
      await refresh()
      closeCropper()
    } catch (err) {
      setError('Upload failed: ' + errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-cream via-bubble/30 to-sky/30 text-ink">
      <AppHeader />
      <main className="mx-auto max-w-lg px-4 py-8">
        <h1 className="mb-6 font-display text-3xl font-bold">Your profile</h1>

        <div className="rounded-blob border-2 border-ink bg-cream p-6 shadow-pop">
          {/* Avatar */}
          <div className="mb-6 flex flex-col items-center gap-3">
            <div className="relative">
              <Avatar
                name={displayName || user?.email || '?'}
                avatarUrl={profile?.avatar_url}
                size={112}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                title="Change picture"
                className="absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full border-2 border-ink bg-coral text-white shadow-pop-sm transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.5} />
                ) : (
                  <Camera className="h-5 w-5" strokeWidth={2.5} />
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFilePick}
              />
            </div>
            <p className="font-body text-sm font-semibold text-ink/50">
              Tap the camera to upload &amp; crop a picture
            </p>
          </div>

          {/* Username */}
          <label className="mb-1 block font-display text-sm font-bold text-ink/70">
            Username (shown to everyone)
          </label>
          <div className="flex gap-2">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={40}
              placeholder="Pick a username"
              className="flex-1 rounded-2xl border-2 border-ink bg-white px-4 py-2.5 font-body font-semibold text-ink placeholder-ink/40 shadow-pop-sm focus:outline-none"
            />
            <button
              onClick={saveName}
              disabled={saving}
              className="btn-pop bg-coral px-4 py-2.5 text-white"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />
              ) : saved ? (
                <Check className="h-4 w-4" strokeWidth={3} />
              ) : (
                'Save'
              )}
            </button>
          </div>

          <p className="mt-4 font-body text-sm font-semibold text-ink/40">
            Signed in as {user?.email}
          </p>

          {error && (
            <p className="mt-3 rounded-2xl border-2 border-ink/10 bg-coral/20 px-3 py-2 font-body text-sm font-semibold">
              {error}
            </p>
          )}
        </div>
      </main>

      {cropSrc && (
        <AvatarCropper
          imageSrc={cropSrc}
          onCancel={closeCropper}
          onCropped={handleCropped}
        />
      )}
    </div>
  )
}
