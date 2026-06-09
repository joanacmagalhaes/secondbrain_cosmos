import { useState } from 'react'

const VIDEO_TYPES = new Set(['YouTube', 'TikTok', 'Video', 'InstagramVideo'])

const TYPE_ICONS = {
  YouTube:          '▶',
  Instagram:        '◎',
  InstagramVideo:   '▶',
  TikTok:           '♪',
  TikTokSlideshow:  '♪',
  Pinterest: '⊕',
  Twitter:   '✕',
  Reddit:    '◉',
  Spotify:   '♫',
  GitHub:    '⌥',
  Video:     '▶',
  Recipe:    '⬡',
  Product:   '◻',
  Article:   '◈',
}

export default function SaveCard({ save, onClick }) {
  const [imgError, setImgError] = useState(false)

  let hostname = ''
  try { hostname = new URL(save.url).hostname.replace('www.', '') } catch {}

  const icon     = TYPE_ICONS[save.type] || null
  const hasImage = !!save.image && !imgError
  const isTagging = save.tags.length === 0
  const isVideo  = VIDEO_TYPES.has(save.type)

  if (hasImage) {
    return (
      <div
        onClick={onClick}
        className="break-inside-avoid mb-3 rounded-2xl overflow-hidden cursor-pointer relative group"
      >
        <img
          src={save.image}
          alt=""
          className="w-full h-auto block"
          onError={() => setImgError(true)}
        />

        {/* play icon — always visible on video cards */}
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5 ml-0.5">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>
        )}

        {/* hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent
                        opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end p-3">
          <span className="text-white text-[11px] font-medium flex items-center gap-1.5">
            {icon && <span className="opacity-80">{icon}</span>}
            {hostname}
          </span>
        </div>

        {/* carousel indicator */}
        {save.images?.length > 1 && (
          <div className="absolute top-2.5 right-2.5 text-white drop-shadow pointer-events-none">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm2 0v12h12V6H4zM6 2h13a3 3 0 013 3v13h-2V5a1 1 0 00-1-1H6V2z"/>
            </svg>
          </div>
        )}

        {/* price badge */}
        {save.price && (
          <div className="absolute top-2.5 left-2.5 bg-black/70 backdrop-blur-sm text-white text-[11px] font-semibold px-2 py-0.5 rounded-md pointer-events-none">
            {save.price}
          </div>
        )}

        {/* tagging indicator */}
        {isTagging && !save.price && (
          <div className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
        )}
      </div>
    )
  }

  /* text-only card (no image) */
  return (
    <div
      onClick={onClick}
      className="break-inside-avoid mb-3 bg-white rounded-2xl p-4 cursor-pointer
                 shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.11)]
                 transition-shadow duration-200 group"
    >
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
