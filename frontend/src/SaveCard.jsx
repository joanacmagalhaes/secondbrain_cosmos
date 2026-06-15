import { useState } from 'react'

const VIDEO_TYPES = new Set(['YouTube', 'TikTok', 'Video', 'InstagramVideo'])

const TYPE_ICONS = {
  YouTube:          '▶',
  Instagram:        '◎',
  InstagramVideo:   '▶',
  TikTok:           '♪',
  TikTokSlideshow:  '♪',
  Pinterest:        '⊕',
  Twitter:          '✕',
  Reddit:           '◉',
  Spotify:          '♫',
  GitHub:           '⌥',
  Video:            '▶',
  Recipe:           '⬡',
  Product:          '◻',
  Article:          '◈',
  Note:             '✎',
  Image:            '◼',
}

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo`
  return `${Math.floor(mo / 12)}y`
}

export default function SaveCard({ save, onClick, selecting = false, isSelected = false, view = 'masonry' }) {
  const [imgError, setImgError] = useState(false)

  let hostname = ''
  if (!save.url?.startsWith('note://') && !save.url?.startsWith('upload://')) {
    try { hostname = new URL(save.url).hostname.replace('www.', '') } catch {}
  }

  const icon     = TYPE_ICONS[save.type] ?? null
  const hasImage = !!save.image && !imgError
  const isTagging = !save.tags?.length && !save.topics?.length
  const isVideo  = VIDEO_TYPES.has(save.type)

  // ── GRID ─────────────────────────────────────────────────────────────────
  if (view === 'grid') {
    return (
      <div
        onClick={onClick}
        className={`relative overflow-hidden rounded-2xl cursor-pointer group aspect-square bg-neutral-100 ${isSelected ? 'ring-2 ring-violet-500 ring-offset-2' : ''}`}
      >
        {hasImage ? (
          <img src={save.image} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" onError={() => setImgError(true)} />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-white">
            {icon && <span className="text-3xl text-neutral-200 mb-3">{icon}</span>}
            <p className="text-xs font-medium text-neutral-700 text-center line-clamp-4 leading-snug">
              {save.title || hostname || 'Untitled'}
            </p>
          </div>
        )}

        {/* selection overlay */}
        {selecting && (
          <div className={`absolute inset-0 flex items-end justify-start p-2 transition-all ${isSelected ? 'bg-violet-600/20' : ''}`}>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-violet-600 border-violet-600' : 'bg-white/80 border-white'}`}>
              {isSelected && (
                <svg viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5">
                  <path d="M2 6l3 3 5-5"/>
                </svg>
              )}
            </div>
          </div>
        )}

        {isTagging && (
          <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
        )}

        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4 ml-0.5">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>
        )}

        {/* hover title overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3 pointer-events-none">
          <p className="text-white text-xs font-medium line-clamp-2 leading-snug">
            {save.title || hostname}
          </p>
          {hostname && <p className="text-white/50 text-[10px] mt-0.5">{hostname}</p>}
        </div>
      </div>
    )
  }

  // ── LIST ──────────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div
        onClick={onClick}
        className={`flex items-center gap-3 bg-white rounded-2xl p-3 cursor-pointer hover:shadow-[0_4px_16px_rgba(0,0,0,0.07)] transition-all duration-200 ${isSelected ? 'ring-2 ring-violet-500' : ''}`}
      >
        {/* thumbnail */}
        <div className="relative shrink-0 w-11 h-11 rounded-xl overflow-hidden bg-neutral-100 flex items-center justify-center">
          {hasImage ? (
            <img src={save.image} alt="" className="w-full h-full object-cover" onError={() => setImgError(true)} />
          ) : (
            <span className="text-base text-neutral-300">{icon ?? '◈'}</span>
          )}
          {selecting && (
            <div className={`absolute inset-0 flex items-center justify-center transition-all ${isSelected ? 'bg-violet-600/75' : 'bg-black/15'}`}>
              {isSelected && (
                <svg viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                  <path d="M2 6l3 3 5-5"/>
                </svg>
              )}
            </div>
          )}
        </div>

        {/* content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-900 line-clamp-1 leading-snug">
            {save.title || hostname || 'Untitled'}
          </p>
          {(save.description || hostname) && (
            <p className="text-[11px] text-neutral-400 line-clamp-1 mt-0.5">
              {save.description || hostname}
            </p>
          )}
          {save.tags?.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {save.tags.slice(0, 4).map(t => (
                <span key={t} className="text-[10px] bg-neutral-100 text-neutral-400 px-1.5 py-0.5 rounded-full">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* meta */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className="text-[10px] text-neutral-300 whitespace-nowrap">{timeAgo(save.created_at)}</span>
          {icon && <span className="text-[11px] text-neutral-300">{icon}</span>}
          {isTagging && <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />}
        </div>
      </div>
    )
  }

  // ── MASONRY (default) ─────────────────────────────────────────────────────
  if (hasImage) {
    return (
      <div
        onClick={onClick}
        className={`break-inside-avoid mb-3 rounded-2xl overflow-hidden cursor-pointer relative group transition-all ${isSelected ? 'ring-2 ring-violet-500 ring-offset-2' : ''}`}
      >
        <img
          src={save.image}
          alt=""
          className="w-full h-auto block"
          onError={() => setImgError(true)}
        />

        {selecting && (
          <div className={`absolute top-2.5 left-2.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-violet-600 border-violet-600' : 'bg-white/80 border-white'}`}>
            {isSelected && (
              <svg viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                <path d="M2 6l3 3 5-5"/>
              </svg>
            )}
          </div>
        )}

        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5 ml-0.5">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end p-3">
          <span className="text-white text-[11px] font-medium flex items-center gap-1.5">
            {icon && <span className="opacity-80">{icon}</span>}
            {hostname}
          </span>
        </div>

        {save.images?.length > 1 && (
          <div className="absolute top-2.5 right-2.5 text-white drop-shadow pointer-events-none">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm2 0v12h12V6H4zM6 2h13a3 3 0 013 3v13h-2V5a1 1 0 00-1-1H6V2z"/>
            </svg>
          </div>
        )}

        {save.price && (
          <div className="absolute top-2.5 left-2.5 bg-black/70 backdrop-blur-sm text-white text-[11px] font-semibold px-2 py-0.5 rounded-md pointer-events-none">
            {save.price}
          </div>
        )}

        {isTagging && !save.price && (
          <div className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
        )}
      </div>
    )
  }

  return (
    <div
      onClick={onClick}
      className={`break-inside-avoid mb-3 bg-white rounded-2xl p-4 cursor-pointer
                 shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.11)]
                 transition-all duration-200 group relative ${isSelected ? 'ring-2 ring-violet-500 ring-offset-2' : ''}`}
    >
      {selecting && (
        <div className={`absolute top-3 right-3 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-violet-600 border-violet-600' : 'border-neutral-300'}`}>
          {isSelected && (
            <svg viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
              <path d="M2 6l3 3 5-5"/>
            </svg>
          )}
        </div>
      )}
      {save.price && (
        <span className="inline-block mb-2 bg-neutral-100 text-neutral-600 text-[11px] font-semibold px-2 py-0.5 rounded-md">
          {save.price}
        </span>
      )}
      <p className="text-sm font-medium text-neutral-900 leading-snug line-clamp-5 mb-3">
        {save.title || hostname}
      </p>
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-neutral-400 text-xs">{icon}</span>}
        <span className="text-[11px] text-neutral-300">{hostname}</span>
        {isTagging && (
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
        )}
      </div>
    </div>
  )
}
