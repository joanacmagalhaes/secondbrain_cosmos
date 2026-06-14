import { useState, useEffect, useCallback } from 'react'
import SaveCard from './SaveCard'
import SaveDetail from './SaveDetail'
import Universe from './Universe'

const API = 'http://localhost:8000'

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
  const [adding, setAdding] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showUniverse, setShowUniverse] = useState(false)

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
  const closeAdd = () => { setShowAddModal(false); setError('') }

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!urlInput.trim()) return
    setAdding(true)
    setError('')
    try {
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
    } catch {
      setError('Cannot reach backend.')
    } finally {
      setAdding(false)
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

  return (
    <div className="min-h-screen bg-[#f7f7f8] font-sans">

      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4">
          <span className="text-base font-semibold text-violet-600 shrink-0 tracking-tight">secondmind</span>
          <input
            type="search"
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveType('') }}
            placeholder="Search anything…"
            className="flex-1 bg-neutral-100 rounded-full px-5 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300 transition placeholder:text-neutral-400"
          />
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
            onClick={openAdd}
            className="shrink-0 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-full transition"
          >
            + Save
          </button>
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
            <h2 className="text-base font-semibold text-neutral-900">Save something</h2>
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

      {/* Grid */}
      <main className="max-w-7xl mx-auto px-4 py-8">
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
                  : 'Nothing saved yet. Hit + Save to add your first link.'}
            </p>
          </div>
        )}
        <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
          {saves.map(save => (
            <SaveCard
              key={save.id}
              save={save}
              onClick={() => setSelected(save)}
            />
          ))}
        </div>
      </main>
      {showUniverse && <Universe onClose={() => setShowUniverse(false)} />}
    </div>
  )
}
