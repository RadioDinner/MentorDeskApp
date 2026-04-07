import { useState, useEffect, useRef } from 'react'
import { X, Search, ChevronRight, ArrowLeft, BookOpen } from 'lucide-react'
import { CATEGORIES, ARTICLES, getArticlesByCategory, searchArticles } from '../help/articles'

export default function HelpPanel({ open, onClose }) {
  const [category, setCategory] = useState('overview')
  const [article, setArticle] = useState(null)
  const [query, setQuery] = useState('')
  const searchRef = useRef()
  const panelRef = useRef()

  // Reset to home when opened
  useEffect(() => {
    if (open) {
      setArticle(null)
      setQuery('')
      setCategory('overview')
      setTimeout(() => searchRef.current?.focus(), 80)
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const searchResults = query.trim() ? searchArticles(query) : []
  const categoryArticles = getArticlesByCategory(category)

  function openArticle(a) {
    setArticle(a)
    setQuery('')
    panelRef.current?.scrollTo(0, 0)
  }

  function back() {
    setArticle(null)
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div style={h.backdrop} onClick={onClose} />

      {/* Panel */}
      <div style={h.panel} ref={panelRef}>
        {/* Header */}
        <div style={h.header}>
          <div style={h.headerLeft}>
            <div style={h.headerIcon}><BookOpen size={16} color="#6366f1" /></div>
            <div>
              <div style={h.headerTitle}>Help & Documentation</div>
              <div style={h.headerSub}>MentorDesk guide</div>
            </div>
          </div>
          <button style={h.closeBtn} onClick={onClose} title="Close (Esc)">
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div style={h.searchWrap}>
          <Search size={14} color="#9ca3af" style={h.searchIcon} />
          <input
            ref={searchRef}
            style={h.searchInput}
            placeholder="Search documentation…"
            value={query}
            onChange={e => { setQuery(e.target.value); setArticle(null) }}
          />
          {query && (
            <button style={h.clearBtn} onClick={() => setQuery('')}>
              <X size={12} />
            </button>
          )}
        </div>

        {/* Search results */}
        {query.trim() && (
          <div style={h.body}>
            <div style={h.sectionLabel}>
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{query}"
            </div>
            {searchResults.length === 0 ? (
              <div style={h.emptySearch}>
                <p>No articles found. Try a different search term.</p>
              </div>
            ) : (
              searchResults.map(a => (
                <button key={a.id} style={h.articleBtn} onClick={() => openArticle(a)}>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={h.articleBtnTitle}>{a.title}</div>
                    <div style={h.articleBtnCat}>
                      {CATEGORIES.find(c => c.id === a.category)?.label}
                    </div>
                  </div>
                  <ChevronRight size={14} color="#d1d5db" />
                </button>
              ))
            )}
          </div>
        )}

        {/* Article view */}
        {!query && article && (
          <div style={h.body}>
            <button style={h.backBtn} onClick={back}>
              <ArrowLeft size={13} /> Back
            </button>
            <div style={h.articleCat}>
              {CATEGORIES.find(c => c.id === article.category)?.label}
            </div>
            <h2 style={h.articleTitle}>{article.title}</h2>
            <div style={h.articleContent}>
              {article.content.map((section, i) => (
                <div key={i} style={h.section}>
                  <h3 style={h.sectionHeading}>{section.heading}</h3>
                  <ArticleBody text={section.body} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Category + article list */}
        {!query && !article && (
          <div style={h.twoCol}>
            {/* Category nav */}
            <div style={h.catNav}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  style={{ ...h.catBtn, ...(category === cat.id ? h.catBtnActive : {}) }}
                  onClick={() => setCategory(cat.id)}
                >
                  {cat.label}
                  <span style={h.catCount}>
                    {getArticlesByCategory(cat.id).length}
                  </span>
                </button>
              ))}
            </div>

            {/* Article list */}
            <div style={h.articleList}>
              <div style={h.sectionLabel}>
                {CATEGORIES.find(c => c.id === category)?.label}
              </div>
              {categoryArticles.map(a => (
                <button key={a.id} style={h.articleBtn} onClick={() => openArticle(a)}>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={h.articleBtnTitle}>{a.title}</div>
                    <div style={h.articleBtnPreview}>
                      {a.content[0]?.body.replace(/\*\*/g, '').slice(0, 80)}…
                    </div>
                  </div>
                  <ChevronRight size={14} color="#d1d5db" style={{ flexShrink: 0 }} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// Renders article body text with simple formatting:
// **bold**, `code`, \n line breaks
function ArticleBody({ text }) {
  const lines = text.split('\n')
  return (
    <div>
      {lines.map((line, i) => {
        const parts = []
        let rest = line
        let key = 0

        // Process **bold** and `code` inline
        while (rest.length > 0) {
          const boldIdx = rest.indexOf('**')
          const codeIdx = rest.indexOf('`')

          if (boldIdx === -1 && codeIdx === -1) {
            parts.push(<span key={key++}>{rest}</span>)
            break
          }

          const firstIdx = (boldIdx === -1) ? codeIdx
            : (codeIdx === -1) ? boldIdx
            : Math.min(boldIdx, codeIdx)

          if (firstIdx > 0) {
            parts.push(<span key={key++}>{rest.slice(0, firstIdx)}</span>)
            rest = rest.slice(firstIdx)
            continue
          }

          if (rest.startsWith('**')) {
            const end = rest.indexOf('**', 2)
            if (end === -1) { parts.push(<span key={key++}>{rest}</span>); break }
            parts.push(<strong key={key++} style={{ color: '#111827' }}>{rest.slice(2, end)}</strong>)
            rest = rest.slice(end + 2)
          } else if (rest.startsWith('`')) {
            const end = rest.indexOf('`', 1)
            if (end === -1) { parts.push(<span key={key++}>{rest}</span>); break }
            parts.push(
              <code key={key++} style={{ backgroundColor: '#f3f4f6', padding: '0.1em 0.35em', borderRadius: 3, fontSize: '0.85em', color: '#6366f1', fontFamily: 'monospace' }}>
                {rest.slice(1, end)}
              </code>
            )
            rest = rest.slice(end + 1)
          }
        }

        // Bullet lines
        const isBullet = line.startsWith('• ') || line.startsWith('* ')
        if (isBullet) {
          return (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.35rem', paddingLeft: '0.5rem' }}>
              <span style={{ color: '#6366f1', flexShrink: 0, marginTop: 1 }}>•</span>
              <span style={{ fontSize: '0.875rem', color: '#374151', lineHeight: 1.6 }}>{parts}</span>
            </div>
          )
        }

        if (line.trim() === '') return <div key={i} style={{ height: '0.6rem' }} />

        return (
          <p key={i} style={{ fontSize: '0.875rem', color: '#374151', lineHeight: 1.65, marginBottom: '0.5rem', margin: '0 0 0.5rem 0' }}>
            {parts}
          </p>
        )
      })}
    </div>
  )
}

const h = {
  backdrop: {
    position: 'fixed', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 200,
  },
  panel: {
    position: 'fixed', top: 0, right: 0, bottom: 0,
    width: 520,
    backgroundColor: '#fff',
    boxShadow: '-8px 0 40px rgba(0,0,0,0.15)',
    zIndex: 201,
    display: 'flex', flexDirection: 'column',
    overflowY: 'auto',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '1.1rem 1.25rem',
    borderBottom: '1px solid #f3f4f6',
    flexShrink: 0,
    position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '0.65rem' },
  headerIcon: {
    width: 34, height: 34, borderRadius: 7,
    background: '#eef2ff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: '0.9rem', fontWeight: 700, color: '#111827' },
  headerSub: { fontSize: '0.7rem', color: '#9ca3af', marginTop: 1 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 6,
    border: '1px solid #e5e7eb', background: '#f9fafb',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#6b7280', cursor: 'pointer',
  },
  searchWrap: {
    position: 'relative',
    padding: '0.75rem 1.25rem',
    borderBottom: '1px solid #f3f4f6',
    flexShrink: 0,
  },
  searchIcon: {
    position: 'absolute', left: '1.9rem',
    top: '50%', transform: 'translateY(-50%)',
  },
  searchInput: {
    width: '100%', boxSizing: 'border-box',
    padding: '0.6rem 2.5rem 0.6rem 2.25rem',
    border: '1.5px solid #e5e7eb', borderRadius: 7,
    fontSize: '0.875rem', color: '#111827', backgroundColor: '#f9fafb',
  },
  clearBtn: {
    position: 'absolute', right: '1.9rem',
    top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none',
    color: '#9ca3af', cursor: 'pointer', padding: 2,
  },
  body: { padding: '1rem 1.25rem', flex: 1 },
  backBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
    background: 'none', border: 'none',
    fontSize: '0.78rem', color: '#6366f1', fontWeight: 600,
    cursor: 'pointer', padding: '0 0 0.85rem 0',
  },
  articleCat: {
    fontSize: '0.65rem', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.08em',
    color: '#9ca3af', marginBottom: '0.35rem',
  },
  articleTitle: {
    fontSize: '1.1rem', fontWeight: 700, color: '#111827',
    letterSpacing: '-0.02em', marginBottom: '1.25rem',
  },
  articleContent: { display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  section: {},
  sectionHeading: {
    fontSize: '0.8rem', fontWeight: 700, color: '#374151',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    marginBottom: '0.5rem',
    paddingBottom: '0.3rem',
    borderBottom: '1px solid #f3f4f6',
  },
  sectionLabel: {
    fontSize: '0.65rem', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.08em',
    color: '#9ca3af', marginBottom: '0.65rem',
  },
  emptySearch: { textAlign: 'center', padding: '2rem', color: '#9ca3af', fontSize: '0.875rem' },
  articleBtn: {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    width: '100%', padding: '0.7rem 0.75rem',
    border: 'none', background: 'none',
    borderRadius: 7, cursor: 'pointer',
    textAlign: 'left', marginBottom: 2,
  },
  articleBtnTitle: { fontSize: '0.875rem', fontWeight: 600, color: '#111827', marginBottom: '0.15rem' },
  articleBtnCat: { fontSize: '0.72rem', color: '#9ca3af', fontWeight: 500 },
  articleBtnPreview: { fontSize: '0.78rem', color: '#9ca3af', lineHeight: 1.4, marginTop: '0.15rem' },
  twoCol: { display: 'flex', flex: 1, minHeight: 0 },
  catNav: {
    width: 140, flexShrink: 0,
    borderRight: '1px solid #f3f4f6',
    padding: '1rem 0.75rem',
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  catBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0.5rem 0.65rem', borderRadius: 5,
    border: 'none', background: 'none',
    fontSize: '0.8rem', fontWeight: 500, color: '#6b7280',
    cursor: 'pointer', width: '100%', textAlign: 'left',
  },
  catBtnActive: {
    background: '#eef2ff', color: '#4f46e5', fontWeight: 700,
  },
  catCount: {
    fontSize: '0.65rem', fontWeight: 700,
    backgroundColor: '#f3f4f6', color: '#9ca3af',
    borderRadius: 99, padding: '0.1rem 0.4rem',
    minWidth: 18, textAlign: 'center',
  },
  articleList: { flex: 1, padding: '1rem', overflowY: 'auto' },
}
