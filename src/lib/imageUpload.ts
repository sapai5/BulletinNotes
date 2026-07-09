// Prepares an image file for upload. iPhones produce HEIC/HEIF files that most
// browsers can't display, so we convert those to JPEG in the browser first.
// heic2any is imported lazily so its (large) WASM only loads when needed.

export interface PreparedImage {
  blob: Blob
  ext: string
  contentType: string
}

function isHeic(file: File): boolean {
  const type = file.type.toLowerCase()
  if (type === 'image/heic' || type === 'image/heif') return true
  // iOS sometimes reports an empty MIME type, so fall back to the extension.
  return /\.(heic|heif)$/i.test(file.name)
}

// Extracts a human-readable message from anything thrown (Error, heic2any's
// {code, message} objects, strings, etc.).
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  try {
    return JSON.stringify(err)
  } catch {
    return 'unknown error'
  }
}

export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  if (isHeic(file)) {
    let blob: Blob
    try {
      const { heicTo } = await import('heic-to')
      blob = await heicTo({
        blob: file,
        type: 'image/jpeg',
        quality: 0.9,
      })
    } catch (e) {
      throw new Error(
        `Couldn't convert this HEIC image (${errorMessage(e)}). ` +
          'Try a JPEG or PNG instead — or on iPhone, set ' +
          'Settings › Camera › Formats › Most Compatible.',
      )
    }
    return { blob, ext: 'jpg', contentType: 'image/jpeg' }
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
  return {
    blob: file,
    ext,
    contentType: file.type || 'application/octet-stream',
  }
}
