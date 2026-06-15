import { useState, useEffect, useCallback, useRef } from 'react'
import SaveCard from './SaveCard'
import SaveDetail from './SaveDetail'
import Universe from './Universe'
import Collections from './Collections'

const API = 'http://localhost:8000'

const PALETTE = [
  '#AFC8E8', '#E8B8C4', '#C4B8E8', '#E8CDB8',
  '#B8D8C4', '#D4C4A8', '#E8D8A8', '#C8B8D4',
]

const TYPE_ICONS = {
  YouTube: '▶',
  Instagram: '📷',
  InstagramVideo: '▶',
  TikTok: '🎵',
  TikTokSlideshow: '🎵',
  Pinterest: '📌',
  Twitter: '𝕏',
  Reddit: '💬',
  Spotify: '🎧',
  GitHub: '⌥',
  Video: '🎬',
  Recipe: '🍳',
  Product: '🛍',
  Article: '📄',
}

const TYPE_LABELS = {
  YouTube: 'YouTube',
  Instagram: 'Instagram',
  InstagramVideo: 'Instagram Reels',
  TikTok: 'TikTok',
  TikTokSlideshow: 'TikTok Slideshow',
  Pinterest: 'Pinterest',
  Twitter: 'Twitter',
  Reddit: 'Reddit',
  Spotify: 'Spotify',
  GitHub: 'GitHub',
  Video: 'Video',
  Recipe: 'Recipe',
  Product: 'Product',
  Article: 'Article',
}

export default function App() {
  const [saves, setSaves] = useState([])
  const [types, setTypes] = useState([])
  const [activeType, setActiveType] = useState('')
  const [query, setQuery] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [notesInput, setNotesInput] = useState('')
  const [saveTab, setSaveTab] = useState('link')
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [adding, setAdding] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showUniverse, setShowUniverse] = useState(false)
  const [showSaveMenu, setShowSaveMenu] = useState(false)
  const [showNoteEditor, setShowNoteEditor] = useState(false)
  const [showCollections, setShowCollections] = useState(false)
  const [showAddToCollection, setShowAddToCollection] = useState(false)
  const [allCollections, setAllCollections] = useState([])
  const [showNewCollInline, setShowNewCollInline] = useState(false)
  const [newCollName, setNewCollName] = useState('')
  const [newCollColor, setNewCollColor] = useState(PALETTE[0])
  const [creatingColl, setCreatingColl] = useState(false)
  const [view, setView] = useState(() => localStorage.getItem('sm-view') || 'masonry')
  const uploadInputRef = useRef(null)

  const changeView = (v) => { setView(v); localStorage.setItem('sm-view', v) }
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())

  const fetchSaves = useCallback(async (q = '', type = '') => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (type) params.set('type', type)
      const res = await fetch(`${API}/saves${params.size ? `?${params}` : ''}`)
      setSaves(await res.json())
    } catch {
      setError('Cannot reach backend — is it running on port 8000?')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchTypes = useCallback(async () => {
    try {
      const res = await fetch(`${API}/types`)
      setTypes(await res.json())
    } catch {}
  }, [])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([fetchSaves(query, activeType), fetchTypes()])
    setTimeout(() => setRefreshing(false), 600)
  }, [fetchSaves, fetchTypes, query, activeType])

  useEffect(() => {
    fetchSaves()
    fetchTypes()
  }, [fetchSaves, fetchTypes])

  // debounced search
  useEffect(() => {
    const t = setTimeout(() => fetchSaves(query, activeType), 300)
    return () => clearTimeout(t)
  }, [query, activeType, fetchSaves])

  // fast refresh while any save is still being tagged
  useEffect(() => {
    const needsTagging = saves.some(s => s.tags.length === 0)
    if (!needsTagging) return
    const t = setInterval(() => {
      fetchSaves(query, activeType)
      fetchTypes()
    }, 5000)
    return () => clearInterval(t)
  }, [saves, query, activeType, fetchSaves, fetchTypes])

  // background poll every 10 s to pick up saves added via the extension
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const res = await fetch(`${API}/saves/count`)
        if (!res.ok) return
        const { count } = await res.json()
        if (count !== saves.length) {
          fetchSaves(query, activeType)
          fetchTypes()
        }
      } catch {}
    }, 10000)
    return () => clearInterval(t)
  }, [saves.length, query, activeType, fetchSaves, fetchTypes])

  const openAdd = () => { setError(''); setShowAddModal(true) }
  const closeAdd = () => {
    setShowAddModal(false)
    setError('')
    setSaveTab('link')
    setNoteTitle('')
    setNoteContent('')
  }

  const closeNoteEditor = () => {
    setShowNoteEditor(false)
    setError('')
    setNoteTitle('')
    setNoteContent('')
  }

  const handleSaveNote = async () => {
    if (!noteContent.trim() && !noteTitle.trim()) return
    setAdding(true)
    setError('')
    try {
      const res = await fetch(`${API}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: noteTitle.trim(), content: noteContent.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        setError(err.detail || 'Something went wrong.')
      } else {
        const newSave = await res.json()
        setSaves(prev => [newSave, ...prev])
        fetchTypes()
        closeNoteEditor()
      }
    } catch {
      setError('Cannot reach backend.')
    } finally {
      setAdding(false)
    }
  }

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setAdding(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(`${API}/uploads`, { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json()
        setError(err.detail || 'Upload failed.')
      } else {
        const newSave = await res.json()
        setSaves(prev => [newSave, ...prev])
        fetchTypes()
      }
    } catch {
      setError('Upload failed.')
    } finally {
      setAdding(false)
      e.target.value = ''
    }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    setAdding(true)
    setError('')
    try {
      if (saveTab === 'note') {
        if (!noteContent.trim() && !noteTitle.trim()) return
        const res = await fetch(`${API}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: noteTitle.trim(), content: noteContent.trim() }),
        })
        if (!res.ok) {
          const err = await res.json()
          setError(err.detail || 'Something went wrong.')
        } else {
          const newSave = await res.json()
          setSaves(prev => [newSave, ...prev])
          fetchTypes()
          setNoteTitle('')
          setNoteContent('')
          closeAdd()
        }
      } else {
        if (!urlInput.trim()) return
        const res = await fetch(`${API}/saves`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urlInput.trim(), notes: notesInput.trim() }),
        })
        if (res.status === 409) {
          setError('Already saved!')
        } else if (!res.ok) {
          const err = await res.json()
          setError(err.detail || 'Something went wrong.')
        } else {
          const newSave = await res.json()
          setSaves(prev => [newSave, ...prev])
          fetchTypes()
          setUrlInput('')
          setNotesInput('')
          closeAdd()
        }
      }
    } catch {
      setError('Cannot reach backend.')
    } finally {
      setAdding(false)
    }
  }

  const closeAddToCollection = () => {
    setShowAddToCollection(false)
    setShowNewCollInline(false)
    setNewCollName('')
    setNewCollColor(PALETTE[0])
  }

  const createCollAndAdd = async () => {
    if (!newCollName.trim()) return
    setCreatingColl(true)
    try {
      const res = await fetch(`${API}/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCollName.trim(), color: newCollColor }),
      })
      if (!res.ok) return
      const coll = await res.json()
      await fetch(`${API}/collections/${coll.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ save_ids: [...selectedIds] }),
      })
      closeAddToCollection()
      exitSelect()
    } finally {
      setCreatingColl(false)
    }
  }

  const handleDelete = (id) => {
    setSaves(prev => prev.filter(s => s.id !== id))
    fetchTypes()
  }

  const handleUpdate = (id, changes) => {
    setSaves(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s))
    if (selected?.id === id) setSelected(prev => ({ ...prev, ...changes }))
  }

  const handleTypeClick = (type) => {
    setActiveType(prev => prev === type ? '' : type)
    setQuery('')
  }

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const exitSelect = () => {
    setSelecting(false)
    setSelectedIds(new Set())
  }

  const handleDeleteSelected = async () => {
    await Promise.all([...selectedIds].map(id =>
      fetch(`${API}/saves/${id}`, { method: 'DELETE' })
    ))
    setSaves(prev => prev.filter(s => !selectedIds.has(s.id)))
    fetchTypes()
    exitSelect()
  }

  return (
    <div className="min-h-screen bg-[#f7f7f8] font-sans">

      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4">
          <span className="text-base font-semibold text-violet-600 shrink-0 tracking-tight">secondmind</span>
          {selecting ? (
            <span className="flex-1 text-sm text-neutral-500">
              {selectedIds.size === 0 ? 'Tap items to select' : `${selectedIds.size} selected`}
            </span>
          ) : (
          <input
            type="search"
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveType('') }}
            placeholder="Search anything…"
            className="flex-1 bg-neutral-100 rounded-full px-5 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300 transition placeholder:text-neutral-400"
          />
          )}
          {selecting ? (
            <button
              onClick={exitSelect}
              className="shrink-0 text-sm text-neutral-500 hover:text-neutral-800 transition font-medium"
            >
              Cancel
            </button>
          ) : (
            <>
              <button
                onClick={handleRefresh}
                title="Refresh"
                className="shrink-0 text-neutral-400 hover:text-violet-600 transition"
              >
                <svg
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
                  className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`}
                >
                  <path d="M23 4v6h-6"/>
                  <path d="M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0114.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0020.49 15"/>
                </svg>
              </button>
              <button
                onClick={() => setShowUniverse(true)}
                title="Universe"
                className="shrink-0 text-neutral-400 hover:text-violet-600 transition"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <circle cx="12" cy="12" r="10"/>
                  <ellipse cx="12" cy="12" rx="4" ry="10" transform="rotate(45 12 12)"/>
                  <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/>
                  <circle cx="6" cy="7" r="1" fill="currentColor" stroke="none"/>
                  <circle cx="17" cy="16" r="1" fill="currentColor" stroke="none"/>
                  <circle cx="18" cy="7" r="0.8" fill="currentColor" stroke="none"/>
                </svg>
              </button>
              <button
                onClick={() => setShowCollections(true)}
                title="Collections"
                className="shrink-0 text-neutral-400 hover:text-violet-600 transition"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <path d="M3 7a2 2 0 012-2h3.586a1 1 0 01.707.293L10.707 6.7A1 1 0 0011.414 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
                </svg>
              </button>
              <button
                onClick={() => setSelecting(true)}
                className="shrink-0 text-neutral-400 hover:text-violet-600 transition text-sm font-medium"
              >
                Select
              </button>
              <div className="relative shrink-0">
                <button
                  onClick={() => setShowSaveMenu(p => !p)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-violet-600 hover:bg-violet-700 text-white text-lg font-light transition"
                >
                  +
                </button>

                {showSaveMenu && (
                  <>
                    {/* invisible backdrop */}
                    <div className="fixed inset-0 z-40" onClick={() => setShowSaveMenu(false)} />
                    {/* floating menu */}
                    <div className="absolute right-0 top-10 z-50 w-56 rounded-2xl overflow-hidden shadow-2xl"
                         style={{ background: '#1c1c1e' }}>
                      <button
                        onClick={() => { setShowSaveMenu(false); setShowNoteEditor(true) }}
                        className="w-full flex items-center justify-between px-4 py-3.5 text-sm text-white hover:bg-white/5 transition"
                      >
                        <span className="font-medium">Note</span>
                        <span className="w-8 h-8 rounded-xl flex items-center justify-center text-base"
                              style={{ background: '#2c2c2e' }}>✎</span>
                      </button>
                      <div style={{ height: 1, background: '#2c2c2e', margin: '0 16px' }} />
                      <button
                        onClick={() => { setShowSaveMenu(false); setSaveTab('link'); setError(''); setShowAddModal(true) }}
                        className="w-full flex items-center justify-between px-4 py-3.5 text-sm text-white hover:bg-white/5 transition"
                      >
                        <span className="font-medium">Link</span>
                        <span className="w-8 h-8 rounded-xl flex items-center justify-center text-base"
                              style={{ background: '#2c2c2e' }}>⌁</span>
                      </button>
                      <div style={{ height: 1, background: '#2c2c2e', margin: '0 16px' }} />
                      <button
                        onClick={() => { setShowSaveMenu(false); uploadInputRef.current?.click() }}
                        className="w-full flex items-center justify-between px-4 py-3.5 text-sm text-white hover:bg-white/5 transition"
                      >
                        <span className="font-medium">Upload</span>
                        <span className="w-8 h-8 rounded-xl flex items-center justify-center text-base"
                              style={{ background: '#2c2c2e' }}>↑</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Type filter chips */}
        {types.length > 0 && (
          <div className="max-w-7xl mx-auto px-6 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => { setActiveType(''); setQuery('') }}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full transition font-medium ${
                activeType === ''
                  ? 'bg-violet-600 text-white'
                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
              }`}
            >
              All
            </button>
            {types.map(({ type, count }) => (
              <button
                key={type}
                onClick={() => handleTypeClick(type)}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-full transition font-medium flex items-center gap-1.5 ${
                  activeType === type
                    ? 'bg-violet-600 text-white'
                    : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                }`}
              >
                <span>{TYPE_ICONS[type] || '🔗'}</span>
                <span>{TYPE_LABELS[type] || type}</span>
                <span className={`text-[10px] ${activeType === type ? 'text-violet-200' : 'text-neutral-400'}`}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Add modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={closeAdd}>
          <form
            onSubmit={handleAdd}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-3xl w-full max-w-md p-6 flex flex-col gap-4 shadow-2xl"
          >
            <h2 className="text-base font-semibold text-neutral-900">
              {saveTab === 'note' ? 'New note' : 'Save a link'}
            </h2>

            {saveTab === 'link' ? (
              <>
                <input
                  type="url"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  placeholder="https://…"
                  required
                  autoFocus
                  className="border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                />
                <textarea
                  value={notesInput}
                  onChange={e => setNotesInput(e.target.value)}
                  placeholder="Notes (optional)"
                  rows={2}
                  className="border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                />
              </>
            ) : (
              <>
                <input
                  type="text"
                  value={noteTitle}
                  onChange={e => setNoteTitle(e.target.value)}
                  placeholder="Title (optional)"
                  autoFocus
                  className="border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                />
                <textarea
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                  placeholder="Write your thought…"
                  rows={5}
                  className="border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                />
              </>
            )}

            {error && <p className="text-red-500 text-xs">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeAdd} className="px-4 py-2 text-sm rounded-full text-neutral-500 hover:bg-neutral-100 transition">
                Cancel
              </button>
              <button type="submit" disabled={adding} className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-full font-medium transition disabled:opacity-50">
                {adding ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <SaveDetail
          save={selected}
          onClose={() => setSelected(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}

      {/* Library */}
      <main className="max-w-7xl mx-auto px-4 py-6">

        {/* toolbar */}
        {!loading && saves.length > 0 && (
          <div className="flex items-center justify-between mb-5">
            <span className="text-xs text-neutral-400 font-medium tabular-nums">
              {saves.length} {saves.length === 1 ? 'item' : 'items'}
            </span>
            <div className="flex items-center gap-0.5 bg-neutral-100 rounded-xl p-1">
              {/* masonry */}
              <button
                onClick={() => changeView('masonry')}
                title="Masonry"
                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all ${view === 'masonry' ? 'bg-white shadow-sm text-neutral-800' : 'text-neutral-400 hover:text-neutral-600'}`}
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                  <rect x="1" y="1" width="6" height="9" rx="1.2"/>
                  <rect x="1" y="12" width="6" height="3" rx="1.2"/>
                  <rect x="9" y="1" width="6" height="3" rx="1.2"/>
                  <rect x="9" y="6" width="6" height="9" rx="1.2"/>
                </svg>
              </button>
              {/* grid */}
              <button
                onClick={() => changeView('grid')}
                title="Grid"
                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all ${view === 'grid' ? 'bg-white shadow-sm text-neutral-800' : 'text-neutral-400 hover:text-neutral-600'}`}
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                  <rect x="1" y="1" width="6" height="6" rx="1.2"/>
                  <rect x="9" y="1" width="6" height="6" rx="1.2"/>
                  <rect x="1" y="9" width="6" height="6" rx="1.2"/>
                  <rect x="9" y="9" width="6" height="6" rx="1.2"/>
                </svg>
              </button>
              {/* list */}
              <button
                onClick={() => changeView('list')}
                title="List"
                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all ${view === 'list' ? 'bg-white shadow-sm text-neutral-800' : 'text-neutral-400 hover:text-neutral-600'}`}
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                  <rect x="1" y="1" width="4" height="4" rx="0.8"/>
                  <rect x="7" y="2" width="8" height="2" rx="0.8"/>
                  <rect x="1" y="6" width="4" height="4" rx="0.8"/>
                  <rect x="7" y="7" width="8" height="2" rx="0.8"/>
                  <rect x="1" y="11" width="4" height="4" rx="0.8"/>
                  <rect x="7" y="12" width="8" height="2" rx="0.8"/>
                </svg>
              </button>
            </div>
          </div>
        )}

        {loading && saves.length === 0 && (
          <p className="text-center text-neutral-400 py-20 text-sm">Loading…</p>
        )}
        {!loading && saves.length === 0 && (
          <div className="text-center text-neutral-400 py-24">
            <p className="text-5xl mb-4">🧠</p>
            <p className="text-sm">
              {query
                ? `No results for "${query}"`
                : activeType
                  ? `No ${activeType}s saved yet.`
                  : 'Nothing saved yet. Hit + to add your first save.'}
            </p>
          </div>
        )}

        {view === 'masonry' && (
          <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
            {saves.map(save => (
              <SaveCard key={save.id} save={save} view="masonry"
                selecting={selecting} isSelected={selectedIds.has(save.id)}
                onClick={() => selecting ? toggleSelect(save.id) : setSelected(save)} />
            ))}
          </div>
        )}

        {view === 'grid' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {saves.map(save => (
              <SaveCard key={save.id} save={save} view="grid"
                selecting={selecting} isSelected={selectedIds.has(save.id)}
                onClick={() => selecting ? toggleSelect(save.id) : setSelected(save)} />
            ))}
          </div>
        )}

        {view === 'list' && (
          <div className="flex flex-col gap-1.5 max-w-3xl mx-auto">
            {saves.map(save => (
              <SaveCard key={save.id} save={save} view="list"
                selecting={selecting} isSelected={selectedIds.has(save.id)}
                onClick={() => selecting ? toggleSelect(save.id) : setSelected(save)} />
            ))}
          </div>
        )}

      </main>

      {/* Floating select bar */}
      {selecting && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-5 py-3 rounded-2xl bg-white shadow-xl border border-neutral-100">
          <span className="text-sm text-neutral-500 min-w-[80px]">
            {selectedIds.size === 0 ? 'Nothing selected' : `${selectedIds.size} item${selectedIds.size > 1 ? 's' : ''} selected`}
          </span>
          <button
            onClick={async () => {
              const res = await fetch(`${API}/collections`)
              setAllCollections(await res.json())
              setShowAddToCollection(true)
            }}
            disabled={selectedIds.size === 0}
            className="px-4 py-1.5 rounded-full text-sm font-medium bg-neutral-800 hover:bg-neutral-900 text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Add to Collection
          </button>
          <button
            onClick={handleDeleteSelected}
            disabled={selectedIds.size === 0}
            className="px-4 py-1.5 rounded-full text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Delete
          </button>
        </div>
      )}

      {/* Add to Collection modal */}
      {showAddToCollection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
             onClick={closeAddToCollection}>
          <div onClick={e => e.stopPropagation()}
               className="bg-white rounded-3xl w-full max-w-sm p-5 shadow-2xl flex flex-col gap-3">
            <h2 className="text-base font-semibold text-neutral-900">Add to Collection</h2>

            {allCollections.length > 0 && (
              <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
                {allCollections.map(c => (
                  <button
                    key={c.id}
                    onClick={async () => {
                      await fetch(`${API}/collections/${c.id}/items`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ save_ids: [...selectedIds] }),
                      })
                      closeAddToCollection()
                      exitSelect()
                    }}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-neutral-50 transition text-left"
                  >
                    <div className="w-5 h-5 rounded-full shrink-0" style={{ background: c.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">{c.name}</p>
                      <p className="text-xs text-neutral-400">{c.save_count} items</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {showNewCollInline ? (
              <div className="flex flex-col gap-3 border border-neutral-100 rounded-2xl p-4">
                <input
                  type="text"
                  value={newCollName}
                  onChange={e => setNewCollName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createCollAndAdd()}
                  placeholder="Collection name…"
                  autoFocus
                  className="text-sm outline-none border border-neutral-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-violet-400"
                />
                <div className="flex flex-wrap gap-2">
                  {PALETTE.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewCollColor(c)}
                      className="w-6 h-6 rounded-full transition-all"
                      style={{
                        background: c,
                        transform: newCollColor === c ? 'scale(1.25)' : 'scale(1)',
                        boxShadow: newCollColor === c ? `0 0 0 2px white, 0 0 0 3.5px ${c}` : 'none',
                      }}
                    />
                  ))}
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => { setShowNewCollInline(false); setNewCollName('') }}
                    className="text-xs text-neutral-400 hover:text-neutral-600 px-3 py-1.5 rounded-lg transition"
                  >Cancel</button>
                  <button
                    onClick={createCollAndAdd}
                    disabled={creatingColl || !newCollName.trim()}
                    className="text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg transition disabled:opacity-40"
                  >{creatingColl ? 'Creating…' : 'Create & Add'}</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowNewCollInline(true)}
                className="flex items-center gap-2 text-sm text-neutral-500 hover:text-violet-600 transition px-1 py-1"
              >
                <span className="text-lg font-light leading-none">+</span>
                New collection
              </button>
            )}

            <button onClick={closeAddToCollection}
              className="text-sm text-neutral-400 hover:text-neutral-600 transition text-center pt-1">
              Cancel
            </button>
          </div>
        </div>
      )}

      {showUniverse && <Universe onClose={() => setShowUniverse(false)} />}
      {showCollections && <Collections onClose={() => setShowCollections(false)} />}

      {/* Full-screen note editor */}
      {showNoteEditor && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#111' }}>
          {/* top bar */}
          <div className="flex items-center justify-between px-8 py-4 shrink-0">
            <button
              onClick={closeNoteEditor}
              className="text-sm font-medium transition"
              style={{ color: '#888' }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = '#888'}
            >
              ← Back
            </button>
            <button
              onClick={handleSaveNote}
              disabled={adding}
              className="px-5 py-1.5 rounded-full text-sm font-medium transition disabled:opacity-40"
              style={{ background: '#7c3aed', color: '#fff' }}
            >
              {adding ? 'Saving…' : 'Save'}
            </button>
          </div>

          {/* editor area */}
          <div className="flex-1 overflow-y-auto px-8 pb-16 flex flex-col gap-4" style={{ maxWidth: 800, width: '100%', margin: '0 auto' }}>
            <input
              type="text"
              value={noteTitle}
              onChange={e => setNoteTitle(e.target.value)}
              placeholder="Untitled note"
              autoFocus
              className="w-full bg-transparent outline-none font-semibold"
              style={{ fontSize: '2rem', lineHeight: 1.2, color: '#fff', caretColor: '#7c3aed' }}
            />
            <textarea
              value={noteContent}
              onChange={e => setNoteContent(e.target.value)}
              placeholder="Write something or press '/' for options"
              className="w-full flex-1 bg-transparent outline-none resize-none text-base leading-relaxed"
              style={{ color: '#bbb', caretColor: '#7c3aed', minHeight: '60vh', fontSize: '1rem' }}
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
          </div>
        </div>
      )}

      {/* hidden file upload input */}
      <input
        type="file"
        accept=".png,.jpg,.jpeg"
        ref={uploadInputRef}
        onChange={handleUpload}
        className="hidden"
      />
    </div>
  )
}
