chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'GET_META') return

  const meta = (prop) => {
    const tag = document.querySelector(`meta[property="${prop}"]`)
             || document.querySelector(`meta[name="${prop}"]`)
    return tag?.content?.trim() || ''
  }

  let title       = meta('og:title') || document.title || ''
  let description = meta('og:description') || meta('description') || ''
  let image       = ''

  if (window.location.hostname.includes('tiktok.com')) {
    // TikTok: page meta reflects the profile/collection page when browsing saved videos.
    // Read from the actively-playing video's DOM instead.

    // Poster frame thumbnail from the playing video element
    const vid = document.querySelector('video')
    if (vid?.poster) image = vid.poster
    if (!image) image = meta('og:image')

    // data-e2e attributes are TikTok's stable hooks across obfuscated class names
    const descEl =
      document.querySelector('[data-e2e="video-desc"]') ||
      document.querySelector('[data-e2e="browse-video-desc"]') ||
      document.querySelector('[data-e2e="video-detail-desc"]') ||
      document.querySelector('[data-e2e="search-video-desc"]')

    if (descEl) {
      const raw = descEl.innerText?.trim()
      if (raw && raw.length > 2) {
        title = raw.split('\n')[0].slice(0, 120)
        description = raw
      }
    }

    // If the current URL is a profile/collection page (no /video/ segment),
    // try to find the actual video URL from a canonical link or the playing video's link.
    if (!window.location.pathname.includes('/video/')) {
      const canonicalLink = document.querySelector('link[rel="canonical"]')
      if (canonicalLink?.href?.includes('/video/')) {
        // canonical points to the video — override the URL we'll report
        // (popup.js uses tab.url; we surface it via description so the user knows)
      }
      // Surface the video author + ID if we can find it in the DOM
      const videoLink = document.querySelector('a[href*="/video/"]')
      if (videoLink?.href) {
        if (!title || title === document.title) {
          // No caption found — at least note which video this is
          description = description || videoLink.href
        }
      }
    }

  } else if (window.location.hostname.includes('instagram.com')) {
    // Instagram opens posts as a modal on top of the feed.
    // We must look inside the dialog/modal, NOT the feed articles behind it.
    const container =
      document.querySelector('div[role="dialog"]') ||
      document.querySelector('section[role="dialog"]') ||
      // direct post page (no modal)
      document.querySelector('main article') ||
      document.querySelector('article')

    if (container) {
      // video post → grab poster frame
      const vid = container.querySelector('video[poster]')
      if (vid?.poster) image = vid.poster

      // photo post → first CDN image that isn't a tiny avatar
      if (!image) {
        const imgs = Array.from(container.querySelectorAll('img'))
        .filter(i => i.src?.startsWith('http') && i.getBoundingClientRect().width > 100)
        if (imgs.length) image = imgs[0].src
      }

      // grab caption text for a real title
      const captionEl =
        container.querySelector('h1') ||
        container.querySelector('span[dir="auto"]')
      if (captionEl) {
        const raw = captionEl.innerText?.trim()
        if (raw && raw.length > 5) {
          title = raw.split('\n')[0].slice(0, 120)
          description = raw
        }
      }
    }

    // final fallback for image
    if (!image) image = meta('og:image')

  } else {
    image = meta('og:image')

    // JSON-LD structured data (Product, Article schema)
    if (!image || !title || !description) {
      for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const items = [].concat(JSON.parse(script.textContent || '{}'))
          for (const item of items) {
            if (!title && item.name)        title       = String(item.name).slice(0, 200)
            if (!description && item.description) description = String(item.description).slice(0, 500)
            if (!image) {
              const img = item.image
              if (typeof img === 'string')            image = img
              else if (Array.isArray(img) && img[0])  image = typeof img[0] === 'string' ? img[0] : img[0].url || ''
              else if (img?.url)                       image = img.url
            }
          }
        } catch {}
        if (image && title) break
      }
    }

    if (!image) {
      const imgs = Array.from(document.querySelectorAll('img'))
        .filter(i => i.naturalWidth > 200 && i.naturalHeight > 200 && i.src.startsWith('http'))
        .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight)
      image = imgs[0]?.src || ''
    }

    if (!image) image = document.querySelector('video[poster]')?.poster || ''
  }

  sendResponse({ title, description, image })
})
