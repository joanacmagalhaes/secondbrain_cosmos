import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'

const API = 'http://localhost:8000'

const PALETTE = [
  { bg: 'rgba(196,181,253,0.22)', glow: 'rgba(167,139,250,0.15)', border: 'rgba(167,139,250,0.55)', dot: '#7c3aed', line: 'rgba(167,139,250,0.3)', text: '#5b21b6' },
  { bg: 'rgba(253,230,138,0.22)', glow: 'rgba(251,191,36,0.15)',  border: 'rgba(251,191,36,0.55)',  dot: '#b45309', line: 'rgba(251,191,36,0.3)',  text: '#78350f' },
  { bg: 'rgba(187,247,208,0.22)', glow: 'rgba(74,222,128,0.15)',  border: 'rgba(74,222,128,0.55)',  dot: '#15803d', line: 'rgba(74,222,128,0.3)',  text: '#14532d' },
  { bg: 'rgba(254,202,202,0.22)', glow: 'rgba(248,113,113,0.15)', border: 'rgba(248,113,113,0.55)', dot: '#b91c1c', line: 'rgba(248,113,113,0.3)', text: '#7f1d1d' },
  { bg: 'rgba(191,219,254,0.22)', glow: 'rgba(96,165,250,0.15)',  border: 'rgba(96,165,250,0.55)',  dot: '#1d4ed8', line: 'rgba(96,165,250,0.3)',  text: '#1e3a8a' },
  { bg: 'rgba(251,207,232,0.22)', glow: 'rgba(244,114,182,0.15)', border: 'rgba(244,114,182,0.55)', dot: '#be185d', line: 'rgba(244,114,182,0.3)', text: '#831843' },
]

// 14 distinct positions so clusters never share a center
const CLUSTER_LAYOUT = [
  [0.40, 0.44],
  [0.65, 0.30],
  [0.72, 0.64],
  [0.44, 0.70],
  [0.20, 0.50],
  [0.57, 0.50],
  [0.28, 0.28],
  [0.76, 0.46],
  [0.50, 0.18],
  [0.25, 0.72],
  [0.63, 0.76],
  [0.14, 0.38],
  [0.82, 0.26],
  [0.83, 0.68],
]

export default function Universe({ onClose }) {
  const svgRef = useRef(null)
  const containerRef = useRef(null)
  const simRef = useRef(null)
  const [clusters, setClusters] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selected, setSelected] = useState(null)
  const [hovered, setHovered] = useState(null)
  const selectedRef = useRef(null)

  useEffect(() => { selectedRef.current = selected }, [selected])

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API}/clusters`)
      const raw = await res.json()
      setClusters(raw.map((c, i) => ({
        ...c,
        palette: PALETTE[i % PALETTE.length],
        layoutPos: CLUSTER_LAYOUT[i % CLUSTER_LAYOUT.length],
      })))
    } catch {}
    finally { setLoading(false) }
  }, [])

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    try {
      await fetch(`${API}/clusters/generate`, { method: 'POST' })
      const poll = setInterval(async () => {
        const res = await fetch(`${API}/clusters`)
        const raw = await res.json()
        if (raw.length) {
          clearInterval(poll)
          setClusters(raw.map((c, i) => ({
            ...c,
            palette: PALETTE[i % PALETTE.length],
            layoutPos: CLUSTER_LAYOUT[i % CLUSTER_LAYOUT.length],
          })))
          setGenerating(false)
        }
      }, 3000)
    } catch { setGenerating(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (loading || !clusters.length || !svgRef.current || !containerRef.current) return
    const frame = requestAnimationFrame(() => {
      const el = containerRef.current
      if (!el) return
      const W = el.offsetWidth
      const H = el.offsetHeight
      if (!W || !H) return
      renderGraph(W, H)
    })
    return () => {
      cancelAnimationFrame(frame)
      simRef.current?.stop()
    }
  }, [loading, clusters])

  function renderGraph(W, H) {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', W).attr('height', H)

    const defs = svg.append('defs')
    clusters.forEach((_, i) => {
      const f = defs.append('filter')
        .attr('id', `glow-${i}`)
        .attr('x', '-60%').attr('y', '-60%')
        .attr('width', '220%').attr('height', '220%')
      f.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', 22).attr('result', 'blur')
      const merge = f.append('feMerge')
      merge.append('feMergeNode').attr('in', 'blur')
      merge.append('feMergeNode').attr('in', 'blur')
    })

    const bg = defs.append('radialGradient').attr('id', 'bg-g').attr('cx', '50%').attr('cy', '48%').attr('r', '65%')
    bg.append('stop').attr('offset', '0%').attr('stop-color', '#fefcfa')
    bg.append('stop').attr('offset', '100%').attr('stop-color', '#ede9e3')

    svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#bg-g)')

    const root = svg.append('g')
    svg.call(d3.zoom().scaleExtent([0.15, 6]).on('zoom', e => root.attr('transform', e.transform)))

    // Circle size scales with number of saves — small clusters stay small
    const unitR = Math.max(H * 0.08, 55)
    const clusterData = clusters.map(c => ({
      ...c,
      cx: c.layoutPos[0] * W,
      cy: c.layoutPos[1] * H,
      r: unitR * Math.sqrt(c.saves.length),
    }))

    const glowLayer    = root.append('g')
    const blobLayer    = root.append('g')
    const ambientLayer = root.append('g')
    const linkLayer    = root.append('g').attr('opacity', 0)
    const nodeLayer    = root.append('g')
    const labelLayer   = root.append('g').attr('pointer-events', 'none')

    clusterData.forEach((c, i) => {
      glowLayer.append('circle')
        .attr('cx', c.cx).attr('cy', c.cy).attr('r', c.r * 1.2)
        .attr('fill', c.palette.bg)
        .attr('filter', `url(#glow-${i})`)
        .attr('opacity', 0.9)
    })

    // Mutable focus state
    let focusedCluster = null
    let sourceNode = null
    let intraPairs = []
    let labelEls = []   // filled below, referenced in focus fns via closure

    function resetFocus() {
      focusedCluster = null
      sourceNode = null
      intraPairs = []
      nodeEls
        .attr('r', d => d.r)
        .attr('opacity', 0.82)
        .attr('stroke', 'rgba(255,255,255,0.4)')
        .attr('stroke-width', 1)
      linkLayer.selectAll('line').remove()
      linkLayer.attr('opacity', 0)
      ambientLayer.attr('opacity', 1)
      labelEls.forEach(el => el.attr('opacity', 0))
      setSelected(null)
      setHovered(null)
    }

    function focusCluster(c, idx) {
      if (focusedCluster === c) { resetFocus(); return }
      focusedCluster = c
      sourceNode = null
      intraPairs = []
      setSelected(null)

      nodeEls
        .attr('r', d => d.cluster === c ? d.r + 2 : d.r)
        .attr('opacity', d => d.cluster === c ? 0.92 : 0.1)
        .attr('stroke', d => d.cluster === c ? '#fff' : 'rgba(255,255,255,0.2)')
        .attr('stroke-width', d => d.cluster === c ? 1.5 : 1)

      ambientLayer.attr('opacity', 0)

      const clusterNodes = nodes.filter(n => n.cluster === c)
      for (let i = 0; i < clusterNodes.length; i++) {
        for (let j = i + 1; j < clusterNodes.length; j++) {
          intraPairs.push([clusterNodes[i], clusterNodes[j]])
        }
      }
      linkLayer.selectAll('line').remove()
      linkLayer.attr('opacity', 1)
      linkLayer.selectAll('line').data(intraPairs).enter().append('line')
        .attr('stroke', c.palette.dot)
        .attr('stroke-width', 1.2)
        .attr('opacity', 0.38)

      // Show only this cluster's label
      labelEls.forEach((el, i) => el.attr('opacity', i === idx ? 1 : 0))
    }

    // Blob circles — size proportional to save count, click to focus
    clusterData.forEach((c, i) => {
      blobLayer.append('circle')
        .attr('cx', c.cx).attr('cy', c.cy).attr('r', c.r)
        .attr('fill', c.palette.bg)
        .attr('stroke', c.palette.border)
        .attr('stroke-width', 1.2)
        .attr('cursor', 'pointer')
        .on('mouseenter', () => { if (focusedCluster !== c) labelEls[i]?.attr('opacity', 1) })
        .on('mouseleave', () => { if (focusedCluster !== c) labelEls[i]?.attr('opacity', 0) })
        .on('click', e => { e.stopPropagation(); focusCluster(c, i) })
    })

    const nodes = clusterData.flatMap(c =>
      c.saves.map(save => ({
        save,
        cluster: c,
        r: 5 + Math.min(3.5, ((save.tags || []).length - 1) * 0.6),
        x: c.cx + (Math.random() - 0.5) * c.r * 0.75,
        y: c.cy + (Math.random() - 0.5) * c.r * 0.75,
      }))
    )

    const crossPairs = []
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[i].cluster !== nodes[j].cluster) crossPairs.push([i, j])
      }
    }
    crossPairs.sort(() => Math.random() - 0.5)
    const ambient = crossPairs.slice(0, 60).map(([i, j]) => ({ a: nodes[i], b: nodes[j] }))

    const ambientLines = ambientLayer.selectAll('line')
      .data(ambient).enter().append('line')
      .attr('stroke', '#c4b5d0')
      .attr('stroke-width', 0.7)
      .attr('opacity', 0.18)

    const nodeEls = nodeLayer.selectAll('circle')
      .data(nodes).enter().append('circle')
      .attr('r', d => d.r)
      .attr('fill', d => d.cluster.palette.dot)
      .attr('opacity', 0.82)
      .attr('stroke', 'rgba(255,255,255,0.4)')
      .attr('stroke-width', 1)
      .attr('cursor', 'pointer')
      .on('mouseenter', function (e, d) {
        if (selectedRef.current?.id !== d.save.id) {
          d3.select(this).attr('r', d.r + 3.5).attr('opacity', 1).attr('stroke', '#fff').attr('stroke-width', 1.5)
        }
        setHovered(d.save)
      })
      .on('mouseleave', function (e, d) {
        if (selectedRef.current?.id !== d.save.id) {
          const inFocus = focusedCluster && d.cluster === focusedCluster
          const dimmed  = focusedCluster && d.cluster !== focusedCluster
          d3.select(this)
            .attr('r', inFocus ? d.r + 2 : d.r)
            .attr('opacity', dimmed ? 0.1 : 0.82)
            .attr('stroke', inFocus ? '#fff' : 'rgba(255,255,255,0.4)')
            .attr('stroke-width', inFocus ? 1.5 : 1)
        }
        setHovered(null)
      })
      .on('click', async function (e, d) {
        e.stopPropagation()

        if (focusedCluster === d.cluster) {
          setSelected(prev => prev?.id === d.save.id ? null : d.save)
          return
        }

        setSelected(prev => prev?.id === d.save.id ? null : d.save)
        focusedCluster = null
        intraPairs = []
        sourceNode = d

        nodeEls.attr('r', n => n.r).attr('opacity', 0.82).attr('stroke', 'rgba(255,255,255,0.4)').attr('stroke-width', 1)
        d3.select(this).attr('r', d.r + 4.5).attr('opacity', 1).attr('stroke', '#fff').attr('stroke-width', 2.5)
        linkLayer.selectAll('line').remove()
        linkLayer.attr('opacity', 0)
        ambientLayer.attr('opacity', 1)
        labelEls.forEach(el => el.attr('opacity', 0))

        try {
          const res = await fetch(`${API}/saves/${d.save.id}/similar?limit=10`)
          if (!res.ok) return
          const similar = await res.json()
          const similarIds = new Set(similar.map(s => s.id))
          const connected = nodes.filter(n => similarIds.has(n.save.id))
          if (!connected.length) return

          linkLayer.attr('opacity', 1)
          linkLayer.selectAll('line').data(connected).enter().append('line')
            .attr('stroke', d.cluster.palette.dot)
            .attr('stroke-width', 1.2)
            .attr('opacity', 0.55)

          nodeEls.filter(n => similarIds.has(n.save.id))
            .attr('r', n => n.r + 2).attr('opacity', 0.95)
        } catch {}
      })

    svg.on('click', resetFocus)

    // Labels — hidden by default, shown on hover or cluster focus
    clusterData.forEach((c, i) => {
      const labelY = c.cy - c.r * 0.65
      const g = labelLayer.append('g').attr('opacity', 0)

      g.append('text')
        .attr('x', c.cx).attr('y', labelY)
        .attr('text-anchor', 'middle')
        .attr('font-size', 13).attr('font-weight', 600)
        .attr('font-family', 'system-ui,-apple-system,sans-serif')
        .attr('fill', c.palette.text)
        .text(c.name)

      g.append('text')
        .attr('x', c.cx).attr('y', labelY + 15)
        .attr('text-anchor', 'middle')
        .attr('font-size', 10.5).attr('opacity', 0.6)
        .attr('font-family', 'system-ui,-apple-system,sans-serif')
        .attr('fill', c.palette.text)
        .text(`${c.saves.length} items`)

      labelEls.push(g)
    })

    const sim = d3.forceSimulation(nodes)
      .force('x', d3.forceX(d => d.cluster.cx).strength(0.22))
      .force('y', d3.forceY(d => d.cluster.cy).strength(0.22))
      .force('charge', d3.forceManyBody().strength(-28))
      .force('collide', d3.forceCollide(d => d.r + 4))
      .alphaDecay(0.012)
      .on('tick', () => {
        nodeEls.attr('cx', d => d.x).attr('cy', d => d.y)
        ambientLines
          .attr('x1', d => d.a.x).attr('y1', d => d.a.y)
          .attr('x2', d => d.b.x).attr('y2', d => d.b.y)

        if (intraPairs.length) {
          linkLayer.selectAll('line')
            .attr('x1', d => d[0].x).attr('y1', d => d[0].y)
            .attr('x2', d => d[1].x).attr('y2', d => d[1].y)
        } else if (sourceNode) {
          linkLayer.selectAll('line')
            .attr('x1', sourceNode.x).attr('y1', sourceNode.y)
            .attr('x2', d => d.x).attr('y2', d => d.y)
        }
      })

    simRef.current = sim
  }

  const panel = selected || hovered

  return (
    <div
      className="fixed inset-0 flex"
      style={{ background: '#ede9e3', zIndex: 40, fontFamily: 'system-ui,-apple-system,sans-serif' }}
    >
      <div ref={containerRef} className="flex-1 relative overflow-hidden" style={{ minWidth: 0 }}>
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-6 h-6 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
            <p className="text-sm text-neutral-400">Building your universe…</p>
          </div>
        ) : !clusters.length ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-neutral-400">
            <p className="text-4xl">✦</p>
            <p className="text-sm">Your universe hasn't been mapped yet.</p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-5 py-2.5 rounded-full text-sm font-medium text-white transition disabled:opacity-50"
              style={{ background: '#7c3aed' }}
            >
              {generating ? 'Mapping universe…' : 'Map Universe'}
            </button>
          </div>
        ) : (
          <svg ref={svgRef} className="w-full h-full block" />
        )}

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 p-4 flex items-start justify-between pointer-events-none">
          <div className="flex items-center gap-3 pointer-events-auto">
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-neutral-600 hover:text-neutral-900 transition-all"
              style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(10px)', boxShadow: '0 1px 6px rgba(0,0,0,0.09)' }}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5">
                <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Library
            </button>
            <div>
              <h1 className="text-sm font-semibold text-neutral-700">Universe</h1>
              <p className="text-[11px] text-neutral-400 mt-0.5">Everything is connected</p>
            </div>
            {clusters.length > 0 && (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-3 py-1.5 rounded-full text-[11px] font-medium text-neutral-600 hover:text-violet-700 transition disabled:opacity-40"
                style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(10px)', boxShadow: '0 1px 6px rgba(0,0,0,0.09)' }}
              >
                {generating ? 'Remapping…' : 'Remap'}
              </button>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-1.5 justify-end max-w-xs pointer-events-auto">
            {clusters.map(c => (
              <div
                key={c.id}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium"
                style={{
                  background: 'rgba(255,255,255,0.8)',
                  backdropFilter: 'blur(10px)',
                  boxShadow: '0 1px 5px rgba(0,0,0,0.07)',
                  color: c.palette.text,
                }}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.palette.dot }} />
                {c.name}
              </div>
            ))}
          </div>
        </div>

        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] text-neutral-400 pointer-events-none select-none whitespace-nowrap">
          scroll to zoom · drag to pan · hover a cluster to name it · click to focus
        </p>
      </div>

      {/* Detail panel */}
      <div
        className="flex-shrink-0 overflow-y-auto"
        style={{
          width: panel ? 300 : 0,
          opacity: panel ? 1 : 0,
          transition: 'width 0.25s ease, opacity 0.2s ease',
          background: '#fff',
          borderLeft: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        {panel && <DetailPanel save={panel} />}
      </div>
    </div>
  )
}

function DetailPanel({ save }) {
  let hostname = ''
  try { hostname = new URL(save.url).hostname.replace('www.', '') } catch {}
  const topics = Array.isArray(save.topics) ? save.topics : []

  return (
    <div className="p-5 flex flex-col gap-4" style={{ minHeight: '100%' }}>
      {save.image && (
        <img
          src={save.image}
          alt=""
          className="w-full rounded-2xl object-cover"
          style={{ maxHeight: 190 }}
          onError={e => { e.currentTarget.style.display = 'none' }}
        />
      )}

      <div>
        <h2 className="font-semibold text-neutral-800 leading-snug" style={{ fontSize: 14 }}>
          {save.title || 'Untitled'}
        </h2>
        {hostname && <p className="text-[11px] text-neutral-400 mt-0.5">{hostname}</p>}
      </div>

      {topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {topics.map(topic => (
            <span
              key={topic}
              className="px-2 py-0.5 rounded-full text-[11px] font-medium"
              style={{ background: '#f0f0f5', color: '#6b6b80' }}
            >
              {topic}
            </span>
          ))}
        </div>
      )}

      {save.summary && (
        <p className="text-neutral-400 leading-relaxed italic" style={{ fontSize: 11 }}>
          {save.summary}
        </p>
      )}

      {save.description && (
        <p
          className="text-neutral-500 leading-relaxed"
          style={{ fontSize: 12, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {save.description}
        </p>
      )}

      {save.notes && (
        <p
          className="text-[12px] text-neutral-500 rounded-xl px-3 py-2.5 leading-relaxed italic"
          style={{ background: '#faf8f5', border: '1px solid rgba(0,0,0,0.06)' }}
        >
          {save.notes}
        </p>
      )}

      <div className="flex flex-col gap-2 pt-1 mt-auto">
        <a
          href={save.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center py-2.5 rounded-xl text-white text-xs font-semibold hover:opacity-85 transition"
          style={{ background: '#18181b' }}
        >
          Open →
        </a>
        {save.created_at && (
          <p className="text-center text-[11px] text-neutral-300">
            {new Date(save.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        )}
      </div>
    </div>
  )
}
