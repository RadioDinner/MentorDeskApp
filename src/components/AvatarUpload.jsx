import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB

export default function AvatarUpload({
  url,
  initials = '??',
  gradient = 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  onChange,
  size = 72,
}) {
  const inputRef = useRef()
  const [preview, setPreview] = useState(null)
  const [fileError, setFileError] = useState(null)

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileError(null)
    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError('Only JPG, PNG, or WebP images are allowed.')
      e.target.value = ''
      return
    }
    if (file.size > MAX_SIZE_BYTES) {
      setFileError('Image must be 5 MB or smaller.')
      e.target.value = ''
      return
    }
    setPreview(URL.createObjectURL(file))
    onChange?.(file)
  }

  const src = preview || url

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <div
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: src ? 'transparent' : gradient,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: Math.round(size * 0.3),
            border: '3px solid #fff',
            boxShadow: '0 2px 10px rgba(0,0,0,0.14)',
            flexShrink: 0,
          }}
        >
          {src
            ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span>{initials}</span>
          }
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{
            position: 'absolute',
            bottom: 1,
            right: 1,
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: '#6366f1',
            border: '2px solid #fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          }}
        >
          <Camera size={12} color="#fff" strokeWidth={2.5} />
        </button>
      </div>
      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp" style={{ display: 'none' }} onChange={handleFile} />
{fileError && <span style={{ fontSize: '0.72rem', color: '#ef4444', textAlign: 'center', maxWidth: 180 }}>{fileError}</span>}
    </div>
  )
}
