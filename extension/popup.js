const API = 'http://localhost:8000'

const titleEl   = document.getElementById('page-title')
const urlEl     = document.getElementById('page-url')
const notesEl   = document.getElementById('notes')
const saveBtn   = document.getElementById('save-btn')
const statusEl  = document.getElementById('status')

let currentUrl   = ''
let pageMetadata = {}

async function extractMeta() {
  try {
    var host    = window.location.hostname
    var ogTitle = (document.querySelector('meta[property="og:title"]') || {}).content || document.title || ''
    var ogDesc  = (document.querySelector('meta[property="og:description"]') || {}).content || ''
    var ogImage = (document.querySelector('meta[property="og:image"]') || {}).content || ''

    const allImgs = Array.from(document.querySelectorAll('img'))
    var _debug  = 'host:' + host + ' imgs:' + allImgs.length + ' ogimg:' + (ogImage ? 'yes' : 'no')

    if (host.includes('instagram.com')) {
      ogImage = ''

      var modal = document.querySelector('[role="dialog"]') ||
                  document.querySelector('[aria-modal="true"]')
      var root  = modal || document.querySelector('main') || document

      var isCarouselImg = function(img) {
        if (!img.src || img.src.indexOf('data:') === 0) return false
        var isCDN = img.src.indexOf('fbcdn') > -1 || img.src.indexOf('cdninstagram') > -1
        if (!isCDN) return false
        if (img.src.indexOf('t51.2885-19') > -1) return false // profile pictures
        if (img.src.indexOf('s32x32') > -1) return false
        if (img.naturalWidth > 0 && img.naturalWidth < 300) return false
        return true
      }
      var allModalImgs = Array.from(root.querySelectorAll('img')).filter(isCarouselImg)

      var videoPlayer = document.querySelector('[aria-label="Video player"]') ||
                        document.querySelector('[aria-label="Video"]')
      // Scope video detection to root only — document.querySelector('video') causes false
      // positives when background feed videos are in the DOM behind an image carousel
      var vid = root.querySelector('video')
      var isVideo = !!(vid || videoPlayer)
      var videoBounds = null

      if (isVideo) {
        // 1. Explicit poster attribute
        ogImage = (vid && vid.poster) || ''

        // 2. Canvas capture of frame 0 (Instagram's chosen thumbnail frame)
        //    Seeks to start, captures, then restores playback position
        if (!ogImage && vid && vid.videoWidth > 0) {
          try {
            var origTime   = vid.currentTime
            var origPaused = vid.paused
            vid.currentTime = 0
            await new Promise(function(resolve) {
              vid.onseeked = resolve
              setTimeout(resolve, 800)
            })
            var canvas = document.createElement('canvas')
            canvas.width  = vid.videoWidth
            canvas.height = vid.videoHeight
            var ctx2d = canvas.getContext('2d')
            ctx2d.drawImage(vid, 0, 0)
            var dataUrl = canvas.toDataURL('image/jpeg', 0.85)
            // restore playback
            if (!origPaused) vid.play()
            else vid.currentTime = origTime
            if (dataUrl && dataUrl.length > 5000) ogImage = dataUrl
          } catch(ce) { /* fall through to screenshot */ }
        }

        // 3. Screenshot fallback (only if canvas failed)
        if (!ogImage) {
          var target = videoPlayer || vid
          if (target) {
            var vr = target.getBoundingClientRect()
            if (vr.width > 0 && vr.height > 0) {
              videoBounds = { left: vr.left, top: vr.top, width: vr.width, height: vr.height }
            }
          }
        }
      } else {
        // Photo post â†’ first CDN image in DOM order
        if (allModalImgs.length > 0) ogImage = allModalImgs[0].src
      }

      // Caption/title from DOM (og:title and og:description are stale on SPA nav)
      var captionEl = root.querySelector('h1') ||
                      root.querySelector('span[dir="auto"]') ||
                      document.querySelector('h1')
      if (captionEl && captionEl.innerText && captionEl.innerText.trim().length > 5) {
        var raw = captionEl.innerText.trim()
        ogTitle = raw.split('\n')[0].slice(0, 120)
        ogDesc  = raw
      }

      var _debugModal = modal ? 'modal' : 'page'
      _debug += ' src:' + _debugModal + ' vid:' + (vid ? 'yes' : 'no') + ' imgs:' + allModalImgs.length

      // Collect initial images then advance carousel, polling every 100ms for each new slide
      var _seen = new Set()
      var _allImages = []
      var _addUrl = function(u) {
        if (!u) return
        if (u.indexOf('//') === 0) u = 'https:' + u  // handle protocol-relative URLs
        if (u.indexOf('http') !== 0) return
        if (u.indexOf('fbcdn') === -1 && u.indexOf('cdninstagram') === -1) return
        if (u.indexOf('t51.2885-19') > -1) return  // profile picture CDN path
        if (u.indexOf('t51.82787-19') > -1) return  // suggested-post/story thumbnail CDN path
        if (u.indexOf('s150x150') > -1 || u.indexOf('s320x320') > -1) return  // small thumbnails
        if (!_seen.has(u)) { _seen.add(u); _allImages.push(u) }
      }

      // Strategy 1: read from Instagram's in-memory data layer — no UI manipulation needed
      var _gotFromData = false
      try {
        if (window.__additionalDataLoaded) {
          for (var _dk in window.__additionalDataLoaded) {
            var _dm = window.__additionalDataLoaded[_dk]
            var _sc = _dm && _dm.graphql && _dm.graphql.shortcode_media
            if (_sc && _sc.edge_sidecar_to_children) {
              _sc.edge_sidecar_to_children.edges.forEach(function(e) {
                var rs = e.node.display_resources
                _addUrl(rs && rs.length ? rs[rs.length - 1].src : e.node.display_url)
              })
              if (_allImages.length > 0) { _gotFromData = true; break }
            }
          }
        }
      } catch(_de) {}

      // Strategy 2: scan img srcset for carousel slides.
      // Post/carousel images have srcset entries at 640w–1080w; profile pictures max out at ~320w.
      // Only take entries with width >= 480 to exclude profile pictures.
      if (!_gotFromData && !isVideo) {
        Array.from(root.querySelectorAll('img')).forEach(function(img) {
          var ss = img.getAttribute('srcset') || ''
          if (!ss) return
          var bestUrl = ''
          var bestW = 0
          ss.split(',').forEach(function(part) {
            var chunks = part.trim().split(/\s+/)
            var u = chunks[0]
            var w = parseInt(chunks[1] || '0', 10)
            if (w >= 480 && w > bestW) { bestW = w; bestUrl = u }
          })
          if (bestUrl) _addUrl(bestUrl)
        })
      }

      // Seed _allImages with directly loaded images only if completely empty (no srcsets found)
      if (_allImages.length === 0) {
        allModalImgs.forEach(function(img) { _addUrl(img.src) })
      }

      // Advance the carousel whenever a Next button exists — don't require multiple loaded images
      // since Instagram lazy-loads off-screen slides (only current slide has src set)
      if (!isVideo && !_gotFromData) {
        var _nxtLabels = ['next', 'avançar', 'próximo', 'seguinte', 'siguiente', 'suivant', 'weiter', 'avanti', 'forward']
        var _findNextBtn = function() {
          return Array.from(root.querySelectorAll('button')).find(function(b) {
            var lbl = (b.getAttribute('aria-label') || '').toLowerCase()
            return _nxtLabels.some(function(w) { return lbl.indexOf(w) > -1 })
          })
        }
        for (var _si = 0; _si < 15; _si++) {
          var _nxt = _findNextBtn()
          if (!_nxt) break
          _nxt.click()
          var _prevLen = _allImages.length
          for (var _p = 0; _p < 20; _p++) {
            await new Promise(function(r) { setTimeout(r, 100) })
            Array.from(root.querySelectorAll('img')).forEach(function(img) {
              var ss = img.getAttribute('srcset') || ''
              if (ss) {
                // Prefer srcset (best quality, avoids duplicates vs img.src which is a diff resolution)
                var bestUrl = '', bestW = 0
                ss.split(',').forEach(function(part) {
                  var chunks = part.trim().split(/\s+/)
                  var u = chunks[0], w = parseInt(chunks[1] || '0', 10)
                  if (w >= 480 && w > bestW) { bestW = w; bestUrl = u }
                })
                if (bestUrl) _addUrl(bestUrl)
              } else if (img.src && img.src.indexOf('data:') !== 0) {
                // No srcset — fall back to img.src (lazy-loaded slide just appearing)
                _addUrl(img.src)
              }
            })
            if (_allImages.length > _prevLen) break
          }
          if (_allImages.length === _prevLen) break
        }
      }
      console.log('[secondmind] isVideo:', isVideo, '| root:', root.tagName || 'document', '| allModalImgs:', allModalImgs.length, '| _allImages:', _allImages.length, _allImages)
      return { title: ogTitle, description: ogDesc, image: ogImage, _debug: _debug,
               _isVideo: isVideo || false, _videoBounds: videoBounds, _dpr: window.devicePixelRatio || 1,
               _allImages: _allImages }
    }

    return { title: ogTitle, description: ogDesc, image: ogImage, _debug: _debug }
  } catch(e) {
    return { title: '', description: '', image: '', _debug: 'ERR:' + String(e.message).slice(0, 60) }
  }
}

async function captureVideoFrame(tabId, bounds, dpr) {
  const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 85 })
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(bounds.width)
      canvas.height = Math.round(bounds.height)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(
        img,
        Math.round(bounds.left * dpr), Math.round(bounds.top * dpr),
        Math.round(bounds.width * dpr), Math.round(bounds.height * dpr),
        0, 0, canvas.width, canvas.height
      )
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

// On popup open: just grab the tab URL and title — no heavy extraction yet
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  currentUrl          = tab.url || ''
  urlEl.textContent   = currentUrl
  titleEl.textContent = tab.title || currentUrl
})

saveBtn.addEventListener('click', async () => {
  if (!currentUrl) return
  saveBtn.disabled     = true
  saveBtn.textContent  = 'Saving...'
  statusEl.className   = 'status'
  statusEl.textContent = 'Scanning page…'

  try {
    // Run extraction at click time so we always have the latest DOM state
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractMeta,
        world: 'MAIN',
      })
      const value = result?.result ?? result?.value
      if (value) {
        pageMetadata = value
        if (!pageMetadata.image && value._isVideo && value._videoBounds) {
          try {
            pageMetadata.image = await captureVideoFrame(tab.id, value._videoBounds, value._dpr || 1)
          } catch (ce) { /* screenshot failed */ }
        }
      }
    } catch (e) {
      try {
        pageMetadata = await chrome.tabs.sendMessage(tab.id, { type: 'GET_META' })
      } catch {
        pageMetadata = { title: tab.title || '', description: '', image: '' }
      }
    }

    statusEl.textContent = 'Saving…'

    const res = await fetch(`${API}/saves`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url:                  currentUrl,
        notes:                notesEl.value.trim(),
        provided_title:       pageMetadata?.title       || '',
        provided_description: pageMetadata?.description || '',
        provided_image:       pageMetadata?.image       || '',
        provided_images:      pageMetadata?._allImages  || [],
        is_video:             pageMetadata?._isVideo    || false,
      }),
    })

    if (res.status === 409) {
      statusEl.textContent = 'Already saved!'
      statusEl.className   = 'status error'
      saveBtn.disabled     = false
      saveBtn.textContent  = 'Save'
    } else if (!res.ok) {
      statusEl.textContent = 'Something went wrong.'
      statusEl.className   = 'status error'
      saveBtn.disabled     = false
      saveBtn.textContent  = 'Save'
    } else {
      statusEl.textContent = 'Saved to your mind'
      statusEl.className   = 'status success'
      saveBtn.textContent  = 'Saved!'
      setTimeout(() => window.close(), 1500)
    }
  } catch {
    statusEl.textContent = 'Backend not running.'
    statusEl.className   = 'status error'
    saveBtn.disabled     = false
    saveBtn.textContent  = 'Save'
  }
})

