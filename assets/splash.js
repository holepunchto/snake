import { SPLASH_RECTS, SPLASH_VIEWBOX } from './splash-rects.js'

const ACCENT = '#b0d944'
const BACKGROUND = '#001601'

const TITLE = 'PEAR SNAKE'
const DRAW_MS = 1250
const TYPE_START_MS = 900
const TYPE_CHAR_MS = 55
const TYPE_END_MS = TYPE_START_MS + TITLE.length * TYPE_CHAR_MS
const HOLD_MS = 550
const FADE_MS = 320

const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - (1 - t) * (1 - t) * 2)

const pct = (n) => (n / SPLASH_VIEWBOX) * 100 + '%'

export function runSplash(version) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.id = 'splash'
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 20;
      background: ${BACKGROUND};
      display: flex; align-items: center; justify-content: center;
      transition: opacity ${FADE_MS}ms ease;
    `

    const glyph = document.createElement('div')
    glyph.style.cssText = `
      position: relative;
      width: min(62vw, 300px); height: min(62vw, 300px);
    `

    const bars = []
    const tongues = []
    for (const r of SPLASH_RECTS) {
      const bar = document.createElement('div')
      bar.style.cssText = `
        position: absolute;
        left: ${pct(r.x)}; top: ${pct(r.y)};
        width: ${pct(r.w)}; height: ${pct(r.h)};
      `
      if (r.k === 'eye') {
        bar.style.background = BACKGROUND
        bar.style.zIndex = 1
      } else {
        bar.style.background = ACCENT
        bar.style.opacity = 0
        if (r.k === 'tongue') tongues.push(bar)
        else bars.push({ el: bar, o: r.o ?? 0 })
      }
      glyph.appendChild(bar)
    }

    const titleRow = document.createElement('div')
    titleRow.style.cssText = `
      position: absolute; left: 50%; transform: translateX(-50%);
      top: calc(100% + 26px);
      display: flex; white-space: pre;
      color: ${ACCENT}; font-family: monospace;
      font-size: 20px; letter-spacing: 3px;
    `
    const titleText = document.createElement('span')
    const cursor = document.createElement('span')
    cursor.textContent = '█'
    cursor.style.animation = 'splash-cursor 840ms linear infinite'
    titleRow.append(titleText, cursor)
    glyph.appendChild(titleRow)

    const stamp = document.createElement('div')
    stamp.style.cssText = `
      position: absolute; left: 50%; transform: translateX(-50%);
      top: calc(100% + 56px);
      color: ${ACCENT}; font-family: monospace;
      font-size: 11px; letter-spacing: 2px;
      opacity: 0; transition: opacity 260ms ease;
    `
    stamp.textContent = 'v' + version
    glyph.appendChild(stamp)

    const style = document.createElement('style')
    style.textContent = `
      @keyframes splash-cursor {
        0% { opacity: 1 } 42.86% { opacity: 1 } 50% { opacity: 0 }
        92.86% { opacity: 0 } 100% { opacity: 1 }
      }
    `

    overlay.appendChild(style)
    overlay.appendChild(glyph)
    document.body.appendChild(overlay)

    let alive = true
    const timers = []
    const later = (fn, ms) => timers.push(setTimeout(fn, ms))

    const finish = (delay) => {
      later(() => {
        overlay.style.opacity = 0
        later(() => {
          if (!alive) return
          alive = false
          timers.forEach(clearTimeout)
          overlay.remove()
          resolve()
        }, FADE_MS)
      }, delay)
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const { el } of bars) el.style.opacity = 1
      for (const t of tongues) t.style.opacity = 1
      titleText.textContent = TITLE
      cursor.style.animation = 'none'
      stamp.style.opacity = 0.6
      finish(700)
      return
    }

    // body bars draw in from tail to head, gated by eased progress
    const start = performance.now()
    const drawFrame = (now) => {
      if (!alive) return
      const p = easeInOutQuad(Math.min(1, (now - start) / DRAW_MS))
      for (const { el, o } of bars) {
        const from = Math.max(0, o * 0.88 - 0.07)
        const to = o * 0.88 + 0.001
        el.style.opacity = Math.min(1, Math.max(0, (p - from) / (to - from)))
      }
      if (p < 1) requestAnimationFrame(drawFrame)
    }
    requestAnimationFrame(drawFrame)

    // tongue flick, twice, once the head has landed
    const flick = (opacity, duration) => {
      for (const t of tongues) {
        t.style.transition = `opacity ${duration}ms ease`
        t.style.opacity = opacity
      }
    }
    later(() => flick(1, 90), DRAW_MS + 60)
    later(() => flick(0.2, 90), DRAW_MS + 150)
    later(() => flick(1, 110), DRAW_MS + 240)

    // typewriter
    for (let i = 1; i <= TITLE.length; i++) {
      later(
        () => {
          titleText.textContent = TITLE.slice(0, i)
        },
        TYPE_START_MS + i * TYPE_CHAR_MS
      )
    }

    // version fades in once the title has finished typing
    later(() => {
      stamp.style.opacity = 0.6
    }, TYPE_END_MS + 120)

    finish(Math.max(DRAW_MS + 420, TYPE_END_MS + 380) + HOLD_MS)
  })
}
