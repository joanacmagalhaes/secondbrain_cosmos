import { useState, useEffect, useRef } from 'react'

const API = 'http://localhost:8000'

const PALETTE = [
  '#AFC8E8', '#E8B8C4', '#C4B8E8', '#E8CDB8',
  '#B8D8C4', '#D4C4A8', '#E8D8A8', '#C8B8D4',
]

const TYPE_LABELS = {
  YouTube: 'YouTube', Instagram: 'Instagram', InstagramVideo: 'Instagram Reel',
  TikTok: 'TikTok', TikTokSlideshow: 'TikTok Slideshow', Pinterest: 'Pinterest',
  Twitter: 'Twitter / X', Reddit: 'Reddit', Spotify: 'Spotify', GitHub: 'GitHub',
  Video: 'Video', Recipe: 'Recipe', Product: 'Product', Article: 'Article',
}

export default function SaveDetail({ save, onClose, onUpdate, onDelete }) {
  const [summary, setSummary]   = useState(save.summary || '')
  const [topics, setTopics]     = useState(Array.isArray(save.topics) ? save.topics : [])
  const [entities, setEntities] = useState(Array.isArray(save.entities) ? save.entities : [])
  const [notes, setNotes] = useState(save.notes || '')
  const [editingNotes, setEditingNotes] = useState(false)
  const [imgIndex, setImgIndex] = useState(0)
  const [saveCollections, setSaveCollections] = useState([])
  const [allCollections, setAllCollections] = useState([])
  const [showCollectionDropdown, setShowCollectionDropdown] = useState(false)
  const [showNewCollForm, setShowNewCollForm] = useState(false)
  const [newCollName, setNewCollName] = useState('')
  const [newCollColor, setNewCollColor] = useState(PALETTE[0])
  const [creatingColl, setCreatingColl] = useState(false)
  const collectionDropdownRef = useRef(null)
  const carouselImages = save.images?.length > 1 ? save.images : (save.image ? [save.image] : [])

  let hostname = ''
  try { hostname = new URL(save.url).hostname.replace('www.', '') } catch {}

  const dateLabel = save.created_at
    ? new Date(save.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : ''

  // Poll while the background pipeline hasn't run yet (brand-new save)
  useEffect(() => {
    if (save.tags?.length > 0) return
    const interval = setInterval(async () => {
      const res = await fetch(`${API}/saves/${save.id}`)
      if (!res.ok) return
      const updated = await res.json()
      if (updated.tags?.length > 0) {
        setSummary(updated.summary || '')
        setTopics(updated.topics || [])
        setEntities(updated.entities || [])
        clearInterval(interval)
      }
    }, 4000)
    return () => clearInterval(interval)
  }, [save.id, save.tags?.length])

  useEffect(() => {
    fetch(`${API}/saves/${save.id}/collections`)
      .then(r => r.json())
      .then(data => setSaveCollections(data))
      .catch(() => {})
  }, [save.id])

  useEffect(() => {
    if (!showCollectionDropdown) return
    const handler = (e) => {
      if (collectionDropdownRef.current && !collectionDropdownRef.current.contains(e.target)) {
        setShowCollectionDropdown(false)
        setShowNewCollForm(false)
        setNewCollName('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCollectionDropdown])

  const loadAllCollections = async () => {
    if (allCollections.length > 0) return
    const res = await fetch(`${API}/collections`)
    if (res.ok) setAllCollections(await res.json())
  }

  const addToCollection = async (collection) => {
    await fetch(`${API}/collections/${collection.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ save_ids: [save.id] }),
    })
    setSaveCollections(prev => [...prev, collection])
    setShowCollectionDropdown(false)
  }

  const createCollAndAddToSave = async () => {
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
        body: JSON.stringify({ save_ids: [save.id] }),
      })
      setSaveCollections(prev => [...prev, { id: coll.id, name: coll.name, color: coll.color }])
      setAllCollections(prev => [coll, ...prev])
      setShowCollectionDropdown(false)
      setShowNewCollForm(false)
      setNewCollName('')
      setNewCollColor(PALETTE[0])
    } finally {
      setCreatingColl(false)
    }
  }

  const saveNotes = async () => {
    await fetch(`${API}/saves/${save.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
    setEditingNotes(false)
    onUpdate(save.id, { notes })
  }

  const handleDelete = async () => {
    await fetch(`${API}/saves/${save.id}`, { method: 'DELETE' })
    onDelete(save.id)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/25 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="min-h-full flex items-center justify-center p-6">
        <div
          className="w-full max-w-6xl rounded-3xl shadow-2xl overflow-hidden my-4"
          style={{ background: '#f4f4f2' }}
          onClick={e => e.stopPropagation()}
        >

          {/* Nav */}
          <div className="flex items-center justify-between px-10 pt-7 pb-0">
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-700 transition-colors"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <path d="M10 3L5 8l5 5"/>
              </svg>
              Back
            </button>
            <div className="flex items-center gap-4">
              <a
                href={save.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800 transition-colors border border-neutral-300 rounded-full px-3 py-1"
              >
                Open link
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                  <path d="M3 8h10M9 4l4 4-4 4"/>
                </svg>
              </a>
              <button
                onClick={handleDelete}
                className="text-sm text-neutral-400 hover:text-red-500 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>

          {/* Hero: left (title + topics + summary + desc) | right (image) */}
          <div className="px-10 py-8 grid grid-cols-3 gap-10 items-start">

            {/* Left */}
            <div className="col-span-1 flex flex-col gap-5">
              <h1 className="text-4xl font-bold text-neutral-900 leading-tight">
                {save.title || hostname}
              </h1>

              {/* Topics */}
              {topics.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {topics.map(topic => (
                    <span
                      key={topic}
                      className="text-xs px-3 py-1 rounded-full bg-neutral-100 text-neutral-500 font-medium"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              ) : save.tags?.length === 0 && (
                <span className="text-xs text-neutral-400 italic animate-pulse">analysing…</span>
              )}

              {/* AI Summary */}
              {summary && (
                <p className="text-sm text-neutral-500 italic leading-relaxed">
                  {summary}
                </p>
              )}

              {/* Scraped description */}
              {save.description && (
                <p className="text-neutral-600 leading-relaxed text-base">
                  {save.description}
                </p>
              )}
            </div>

            {/* Right: image */}
            <div className="col-span-2">
              {carouselImages.length > 0 ? (
                <div className="relative rounded-2xl overflow-hidden bg-neutral-100">
                  <img
                    key={imgIndex}
                    src={carouselImages[imgIndex]}
                    alt=""
                    className="w-full h-auto block"
                    onError={e => { e.target.parentElement.style.display = 'none' }}
                  />

                  {/* play button for video types */}
                  {['YouTube', 'TikTok', 'Video', 'InstagramVideo'].includes(save.type) && (
                    <a
                      href={save.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="absolute inset-0 flex items-center justify-center group/play"
                    >
                      <div className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center group-hover/play:bg-black/70 transition-colors">
                        <svg viewBox="0 0 24 24" fill="white" className="w-6 h-6 ml-0.5"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                    </a>
                  )}

                  {/* carousel controls */}
                  {carouselImages.length > 1 && (
                    <>
                      <button
                        onClick={e => { e.stopPropagation(); setImgIndex(i => Math.max(0, i - 1)) }}
                        disabled={imgIndex === 0}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 text-white text-xl flex items-center justify-center hover:bg-black/80 transition-colors disabled:opacity-20 disabled:cursor-default"
                      >‹</button>
                      <button
                        onClick={e => { e.stopPropagation(); setImgIndex(i => Math.min(carouselImages.length - 1, i + 1)) }}
                        disabled={imgIndex === carouselImages.length - 1}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 text-white text-xl flex items-center justify-center hover:bg-black/80 transition-colors disabled:opacity-20 disabled:cursor-default"
                      >›</button>
                      <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
                        {carouselImages.map((_, i) => (
                          <span key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === imgIndex ? 'bg-white' : 'bg-white/40'}`} />
                        ))}
                      </div>
                      <div className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full pointer-events-none">
                        {imgIndex + 1} / {carouselImages.length}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl bg-neutral-100 flex items-center justify-center text-neutral-400 text-sm" style={{ minHeight: '200px' }}>
                  No image
                </div>
              )}
            </div>
          </div>

          {/* Bottom cards */}
          <div className="px-10 pb-10 grid grid-cols-3 gap-5">

            {/* Details */}
            <div className="bg-white rounded-2xl p-5">
              <p className="text-sm font-semibold text-neutral-900 mb-4">Details</p>
              <div className="flex flex-col gap-2.5">
                {save.type && (
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-400">Type</span>
                    <span className="text-neutral-700">{TYPE_LABELS[save.type] || save.type}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-400">Added</span>
                  <span className="text-neutral-700">{dateLabel}</span>
                </div>
                {save.price && (
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-400">Price</span>
                    <span className="text-neutral-700 font-medium">{save.price}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm gap-4">
                  <span className="text-neutral-400 shrink-0">Link</span>
                  <a
                    href={save.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-neutral-600 hover:text-neutral-900 truncate transition-colors"
                  >
                    {hostname} ↗
                  </a>
                </div>
                {entities.length > 0 && (
                  <div className="flex flex-col gap-2 pt-1">
                    <span className="text-neutral-400 text-sm">Entities</span>
                    <div className="flex flex-wrap gap-1.5">
                      {entities.map(e => (
                        <span
                          key={e}
                          className="text-xs px-2 py-0.5 rounded-md bg-neutral-50 text-neutral-600 border border-neutral-200"
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-2xl p-5 flex flex-col gap-3">
              <p className="text-sm font-semibold text-neutral-900">Notes</p>
              {editingNotes ? (
                <>
                  <textarea
                    autoFocus
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={4}
                    className="text-sm text-neutral-700 leading-relaxed resize-none outline-none w-full"
                    placeholder="Write something…"
                  />
                  <div className="flex gap-2">
                    <button onClick={saveNotes} className="text-xs bg-neutral-900 text-white px-3 py-1.5 rounded-lg">Save</button>
                    <button onClick={() => setEditingNotes(false)} className="text-xs text-neutral-400 hover:text-neutral-700 px-2 py-1.5 rounded-lg">Cancel</button>
                  </div>
                </>
              ) : (
                <p
                  onClick={() => setEditingNotes(true)}
                  className="text-sm text-neutral-500 leading-relaxed cursor-text flex-1"
                >
                  {notes || <span className="text-neutral-300 italic">Add a note…</span>}
                </p>
              )}
            </div>

            {/* Collections */}
            <div className="bg-white rounded-2xl p-5 flex flex-col gap-3">
              <p className="text-sm font-semibold text-neutral-900">Collections</p>
              <div className="flex flex-wrap gap-2 items-center">
                {saveCollections.map(c => (
                  <span
                    key={c.id}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
                    style={{ background: c.color + '40' }}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                    <span className="text-neutral-700">{c.name}</span>
                  </span>
                ))}
                <div className="relative" ref={collectionDropdownRef}>
                  <button
                    onClick={() => { setShowCollectionDropdown(p => !p); loadAllCollections() }}
                    className="text-xs px-2.5 py-1 rounded-full border border-dashed border-neutral-300 text-neutral-400 hover:border-neutral-400 hover:text-neutral-600 transition-colors"
                  >
                    + Add
                  </button>
                  {showCollectionDropdown && (
                    <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-lg border border-neutral-100 py-1.5 z-10 min-w-[190px]">
                      {allCollections
                        .filter(c => !saveCollections.find(sc => sc.id === c.id))
                        .map(c => (
                          <button
                            key={c.id}
                            onClick={() => addToCollection(c)}
                            className="flex items-center gap-2.5 w-full text-left text-xs px-3 py-1.5 hover:bg-neutral-50 transition-colors"
                          >
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                            <span className="text-neutral-700">{c.name}</span>
                          </button>
                        ))
                      }

                      {showNewCollForm ? (
                        <div className="px-3 py-2 flex flex-col gap-2 border-t border-neutral-100 mt-1">
                          <input
                            type="text"
                            value={newCollName}
                            onChange={e => setNewCollName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && createCollAndAddToSave()}
                            placeholder="Name…"
                            autoFocus
                            className="text-xs outline-none border border-neutral-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-violet-400 w-full"
                          />
                          <div className="flex flex-wrap gap-1.5">
                            {PALETTE.map(c => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setNewCollColor(c)}
                                className="w-4 h-4 rounded-full transition-all"
                                style={{
                                  background: c,
                                  transform: newCollColor === c ? 'scale(1.3)' : 'scale(1)',
                                  boxShadow: newCollColor === c ? `0 0 0 1.5px white, 0 0 0 3px ${c}` : 'none',
                                }}
                              />
                            ))}
                          </div>
                          <div className="flex gap-1.5 justify-end">
                            <button
                              onClick={() => { setShowNewCollForm(false); setNewCollName('') }}
                              className="text-[11px] text-neutral-400 hover:text-neutral-600 px-2 py-1 rounded-md transition"
                            >Cancel</button>
                            <button
                              onClick={createCollAndAddToSave}
                              disabled={creatingColl || !newCollName.trim()}
                              className="text-[11px] bg-violet-600 hover:bg-violet-700 text-white px-2 py-1 rounded-md transition disabled:opacity-40"
                            >{creatingColl ? '…' : 'Create'}</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowNewCollForm(true)}
                          className="flex items-center gap-1.5 w-full text-xs px-3 py-1.5 text-neutral-400 hover:text-violet-600 transition-colors border-t border-neutral-100 mt-1"
                        >
                          <span className="text-sm font-light leading-none">+</span>
                          New collection
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
