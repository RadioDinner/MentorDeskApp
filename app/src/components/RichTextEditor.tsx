import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import ImageExt from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import FontFamily from '@tiptap/extension-font-family'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { useState, useCallback, useEffect } from 'react'

export interface RichTextEditorHandle {
  insertText: (text: string) => void
}

interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  editorRef?: React.MutableRefObject<RichTextEditorHandle | null>
}

const FONT_FAMILIES = [
  { label: 'Default', value: '' },
  { label: 'Sans Serif', value: 'Inter, sans-serif' },
  { label: 'Serif', value: 'Georgia, serif' },
  { label: 'Monospace', value: 'ui-monospace, monospace' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: 'Times New Roman, serif' },
  { label: 'Courier New', value: 'Courier New, monospace' },
]

const COLORS = [
  '#000000', '#374151', '#6b7280', '#dc2626', '#ea580c', '#d97706',
  '#16a34a', '#0d9488', '#2563eb', '#7c3aed', '#db2777', '#ffffff',
]

const HIGHLIGHTS = [
  '', '#fef08a', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#fecdd3', '#fed7aa', '#d1d5db',
]

export default function RichTextEditor({ content, onChange, placeholder, editorRef }: RichTextEditorProps) {
  const [showHtmlMode, setShowHtmlMode] = useState(false)
  const [htmlSource, setHtmlSource] = useState('')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showHighlightPicker, setShowHighlightPicker] = useState(false)
  const [showFontPicker, setShowFontPicker] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      FontFamily,
      Subscript,
      Superscript,
      ImageExt.configure({ inline: true, allowBase64: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: placeholder || 'Start writing...' }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px] px-4 py-3',
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items
        if (!items) return false
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            event.preventDefault()
            const file = item.getAsFile()
            if (file) {
              const reader = new FileReader()
              reader.onload = () => {
                const url = reader.result as string
                view.dispatch(view.state.tr.replaceSelectionWith(
                  view.state.schema.nodes.image.create({ src: url })
                ))
              }
              reader.readAsDataURL(file)
            }
            return true
          }
        }
        return false
      },
    },
  })

  // Expose insert method to parent via editorRef
  useEffect(() => {
    if (editorRef && editor) {
      editorRef.current = {
        insertText: (text: string) => { editor.chain().focus().insertContent(text).run() },
      }
    }
  }, [editor, editorRef])

  // Sync external content changes
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '')
    }
  }, [content])

  const addImage = useCallback(() => {
    if (!editor) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        editor.chain().focus().setImage({ src: reader.result as string }).run()
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }, [editor])

  const addLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes('link').href
    const url = window.prompt('URL', prev || 'https://')
    if (url === null) return
    if (url === '') { editor.chain().focus().unsetLink().run(); return }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [editor])

  const insertTable = useCallback(() => {
    if (!editor) return
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }, [editor])

  const switchToHtml = () => {
    if (editor) setHtmlSource(editor.getHTML())
    setShowHtmlMode(true)
  }

  const applyHtml = () => {
    if (editor) {
      editor.commands.setContent(htmlSource)
      onChange(htmlSource)
    }
    setShowHtmlMode(false)
  }

  if (!editor) return null

  const btn = (active: boolean, extra = '') =>
    `px-1.5 py-1 rounded text-xs transition-colors ${active ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'} ${extra}`

  const divider = <div className="w-px h-5 bg-gray-200 mx-0.5" />

  return (
    <div className="border border-gray-300 rounded-md overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50">

        {/* Font family */}
        <div className="relative">
          <button type="button" onClick={() => { setShowFontPicker(!showFontPicker); setShowColorPicker(false); setShowHighlightPicker(false) }}
            className={btn(false, 'min-w-[80px] text-left')}>
            <span className="truncate block text-[11px]">
              {FONT_FAMILIES.find(f => f.value && editor.isActive('textStyle', { fontFamily: f.value }))?.label || 'Font'}
            </span>
          </button>
          {showFontPicker && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-20 py-1 min-w-[140px]">
              {FONT_FAMILIES.map(f => (
                <button key={f.label} type="button"
                  className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors"
                  style={{ fontFamily: f.value || 'inherit' }}
                  onClick={() => { f.value ? editor.chain().focus().setFontFamily(f.value).run() : editor.chain().focus().unsetFontFamily().run(); setShowFontPicker(false) }}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {divider}

        {/* Headings */}
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={btn(editor.isActive('heading', { level: 1 }))}>H1</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive('heading', { level: 2 }))}>H2</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btn(editor.isActive('heading', { level: 3 }))}>H3</button>
        <button type="button" onClick={() => editor.chain().focus().setParagraph().run()} className={btn(editor.isActive('paragraph'))}>P</button>

        {divider}

        {/* Basic formatting */}
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'), 'font-bold')}>B</button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'), 'italic')}>I</button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btn(editor.isActive('underline'), 'underline')}>U</button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={btn(editor.isActive('strike'), 'line-through')}>S</button>
        <button type="button" onClick={() => editor.chain().focus().toggleSubscript().run()} className={btn(editor.isActive('subscript'))}>
          <span className="text-[10px]">X<sub>2</sub></span>
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleSuperscript().run()} className={btn(editor.isActive('superscript'))}>
          <span className="text-[10px]">X<sup>2</sup></span>
        </button>

        {divider}

        {/* Text color */}
        <div className="relative">
          <button type="button" onClick={() => { setShowColorPicker(!showColorPicker); setShowHighlightPicker(false); setShowFontPicker(false) }}
            className={btn(false)}>
            <span className="flex items-center gap-0.5">
              A<span className="block w-3 h-1 rounded-sm" style={{ backgroundColor: editor.getAttributes('textStyle').color || '#000' }} />
            </span>
          </button>
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-20 p-2 grid grid-cols-6 gap-1">
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => { editor.chain().focus().setColor(c).run(); setShowColorPicker(false) }}
                  className="w-5 h-5 rounded border border-gray-300 hover:scale-110 transition-transform" style={{ backgroundColor: c }} />
              ))}
            </div>
          )}
        </div>

        {/* Highlight */}
        <div className="relative">
          <button type="button" onClick={() => { setShowHighlightPicker(!showHighlightPicker); setShowColorPicker(false); setShowFontPicker(false) }}
            className={btn(editor.isActive('highlight'))}>
            <span className="flex items-center gap-0.5 text-[11px]">
              <span className="px-0.5 rounded" style={{ backgroundColor: '#fef08a' }}>ab</span>
            </span>
          </button>
          {showHighlightPicker && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-20 p-2 grid grid-cols-4 gap-1">
              {HIGHLIGHTS.map((c, i) => (
                <button key={i} type="button"
                  onClick={() => { c ? editor.chain().focus().toggleHighlight({ color: c }).run() : editor.chain().focus().unsetHighlight().run(); setShowHighlightPicker(false) }}
                  className="w-6 h-6 rounded border border-gray-300 hover:scale-110 transition-transform flex items-center justify-center text-[9px]"
                  style={{ backgroundColor: c || '#fff' }}>
                  {!c && '✕'}
                </button>
              ))}
            </div>
          )}
        </div>

        {divider}

        {/* Lists */}
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive('bulletList'))} title="Bullet list">•≡</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive('orderedList'))} title="Numbered list">1≡</button>
        <button type="button" onClick={() => editor.chain().focus().toggleTaskList().run()} className={btn(editor.isActive('taskList'))} title="Checklist">☑</button>

        {divider}

        {/* Alignment */}
        <button type="button" onClick={() => editor.chain().focus().setTextAlign('left').run()} className={btn(editor.isActive({ textAlign: 'left' }))} title="Align left">⫷</button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign('center').run()} className={btn(editor.isActive({ textAlign: 'center' }))} title="Center">⫸</button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign('right').run()} className={btn(editor.isActive({ textAlign: 'right' }))} title="Align right">⫸</button>

        {divider}

        {/* Insert */}
        <button type="button" onClick={addLink} className={btn(editor.isActive('link'))} title="Insert link">🔗</button>
        <button type="button" onClick={addImage} className={btn(false)} title="Insert image">🖼</button>
        <button type="button" onClick={insertTable} className={btn(false)} title="Insert table">⊞</button>
        <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btn(false)} title="Horizontal rule">―</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btn(editor.isActive('blockquote'))} title="Quote">❝</button>
        <button type="button" onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={btn(editor.isActive('codeBlock'))} title="Code block">&lt;/&gt;</button>

        {divider}

        {/* Undo/Redo */}
        <button type="button" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className={btn(false, 'disabled:opacity-30')} title="Undo">↩</button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className={btn(false, 'disabled:opacity-30')} title="Redo">↪</button>

        {divider}

        {/* HTML mode toggle */}
        <button type="button" onClick={showHtmlMode ? applyHtml : switchToHtml}
          className={btn(showHtmlMode, 'ml-auto')}>
          {showHtmlMode ? '✓ Apply HTML' : '< > HTML'}
        </button>
      </div>

      {/* Editor or HTML source */}
      {showHtmlMode ? (
        <textarea
          value={htmlSource}
          onChange={e => setHtmlSource(e.target.value)}
          className="w-full min-h-[250px] px-4 py-3 text-xs font-mono text-gray-800 bg-gray-50 outline-none resize-y"
          placeholder="Paste or edit raw HTML here..."
        />
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  )
}
