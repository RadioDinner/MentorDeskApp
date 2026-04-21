import { useEffect, useRef, useState } from 'react'
import { DYNAMIC_FIELDS } from '../lib/dynamicFields'

interface Props {
  /** Ref to the input or textarea the picker should insert into. */
  targetRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>
  /** Called with the new full value after a token is inserted at caret. */
  onInsert: (nextValue: string) => void
  /** Optional compact mode (for dense rows). */
  size?: 'sm' | 'xs'
}

/** Small "{ } Fields" button that opens a popover of DYNAMIC_FIELDS tokens
 *  and inserts the selected token at the caret of the bound input or
 *  textarea. Mirrors the course builder's picker so authors see the same
 *  UX everywhere they can use personalization. */
export default function DynamicFieldsButton({ targetRef, onInsert, size = 'xs' }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function insert(token: string) {
    const el = targetRef.current
    if (!el) { setOpen(false); return }
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    const next = el.value.slice(0, start) + token + el.value.slice(end)
    onInsert(next)
    // Restore caret just past the inserted token on the next tick.
    requestAnimationFrame(() => {
      const pos = start + token.length
      el.focus()
      el.setSelectionRange(pos, pos)
    })
    setOpen(false)
  }

  const menteeFields = DYNAMIC_FIELDS.filter(f => f.group === 'mentee')
  const mentorFields = DYNAMIC_FIELDS.filter(f => f.group === 'mentor')

  const btnClass = size === 'xs'
    ? 'px-1.5 py-0.5 text-[10px] font-semibold rounded border border-purple-200 bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors'
    : 'px-2 py-0.5 text-[11px] font-semibold rounded border border-purple-200 bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors'

  return (
    <div className="relative" ref={rootRef}>
      <button type="button" onClick={() => setOpen(v => !v)} className={btnClass}>
        {'{ } Fields'}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-30 py-1 w-52">
          <p className="px-3 py-1 text-[9px] text-gray-400 uppercase tracking-wider font-semibold">Click to insert at cursor</p>
          <div className="border-b border-gray-100 my-1" />
          <p className="px-3 py-1 text-[10px] text-gray-500 font-semibold">Mentee</p>
          {menteeFields.map(f => (
            <button
              key={f.token}
              type="button"
              onClick={() => insert(f.token)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-purple-50 transition-colors flex items-center justify-between"
            >
              <span className="text-gray-700">{f.label}</span>
              <code className="text-[10px] text-purple-500 bg-purple-50 px-1 rounded">{f.token}</code>
            </button>
          ))}
          <div className="border-b border-gray-100 my-1" />
          <p className="px-3 py-1 text-[10px] text-gray-500 font-semibold">Mentor</p>
          {mentorFields.map(f => (
            <button
              key={f.token}
              type="button"
              onClick={() => insert(f.token)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-purple-50 transition-colors flex items-center justify-between"
            >
              <span className="text-gray-700">{f.label}</span>
              <code className="text-[10px] text-purple-500 bg-purple-50 px-1 rounded">{f.token}</code>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
