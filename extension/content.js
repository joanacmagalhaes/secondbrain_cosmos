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

  if (window.location.hostname.includes('instagram.com')) {
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
