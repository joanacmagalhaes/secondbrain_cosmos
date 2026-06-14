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
    var _validUrl = function(u) { return u && u !== 'undefined' && u !== 'null' && (u.indexOf('http') === 0 || u.indexOf('data:') === 0) }
    var ogTitle = (document.querySelector('meta[property="og:title"]') || {}).content || document.title || ''
    var ogDesc  = (document.querySelector('meta[property="og:description"]') || {}).content || ''
    var _rawOgImage = (document.querySelector('meta[property="og:image"]') || {}).content || ''
    var ogImage = _validUrl(_rawOgImage) ? _rawOgImage : ''

    const allImgs = Array.from(document.querySelectorAll('img'))
    var _debug  = 'host:' + host + ' imgs:' + allImgs.length + ' ogimg:' + (ogImage ? 'yes' : 'no')

    if (host.includes('tiktok.com')) {
      // TikTok is a SPA — og:title stays stale (shows collection/feed name).
      // og:description is usually the actual video caption. Try DOM first, then fall back.
      var ttDescEl =
        document.querySelector('[data-e2e="video-desc"]') ||
        document.querySelector('[data-e2e="browse-video-desc"]') ||
        document.querySelector('[data-e2e="video-detail-desc"]') ||
        document.querySelector('[data-e2e="search-video-desc"]')

      if (ttDescEl && ttDescEl.innerText && ttDescEl.innerText.trim().length > 2) {
        var ttRaw = ttDescEl.innerText.trim()
        ogTitle = ttRaw.split('\n')[0].slice(0, 120)
        ogDesc  = ttRaw
      } else if (ogDesc && ogDesc.length > 5) {
        ogTitle = ogDesc.split('\n')[0].slice(0, 120) || ogTitle
      }

      // Thumbnail: TikTok videos have no poster attribute and og:image is stale (profile pic).
      // 1. Canvas capture of the current video frame (works because src is a same-origin blob URL)
      // 2. If canvas throws (tainted), fall back to screenshot crop via _videoBounds
      var ttVid = document.querySelector('[data-e2e="browse-video"] video') ||
                  document.querySelector('video')
      var ttVideoBounds = null

      // /photo/ URLs are slideshows even though TikTok auto-plays them with a video-like player
      var ttIsSlideshow = window.location.pathname.includes('/photo/')

      if (ttVid && ttVid.videoWidth > 0 && !ttIsSlideshow) {
        // ── VIDEO PATH ──
        try {
          var ttOrigTime = ttVid.currentTime
          ttVid.currentTime = 0
          await new Promise(function(resolve) { ttVid.onseeked = resolve; setTimeout(resolve, 600) })
          var ttCanvas = document.createElement('canvas')
          ttCanvas.width  = ttVid.videoWidth
          ttCanvas.height = ttVid.videoHeight
          ttCanvas.getContext('2d').drawImage(ttVid, 0, 0)
          var ttDataUrl = ttCanvas.toDataURL('image/jpeg', 0.85)
          if (ttDataUrl && ttDataUrl.length > 5000) ogImage = ttDataUrl
          ttVid.currentTime = ttOrigTime
        } catch (ttCe) {}

        if (!ogImage) {
          var ttVr = ttVid.getBoundingClientRect()
          if (ttVr.width > 0 && ttVr.height > 0)
            ttVideoBounds = { left: ttVr.left, top: ttVr.top, width: ttVr.width, height: ttVr.height }
        }

        if (!ogImage && !ttVideoBounds && _validUrl(_rawOgImage)) ogImage = _rawOgImage
        return { title: ogTitle, description: ogDesc, image: ogImage, _debug: _debug,
                 _isVideo: true, _videoBounds: ttVideoBounds, _dpr: window.devicePixelRatio || 1 }

      } else {
        // ── SLIDESHOW / PHOTO PATH ──
        // TikTok photo posts use /photo/ URLs. The player has two separate navigation layers:
        //   • Slideshow arrows: div[class*="DivRightArrow"] — advances within the post
        //   • Post navigation:  button[data-e2e="arrow-right"] — moves to the next post
        // We must click only the DivRightArrow div, never the button.
        var ttPhotoRoot = document.querySelector('[class*="DivPhotoVideoContainer"]') ||
                          document.querySelector('[class*="DivPhotoWrapper"]') ||
                          document.querySelector('[data-e2e="browse-video"]') ||
                          document.body

        var ttSeen = new Set()
        var ttSlides = []

        var ttCollectImgs = function() {
          Array.from(ttPhotoRoot.querySelectorAll('img')).forEach(function(img) {
            var src = img.src || ''
            if (!src.startsWith('http') || ttSeen.has(src)) return
            var isCDN = src.includes('tiktokcdn') || src.includes('tiktok.com/obj')
            if (!isCDN) return
            if (src.includes('user-avatar') || src.includes('/user/')) return
            var w = img.naturalWidth || img.width || 0
            if (w > 0 && w < 150) return
            ttSeen.add(src)
            ttSlides.push(src)
          })
        }

        ttCollectImgs()

        // Advance through slides using the slideshow-internal arrow (a div, not the post-nav button)
        var ttSlideNext = ttPhotoRoot.querySelector('[class*="DivRightArrow"]') ||
                          document.querySelector('[class*="DivRightArrow"]')
        if (ttSlideNext) {
          for (var ttSi = 0; ttSi < 25; ttSi++) {
            var ttPrevLen = ttSlides.length
            ttSlideNext.click()
            for (var ttPi = 0; ttPi < 8; ttPi++) {
              await new Promise(function(r) { setTimeout(r, 150) })
              ttCollectImgs()
              if (ttSlides.length > ttPrevLen) break
            }
            if (ttSlides.length === ttPrevLen) break  // no new image loaded — end of slideshow
          }
        }

        if (ttSlides.length > 0) ogImage = ttSlides[0]
        if (!ogImage && _validUrl(_rawOgImage)) ogImage = _rawOgImage

        return { title: ogTitle, description: ogDesc, image: ogImage, _debug: _debug,
                 _allImages: ttSlides, _isVideo: false, _type: 'TikTokSlideshow' }
      }

    } else if (host.includes('instagram.com')) {
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

      // Both scoped to root — document.querySelector causes false positives when background
      // feed videos/Reels are in the DOM behind the photo carousel modal
      var videoPlayer = root.querySelector('[aria-label="Video player"]') ||
                        root.querySelector('[aria-label="Video"]')
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

    // JSON-LD structured data — product/article pages embed rich metadata here
    // (Zara Home, IKEA, most e-commerce sites use Product schema)
    var ldScripts = document.querySelectorAll('script[type="application/ld+json"]')
    for (var _li = 0; _li < ldScripts.length; _li++) {
      try {
        var _ld = JSON.parse(ldScripts[_li].textContent || '{}')
        var _ldItems = Array.isArray(_ld) ? _ld : [_ld]
        for (var _lj = 0; _lj < _ldItems.length; _lj++) {
          var _item = _ldItems[_lj]
          var _isProduct = (_item['@type'] || '').indexOf('Product') > -1
          // On SPAs, og:title often shows navigation/category text instead of the product name.
          // JSON-LD Product.name is always the real product title — prefer it unconditionally.
          if (_isProduct && _item.name) ogTitle = String(_item.name).slice(0, 200)
          else if (!ogTitle && _item.name) ogTitle = String(_item.name).slice(0, 200)
          // Products: prefer JSON-LD description (product-specific) over og:description (often a generic site tagline)
          if ((_isProduct || !ogDesc) && _item.description) ogDesc = String(_item.description).slice(0, 500)
          // Products: JSON-LD image is the actual product photo; og:image on SPAs/e-commerce is often a brand logo.
          // Prefer it unconditionally, same as we do for title.
          if (_isProduct || !ogImage) {
            var _img = _item.image
            var _imgUrl = ''
            if (typeof _img === 'string')                _imgUrl = _img
            else if (Array.isArray(_img) && _img.length) _imgUrl = typeof _img[0] === 'string' ? _img[0] : (_img[0].url || '')
            else if (_img && _img.url)                   _imgUrl = _img.url
            if (_validUrl(_imgUrl)) ogImage = _imgUrl
          }
        }
      } catch(_le) {}
      if (ogImage && ogTitle) break
    }

    // DOM image fallback — largest visible rendered image on the page
    if (!ogImage) {
      var _candidates = Array.from(document.querySelectorAll('img'))
        .filter(function(i) {
          return i.naturalWidth > 200 && i.naturalHeight > 200 && i.src && i.src.indexOf('http') === 0
        })
        .sort(function(a, b) { return (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight) })
      if (_candidates.length) ogImage = _candidates[0].src
    }

    // Extract price from Open Graph product namespace or JSON-LD offers
    var detectedPrice = ''
    var priceAmountMeta = document.querySelector('meta[property="product:price:amount"]') ||
                          document.querySelector('meta[property="og:price:amount"]')
    if (priceAmountMeta) {
      var priceVal = priceAmountMeta.content || ''
      var currencyMeta = document.querySelector('meta[property="product:price:currency"]') ||
                         document.querySelector('meta[property="og:price:currency"]')
      var currency = currencyMeta ? (currencyMeta.content || '') : ''
      if (priceVal) detectedPrice = currency ? currency + priceVal : priceVal
    }
    if (!detectedPrice) {
      var ldScriptsPrice = document.querySelectorAll('script[type="application/ld+json"]')
      for (var _pi = 0; _pi < ldScriptsPrice.length && !detectedPrice; _pi++) {
        try {
          var _pld = JSON.parse(ldScriptsPrice[_pi].textContent || '{}')
          var _pItems = Array.isArray(_pld) ? _pld : [_pld]
          for (var _pj = 0; _pj < _pItems.length; _pj++) {
            var _offers = _pItems[_pj].offers
            var _offer = Array.isArray(_offers) ? _offers[0] : _offers
            if (_offer && _offer.price) {
              var _cur = _offer.priceCurrency || ''
              detectedPrice = _cur ? _cur + _offer.price : String(_offer.price)
              break
            }
          }
        } catch(_pe) {}
      }
    }

    // Detect content type from the live DOM for JS-rendered sites
    var detectedType = ''
    var ogTypeMeta = (document.querySelector('meta[property="og:type"]') || {}).content || ''
    if (ogTypeMeta.toLowerCase().indexOf('product') > -1) {
      detectedType = 'Product'
    } else if (document.querySelector('meta[property^="product:price"]')) {
      detectedType = 'Product'
    } else {
      // JSON-LD @type
      var ldScriptsType = document.querySelectorAll('script[type="application/ld+json"]')
      for (var _ti = 0; _ti < ldScriptsType.length && !detectedType; _ti++) {
        try {
          var _tld = JSON.parse(ldScriptsType[_ti].textContent || '{}')
          var _tItems = Array.isArray(_tld) ? _tld : [_tld]
          for (var _tj = 0; _tj < _tItems.length; _tj++) {
            var _st = (_tItems[_tj]['@type'] || '')
            if (_st.indexOf('Product') > -1) { detectedType = 'Product'; break }
            if (_st.indexOf('Recipe')  > -1) { detectedType = 'Recipe';  break }
          }
        } catch(_te) {}
      }
    }
    // Schema.org microdata
    if (!detectedType && document.querySelector('[itemtype*="schema.org/Product"]')) detectedType = 'Product'

    // Product pages: the og:image is often a brand logo on JS-heavy SPAs. If we're on a product
    // page, scan the DOM for the largest visible image that doesn't look like a logo/banner.
    if (detectedType === 'Product') {
      var _ogIsLogo = !ogImage || /logo|banner|sprite|icon|placeholder/i.test(ogImage)
      var _pdImgs = Array.from(document.querySelectorAll('img'))
        .filter(function(i) {
          var src = i.src || ''
          return src.indexOf('http') === 0
            && !/logo|banner|sprite|icon|placeholder/i.test(src)
            && i.naturalWidth >= 300 && i.naturalHeight >= 300
        })
        .sort(function(a, b) { return (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight) })
      // Only override when ogImage is missing or looks like a logo — don't replace a good JSON-LD image
      if (_pdImgs.length > 0 && _ogIsLogo)
        ogImage = _pdImgs[0].src
    }

    return { title: ogTitle, description: ogDesc, image: ogImage, _debug: _debug, _type: detectedType, _price: detectedPrice }
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

  // Warn when saving a TikTok profile/collection page instead of a specific video
  if (currentUrl.includes('tiktok.com') && !currentUrl.includes('/video/')) {
    statusEl.textContent = 'Tip: open the video fullscreen first so the URL points to the specific video, then save.'
    statusEl.className   = 'status'
  }
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
        provided_type:        pageMetadata?._type       || '',
        provided_price:       pageMetadata?._price      || '',
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

