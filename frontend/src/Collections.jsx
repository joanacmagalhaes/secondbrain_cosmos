import { useState, useEffect, useCallback } from 'react'
import SaveCard from './SaveCard'
import SaveDetail from './SaveDetail'

const API = 'http://localhost:8000'

const PALETTE = [
  '#AFC8E8', // steel blue
  '#E8B8C4', // dusty rose
  '#C4B8E8', // lavender
  '#E8CDB8', // peach
  '#B8D8C4', // mint
  '#D4C4A8', // sand
  '#E8D8A8', // butter
  '#C8B8D4', // mauve
]

// ── CollectionCard ────────────────────────────────────────────────────────────

function CollectionCard({ collection, onClick }) {
  const { name, color, save_count, preview_images } = collection
  const imgs = preview_images.slice(0, 3)

  const fan = [
    { rotate: -15, tx: -46, z: 2 },
    { rotate:   2, tx:   3, z: 4 },
    { rotate:  16, tx:  46, z: 3 },
  ]

  return (
    <div onClick={onClick} className="cursor-pointer select-none group">
      {/* folder area */}
      <div className="relative" style={{ height: 190 }}>
        {/* images fanning out */}
        {imgs.length > 0
          ? imgs.map((src, i) => (
              <img
                key={i}
                src={src}
                className="absolute rounded-xl object-cover shadow-md pointer-events-none"
                style={{
                  width: '46%',
                  height: 130,
                  bottom: 66,
                  left: '50%',
                  transform: `translateX(calc(-50% + ${fan[i].tx}px)) rotate(${fan[i].rotate}deg)`,
                  zIndex: fan[i].z,
                }}
              />
            ))
          : fan.map((cfg, i) => (
              <div
                key={i}
                className="absolute rounded-xl pointer-events-none"
                style={{
                  width: '46%',
                  height: 130,
                  bottom: 66,
                  left: '50%',
                  transform: `translateX(calc(-50% + ${cfg.tx}px)) rotate(${cfg.rotate}deg)`,
                  zIndex: cfg.z,
                  background: color,
                  opacity: 0.18,
                }}
              />
            ))}

        {/* colored box */}
        <div
          className="absolute bottom-0 inset-x-0 rounded-3xl transition-all duration-200"
          style={{ height: 90, background: color, zIndex: 5 }}
        />

        {/* subtle hover lift */}
        <div
          className="absolute bottom-0 inset-x-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{ height: 90, background: 'rgba(0,0,0,0.06)', zIndex: 6 }}
        />
      </div>

      {/* text */}
      <div className="mt-2.5 px-1">
        <p className="text-sm font-bold text-neutral-900 truncate">{name}</p>
        <p className="text-xs text-neutral-400 mt-0.5">
          {save_count} {save_count === 1 ? 'item' : 'items'}
        </p>
      </div>
    </div>
  )
}

// ── NewCollectionModal ────────────────────────────────────────────────────────

function NewCollectionModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(PALETTE[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API}/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), color }),
      })
      if (res.ok) {
        onCreate(await res.json())
        onClose()
      } else {
        const body = await res.json().catch(() => ({}))
        setError(body.detail || `Server error ${res.status}`)
      }
    } catch {
      setError('Cannot reach backend — is it running on port 8000?')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-3xl w-full max-w-sm p-6 flex flex-col gap-5 shadow-2xl"
      >
        <h2 className="text-base font-semibold text-neutral-900">New Collection</h2>

        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Name…"
          autoFocus
          className="border border-neutral-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-400"
        />

        <div>
          <p className="text-xs font-medium text-neutral-400 mb-3">Color</p>
          <div className="flex flex-wrap gap-2.5">
            {PALETTE.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-8 h-8 rounded-full transition-all duration-150"
                style={{
                  background: c,
                  transform: color === c ? 'scale(1.25)' : 'scale(1)',
                  boxShadow: color === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : 'none',
                }}
              />
            ))}
          </div>
        </div>

        {error && <p className="text-red-500 text-xs -mt-1">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm rounded-full text-neutral-500 hover:bg-neutral-100 transition">
            Cancel
          </button>
          <button type="submit" disabled={saving || !name.trim()}
            className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-full font-medium transition disabled:opacity-50">
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── SavesPicker ───────────────────────────────────────────────────────────────
// Full-screen picker to add library saves to a collection

function SavesPicker({ collectionId, existingIds, onAdd, onClose }) {
  const [allSaves, setAllSaves] = useState([])
  const [picked, setPicked] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch(`${API}/saves`).then(r => r.json()).then(data => {
      setAllSaves(data.filter(s => !existingIds.has(s.id)))
      setLoading(false)
    })
  }, [])

  const filtered = query.trim()
    ? allSaves.filter(s =>
        s.title?.toLowerCase().includes(query.toLowerCase()) ||
        s.description?.toLowerCase().includes(query.toLowerCase())
      )
    : allSaves

  const toggle = (id) => setPicked(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleAdd = async () => {
    if (!picked.size) return
    setSaving(true)
    const res = await fetch(`${API}/collections/${collectionId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ save_ids: [...picked] }),
    })
    setSaving(false)
    if (res.ok) {
      const addedSaves = allSaves.filter(s => picked.has(s.id))
      onAdd(addedSaves)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-[#f7f7f8] flex flex-col">
      <header className="bg-white/90 backdrop-blur border-b border-neutral-100 px-6 py-4 flex items-center gap-4">
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 transition">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search saves…"
          className="flex-1 bg-neutral-100 rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
        />
        <button
          onClick={handleAdd}
          disabled={!picked.size || saving}
          className="px-4 py-1.5 rounded-full bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition disabled:opacity-40"
        >
          {saving ? 'Adding…' : `Add${picked.size ? ` ${picked.size}` : ''}`}
        </button>
      </header>

      {picked.size > 0 && (
        <div className="bg-violet-50 border-b border-violet-100 px-6 py-2 text-xs text-violet-600 font-medium">
          {picked.size} selected
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-4 py-6">
        {loading && <p className="text-center text-neutral-400 py-20 text-sm">Loading…</p>}
        <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {filtered.map(save => (
            <SaveCard
              key={save.id}
              save={save}
              view="grid"
              selecting
              isSelected={picked.has(save.id)}
              onClick={() => toggle(save.id)}
            />
          ))}
        </div>
      </main>
    </div>
  )
}

// ── CollectionDetail ──────────────────────────────────────────────────────────

const VIEW_ICONS = {
  masonry: (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <rect x="1" y="1" width="6" height="9" rx="1.2"/><rect x="1" y="12" width="6" height="3" rx="1.2"/>
      <rect x="9" y="1" width="6" height="3" rx="1.2"/><rect x="9" y="6" width="6" height="9" rx="1.2"/>
    </svg>
  ),
  grid: (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <rect x="1" y="1" width="6" height="6" rx="1.2"/><rect x="9" y="1" width="6" height="6" rx="1.2"/>
      <rect x="1" y="9" width="6" height="6" rx="1.2"/><rect x="9" y="9" width="6" height="6" rx="1.2"/>
    </svg>
  ),
  list: (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <rect x="1" y="1" width="4" height="4" rx="0.8"/><rect x="7" y="2" width="8" height="2" rx="0.8"/>
      <rect x="1" y="6" width="4" height="4" rx="0.8"/><rect x="7" y="7" width="8" height="2" rx="0.8"/>
      <rect x="1" y="11" width="4" height="4" rx="0.8"/><rect x="7" y="12" width="8" height="2" rx="0.8"/>
    </svg>
  ),
}

function CollectionDetail({ collection, onBack, onUpdate }) {
  const [saves, setSaves] = useState([])
  const [view, setView] = useState('masonry')
  const [loading, setLoading] = useState(true)
  const [showPicker, setShowPicker] = useState(false)
  const [selected, setSelected] = useState(null)

  const reload = useCallback(() => {
    setLoading(true)
    fetch(`${API}/collections/${collection.id}/saves`)
      .then(r => r.json())
      .then(data => { setSaves(data); setLoading(false) })
  }, [collection.id])

  useEffect(() => { reload() }, [reload])

  const removeFromCollection = async (saveId, e) => {
    e.stopPropagation()
    await fetch(`${API}/collections/${collection.id}/items/${saveId}`, { method: 'DELETE' })
    setSaves(prev => prev.filter(s => s.id !== saveId))
    onUpdate({ ...collection, save_count: Math.max(0, (collection.save_count || 1) - 1) })
  }

  const handlePickerAdd = (newSaves) => {
    setSaves(prev => [...newSaves, ...prev])
    setShowPicker(false)
    onUpdate({ ...collection, save_count: (collection.save_count || 0) + newSaves.length })
  }

  const existingIds = new Set(saves.map(s => s.id))

  const CardWrapper = ({ save, children }) => {
    if (view === 'masonry') {
      return (
        <div className="relative break-inside-avoid mb-3 group/item">
          {children}
          <button
            onClick={(e) => removeFromCollection(save.id, e)}
            className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-black/50 text-white text-sm flex items-center justify-center opacity-0 group-hover/item:opacity-100 hover:bg-red-500 transition-all"
          >
            ×
          </button>
        </div>
      )
    }
    if (view === 'list') {
      return (
        <div className="relative group/item">
          {children}
          <button
            onClick={(e) => removeFromCollection(save.id, e)}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-black/40 text-white text-sm flex items-center justify-center opacity-0 group-hover/item:opacity-100 hover:bg-red-500 transition-all"
          >
            ×
          </button>
        </div>
      )
    }
    // grid
    return (
      <div className="relative group/item">
        {children}
        <button
          onClick={(e) => removeFromCollection(save.id, e)}
          className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-full bg-black/50 text-white text-sm flex items-center justify-center opacity-0 group-hover/item:opacity-100 hover:bg-red-500 transition-all"
        >
          ×
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="fixed inset-0 z-[50] bg-[#f7f7f8] flex flex-col">
        {/* header */}
        <header className="bg-white/90 backdrop-blur border-b border-neutral-100 px-6 py-4 flex items-center gap-3">
          <button onClick={onBack} className="text-neutral-400 hover:text-neutral-700 transition shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div
            className="w-3.5 h-3.5 rounded-full shrink-0"
            style={{ background: collection.color }}
          />
          <h1 className="text-base font-semibold text-neutral-900 flex-1 truncate">
            {collection.name}
          </h1>
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition shrink-0"
          >
            <span className="text-sm leading-none">+</span>
            Add
          </button>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-7xl mx-auto">
            {/* toolbar */}
            {saves.length > 0 && (
              <div className="flex items-center justify-between mb-5">
                <span className="text-xs text-neutral-400 font-medium">
                  {saves.length} {saves.length === 1 ? 'item' : 'items'}
                </span>
                <div className="flex items-center gap-0.5 bg-neutral-100 rounded-xl p-1">
                  {Object.entries(VIEW_ICONS).map(([v, icon]) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all ${view === v ? 'bg-white shadow-sm text-neutral-800' : 'text-neutral-400 hover:text-neutral-600'}`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loading && <p className="text-center text-neutral-400 py-20 text-sm">Loading…</p>}

            {!loading && saves.length === 0 && (
              <div className="text-center text-neutral-400 py-24">
                <div className="text-4xl mb-4">📂</div>
                <p className="text-sm">This collection is empty.</p>
                <button
                  onClick={() => setShowPicker(true)}
                  className="mt-4 px-5 py-2 rounded-full bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition"
                >
                  Add saves
                </button>
              </div>
            )}

            {view === 'masonry' && (
              <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
                {saves.map(save => (
                  <CardWrapper key={save.id} save={save}>
                    <SaveCard save={save} view="masonry" onClick={() => setSelected(save)} />
                  </CardWrapper>
                ))}
              </div>
            )}

            {view === 'grid' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                {saves.map(save => (
                  <CardWrapper key={save.id} save={save}>
                    <SaveCard save={save} view="grid" onClick={() => setSelected(save)} />
                  </CardWrapper>
                ))}
              </div>
            )}

            {view === 'list' && (
              <div className="flex flex-col gap-1.5 max-w-3xl mx-auto">
                {saves.map(save => (
                  <CardWrapper key={save.id} save={save}>
                    <SaveCard save={save} view="list" onClick={() => setSelected(save)} />
                  </CardWrapper>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {showPicker && (
        <SavesPicker
          collectionId={collection.id}
          existingIds={existingIds}
          onAdd={handlePickerAdd}
          onClose={() => setShowPicker(false)}
        />
      )}

      {selected && (
        <div className="fixed inset-0 z-[80]">
          <SaveDetail
            save={selected}
            onClose={() => setSelected(null)}
            onUpdate={(id, changes) => {
              setSaves(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s))
              if (selected?.id === id) setSelected(prev => ({ ...prev, ...changes }))
            }}
            onDelete={(id) => {
              setSaves(prev => prev.filter(s => s.id !== id))
              setSelected(null)
            }}
          />
        </div>
      )}
    </>
  )
}

// ── Collections (main grid page) ──────────────────────────────────────────────

export default function Collections({ onClose }) {
  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [openCollection, setOpenCollection] = useState(null)

  useEffect(() => {
    fetch(`${API}/collections`)
      .then(r => r.json())
      .then(data => { setCollections(data); setLoading(false) })
  }, [])

  const handleUpdate = (updated) => {
    setCollections(prev =>
      prev.map(c => c.id === updated.id ? { ...c, ...updated } : c)
    )
    if (openCollection?.id === updated.id) {
      setOpenCollection(prev => ({ ...prev, ...updated }))
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-[#f7f7f8] flex flex-col">
        {/* header */}
        <header className="bg-white/90 backdrop-blur border-b border-neutral-100 px-6 py-4 flex items-center gap-4">
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 transition">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <h1 className="text-base font-semibold text-neutral-900 flex-1">Collections</h1>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition"
          >
            <span className="text-lg leading-none">+</span>
            New collection
          </button>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-8">
          {loading && (
            <p className="text-center text-neutral-400 py-20 text-sm">Loading…</p>
          )}

          {!loading && collections.length === 0 && (
            <div className="text-center text-neutral-400 py-24">
              <p className="text-4xl mb-4">📁</p>
              <p className="text-sm font-medium text-neutral-600">No collections yet</p>
              <p className="text-xs mt-1 text-neutral-400">Create one to start organizing your saves.</p>
              <button
                onClick={() => setShowNew(true)}
                className="mt-6 px-5 py-2 rounded-full bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition"
              >
                New collection
              </button>
            </div>
          )}

          {collections.length > 0 && (
            <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-8">
              {collections.map(c => (
                <CollectionCard
                  key={c.id}
                  collection={c}
                  onClick={() => setOpenCollection(c)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {showNew && (
        <NewCollectionModal
          onClose={() => setShowNew(false)}
          onCreate={c => setCollections(prev => [c, ...prev])}
        />
      )}

      {openCollection && (
        <CollectionDetail
          collection={openCollection}
          onBack={() => setOpenCollection(null)}
          onUpdate={handleUpdate}
        />
      )}
    </>
  )
}
