import { useState, useEffect } from 'react'

const API = 'http://localhost:8000'

export default function SaveDetail({ save, onClose, onUpdate, onDelete }) {
  const [tags, setTags] = useState(save.tags)
  const [tagInput, setTagInput] = useState(save.tags.join(', '))
  const [editingTags, setEditingTags] = useState(false)
  const [notes, setNotes] = useState(save.notes || '')
  const [editingNotes, setEditingNotes] = useState(false)
  const [currentSave, setCurrentSave] = useState(save)
  const [imgIndex, setImgIndex] = useState(0)
  const carouselImages = save.images?.length > 1 ? save.images : (save.image ? [save.image] : [])

  let hostname = ''
  try { hostname = new URL(save.url).hostname.replace('www.', '') } catch {}

  // poll for tags if they're still empty (Ollama still running in background)
  useEffect(() => {
    if (tags.length > 0) return
    const interval = setInterval(async () => {
      const res = await fetch(`${API}/saves/${save.id}`)
      if (!res.ok) return
      const updated = await res.json()
      if (updated.tags.length > 0) {
        setTags(updated.tags)
        setTagInput(updated.tags.join(', '))
        clearInterval(interval)
      }
    }, 4000)
    return () => clearInterval(interval)
  }, [save.id, tags.length])

  const saveTags = async () => {
    const newTags = tagInput.split(',').map(t => t.trim()).filter(Boolean)
    await fetch(`${API}/saves/${save.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags }),
    })
    setTags(newTags)
    setEditingTags(false)
    onUpdate(save.id, { tags: newTags })
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-xl max-h-[88vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* image / carousel */}
        {carouselImages.length > 0 && (
          <div className="relative overflow-hidden rounded-t-3xl">
            <img
              key={imgIndex}
              src={carouselImages[imgIndex]}
              alt=""
              className="w-full h-auto block"
              onError={e => { e.target.parentElement.style.display = 'none' }}
            />

            {/* carousel nav */}
            {carouselImages.length > 1 && (
              <>
                {imgIndex > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); setImgIndex(i => i - 1) }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm
                               text-white text-lg flex items-center justify-center hover:bg-black/70 transition-colors"
                  >‹</button>
                )}
                {imgIndex < carouselImages.length - 1 && (
                  <button
                    onClick={e => { e.stopPropagation(); setImgIndex(i => i + 1) }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm
                               text-white text-lg flex items-center justify-center hover:bg-black/70 transition-colors"
                  >›</button>
                )}
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
                  {carouselImages.map((_, i) => (
                    <span key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === imgIndex ? 'bg-white' : 'bg-white/40'}`} />
                  ))}
                </div>
              </>
            )}

            {/* play button for video types */}
            {['YouTube', 'TikTok', 'Video', 'InstagramVideo'].includes(save.type) && (
              <a
                href={save.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="absolute inset-0 flex items-center justify-center group/play"
              >
                <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center
                                group-hover/play:bg-black/70 transition-colors">
                  <svg viewBox="0 0 24 24" fill="white" className="w-7 h-7 ml-1">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </div>
              </a>
            )}
          </div>
        )}

        <div className="p-6 flex flex-col gap-5">
          {/* title + source */}
          <div>
            <a
              href={save.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-lg font-semibold text-neutral-900 hover:text-violet-700 transition-colors leading-snug block mb-1"
            >
              {save.title || save.url}
            </a>
            <span className="text-xs text-neutral-400">{hostname}</span>
          </div>

          {/* description */}
          {save.description && (
            <p className="text-sm text-neutral-600 leading-relaxed">{save.description}</p>
          )}

          {/* page content preview */}
          {save.content && save.content !== save.description && (
            <details className="group">
              <summary className="text-xs text-neutral-400 cursor-pointer hover:text-violet-600 transition-colors select-none">
                Show full page content
              </summary>
              <p className="text-sm text-neutral-500 leading-relaxed mt-2 whitespace-pre-wrap line-clamp-[20]">
                {save.content}
              </p>
            </details>
          )}

          {/* tags */}
          <div>
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-2">Tags</p>
            {editingTags ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveTags()}
                  className="flex-1 border border-neutral-200 rounded-xl px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                  placeholder="tag1, tag2, tag3"
                />
                <button onClick={saveTags} className="text-sm bg-violet-600 text-white px-3 py-1.5 rounded-xl">Save</button>
                <button onClick={() => setEditingTags(false)} className="text-sm text-neutral-500 px-2 py-1.5 rounded-xl hover:bg-neutral-100">✕</button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 items-center">
                {tags.length === 0
                  ? <span className="text-xs text-neutral-400 italic animate-pulse">tagging…</span>
                  : tags.map(tag => (
                    <span key={tag} className="text-xs bg-violet-50 text-violet-600 rounded-full px-3 py-1 font-medium">
                      {tag}
                    </span>
                  ))
                }
                <button
                  onClick={() => setEditingTags(true)}
                  className="text-xs text-neutral-300 hover:text-violet-600 transition-colors ml-1"
                >
                  + edit
                </button>
              </div>
            )}
          </div>

          {/* notes */}
          <div>
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-2">Notes</p>
            {editingNotes ? (
              <div className="flex flex-col gap-2">
                <textarea
                  autoFocus
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  className="border border-neutral-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                />
                <div className="flex gap-2">
                  <button onClick={saveNotes} className="text-sm bg-violet-600 text-white px-3 py-1.5 rounded-xl">Save</button>
                  <button onClick={() => setEditingNotes(false)} className="text-sm text-neutral-500 px-2 py-1.5 rounded-xl hover:bg-neutral-100">Cancel</button>
                </div>
              </div>
            ) : (
              <p
                onClick={() => setEditingNotes(true)}
                className="text-sm text-neutral-500 cursor-text hover:text-neutral-700 transition-colors min-h-[20px]"
              >
                {notes || <span className="italic text-neutral-300">Add a note…</span>}
              </p>
            )}
          </div>

          {/* footer */}
          <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
            <span className="text-xs text-neutral-300">
              {new Date(save.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
            <div className="flex gap-3 items-center">
              <button
                onClick={handleDelete}
                className="text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                Delete
              </button>
              <button
                onClick={onClose}
                className="text-xs text-neutral-400 hover:text-neutral-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
