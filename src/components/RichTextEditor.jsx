import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Youtube from '@tiptap/extension-youtube'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import { useState } from 'react'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, Heading1, Heading2, Heading3,
  AlignLeft, AlignCenter, AlignRight,
  Link as LinkIcon, Image as ImageIcon, Youtube as YoutubeIcon,
  Undo, Redo, Quote, Minus, Code
} from 'lucide-react'

export default function RichTextEditor({ content, onChange, placeholder }) {
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [showVideoInput, setShowVideoInput] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [showImageInput, setShowImageInput] = useState(false)
  const [imageUrl, setImageUrl] = useState('')

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      }),
      Image.configure({ inline: false }),
      Youtube.configure({ width: 640, height: 360 }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: placeholder || 'Start writing your lesson content...' }),
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
    },
  })

  if (!editor) return null

  function insertLink() {
    if (!linkUrl) return
    editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run()
    setLinkUrl('')
    setShowLinkInput(false)
  }

  function removeLink() {
    editor.chain().focus().unsetLink().run()
    setShowLinkInput(false)
  }

  function insertVideo() {
    if (!videoUrl) return
    editor.commands.setYoutubeVideo({ src: videoUrl })
    setVideoUrl('')
    setShowVideoInput(false)
  }

  function insertImage() {
    if (!imageUrl) return
    editor.chain().focus().setImage({ src: imageUrl }).run()
    setImageUrl('')
    setShowImageInput(false)
  }

  function ToolBtn({ onClick, active, children, title }) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        style={{
          ...s.toolBtn,
          ...(active ? s.toolBtnActive : {}),
        }}
      >
        {children}
      </button>
    )
  }

  return (
    <div style={s.wrapper}>
      {/* Toolbar */}
      <div style={s.toolbar}>
        <div style={s.toolGroup}>
          <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="Undo"><Undo size={15} /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="Redo"><Redo size={15} /></ToolBtn>
        </div>

        <div style={s.divider} />

        <div style={s.toolGroup}>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1"><Heading1 size={15} /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2"><Heading2 size={15} /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3"><Heading3 size={15} /></ToolBtn>
        </div>

        <div style={s.divider} />

        <div style={s.toolGroup}>
          <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold"><Bold size={15} /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic"><Italic size={15} /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline"><UnderlineIcon size={15} /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough"><Strikethrough size={15} /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Inline Code"><Code size={15} /></ToolBtn>
        </div>

        <div style={s.divider} />

        <div style={s.toolGroup}>
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align Left"><AlignLeft size={15} /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align Center"><AlignCenter size={15} /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align Right"><AlignRight size={15} /></ToolBtn>
        </div>

        <div style={s.divider} />

        <div style={s.toolGroup}>
          <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List"><List size={15} /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered List"><ListOrdered size={15} /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Quote"><Quote size={15} /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Rule"><Minus size={15} /></ToolBtn>
        </div>

        <div style={s.divider} />

        <div style={s.toolGroup}>
          <ToolBtn onClick={() => setShowLinkInput(!showLinkInput)} active={editor.isActive('link')} title="Insert Link"><LinkIcon size={15} /></ToolBtn>
          <ToolBtn onClick={() => setShowImageInput(!showImageInput)} title="Insert Image"><ImageIcon size={15} /></ToolBtn>
          <ToolBtn onClick={() => setShowVideoInput(!showVideoInput)} title="Embed Video"><YoutubeIcon size={15} /></ToolBtn>
        </div>
      </div>

      {/* Link input */}
      {showLinkInput && (
        <div style={s.inlineInput}>
          <LinkIcon size={14} color="#6366f1" />
          <input
            style={s.inlineField}
            placeholder="https://example.com"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && insertLink()}
            autoFocus
          />
          <button style={s.inlineBtn} onClick={insertLink}>Add</button>
          {editor.isActive('link') && <button style={s.inlineBtnDanger} onClick={removeLink}>Remove</button>}
          <button style={s.inlineBtnGhost} onClick={() => setShowLinkInput(false)}>Cancel</button>
        </div>
      )}

      {/* Video input */}
      {showVideoInput && (
        <div style={s.inlineInput}>
          <YoutubeIcon size={14} color="#dc2626" />
          <input
            style={s.inlineField}
            placeholder="YouTube or Vimeo URL..."
            value={videoUrl}
            onChange={e => setVideoUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && insertVideo()}
            autoFocus
          />
          <button style={s.inlineBtn} onClick={insertVideo}>Embed</button>
          <button style={s.inlineBtnGhost} onClick={() => setShowVideoInput(false)}>Cancel</button>
        </div>
      )}

      {/* Image input */}
      {showImageInput && (
        <div style={s.inlineInput}>
          <ImageIcon size={14} color="#16a34a" />
          <input
            style={s.inlineField}
            placeholder="Image URL..."
            value={imageUrl}
            onChange={e => setImageUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && insertImage()}
            autoFocus
          />
          <button style={s.inlineBtn} onClick={insertImage}>Add</button>
          <button style={s.inlineBtnGhost} onClick={() => setShowImageInput(false)}>Cancel</button>
        </div>
      )}

      {/* Editor content */}
      <div style={s.editorWrap}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

const s = {
  wrapper: {
    border: '1.5px solid #e5e7eb',
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.15rem',
    padding: '0.4rem 0.5rem',
    borderBottom: '1px solid #f3f4f6',
    backgroundColor: '#f9fafb',
  },
  toolGroup: {
    display: 'flex',
    gap: '0.1rem',
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: '#e5e7eb',
    margin: '0 0.25rem',
  },
  toolBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: 4,
    border: 'none',
    background: 'transparent',
    color: '#6b7280',
    cursor: 'pointer',
    transition: 'all 0.1s',
  },
  toolBtnActive: {
    background: '#6366f1',
    color: '#fff',
  },
  inlineInput: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.4rem 0.6rem',
    borderBottom: '1px solid #f3f4f6',
    backgroundColor: '#fefce8',
  },
  inlineField: {
    flex: 1,
    padding: '0.3rem 0.5rem',
    border: '1px solid #e5e7eb',
    borderRadius: 4,
    fontSize: '0.82rem',
    color: '#111827',
    outline: 'none',
  },
  inlineBtn: {
    padding: '0.3rem 0.6rem',
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  inlineBtnDanger: {
    padding: '0.3rem 0.6rem',
    background: '#ef4444',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  inlineBtnGhost: {
    padding: '0.3rem 0.6rem',
    background: 'transparent',
    color: '#6b7280',
    border: '1px solid #e5e7eb',
    borderRadius: 4,
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  editorWrap: {
    minHeight: 300,
    padding: '1rem',
    fontSize: '0.95rem',
    lineHeight: 1.7,
    color: '#111827',
  },
}
