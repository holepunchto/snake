import { runSplash } from '../assets/splash.js'

const bridge = window.bridge
const decoder = new TextDecoder('utf-8')
const encoder = new TextEncoder()

runSplash(bridge.pkg().version)

const pearImage = new Image()
pearImage.src = '../assets/pear.png'

const WORKER = '/workers/main.js'

function sendToWorker(msg) {
  bridge.writeWorkerIPC(WORKER, encoder.encode(JSON.stringify(msg)))
}

bridge.startWorker(WORKER)

let shouldReload = false

function showUpdating() {
  const banner = document.querySelector('#update-banner')
  banner.textContent = 'Updating...'
  banner.classList.remove('hidden')
}

function showUpdateReady() {
  const banner = document.querySelector('#update-banner')
  banner.textContent = 'Update ready!'
  banner.classList.remove('hidden')
  const btn = document.createElement('button')
  btn.id = 'update-btn'
  btn.textContent = 'Apply update'
  btn.onclick = () => {
    btn.disabled = true
    btn.textContent = 'Applying...'
    shouldReload = true
    sendToWorker({ type: 'applyUpdate' })
  }
  banner.appendChild(btn)
}

function showUpdateFailed(error) {
  const banner = document.querySelector('#update-banner')
  banner.textContent = error || 'Update failed'
  banner.classList.remove('hidden')
}

bridge.onWorkerIPC(WORKER, (data) => {
  let msg = null
  try {
    msg = JSON.parse(decoder.decode(data))
  } catch {
    return
  }
  const game = document.querySelector('pear-snake')

  if (msg.type === 'updating') {
    showUpdating()
  } else if (msg.type === 'updated') {
    showUpdateReady()
  } else if (msg.type === 'updateApplied') {
    if (shouldReload) {
      bridge.appAfterUpdate().catch((err) => showUpdateFailed(err.message))
    } else {
      document.querySelector('#update-banner').classList.add('hidden')
    }
  } else if (msg.type === 'updateFailed') {
    showUpdateFailed(msg.error)
  } else if (msg.type === 'ready') {
    const topicBuffer = hexToBytes(msg.topic)
    document.querySelector('#game-topic').innerText = msg.topic
    document.querySelector('#loading').classList.add('hidden')
    document.querySelector('#game').classList.remove('hidden')
    hideGameOver()
    game.start(msg.id, topicBuffer)
  } else if (msg.type === 'connected') {
    game.addPeer(msg.id)
  } else if (msg.type === 'disconnected') {
    game.removePeer(msg.id)
  } else if (msg.type === 'data') {
    let state = null
    try {
      state = JSON.parse(msg.payload)
    } catch {
      return
    }
    game.applyPeerState(state)
  } else if (msg.type === 'update') {
    document.querySelector('#peers-count').textContent = msg.connections
  }
})

bridge.onWorkerExit(WORKER, () => console.log('worker exited'))

document.querySelector('#create-game').addEventListener('click', createGame)
document.querySelector('#join-form').addEventListener('submit', joinGame)
document.querySelector('#join-game-topic').addEventListener('input', (e) => {
  const cleaned = e.target.value.replace(/\s+/g, '')
  if (cleaned !== e.target.value) e.target.value = cleaned
})
document.querySelector('#leave-game').addEventListener('click', leaveGame)
document.querySelector('#play-again').addEventListener('click', () => {
  document.querySelector('pear-snake').reset()
  hideGameOver()
})

function loading() {
  document.querySelector('#setup').classList.add('hidden')
  document.querySelector('#loading').classList.remove('hidden')
}

function createGame() {
  loading()
  sendToWorker({ type: 'join', topic: null })
}

function joinGame(e) {
  e.preventDefault()
  const topicHex = document.querySelector('#join-game-topic').value.trim()
  if (topicHex.length === 0) return
  loading()
  sendToWorker({ type: 'join', topic: topicHex })
}

function leaveGame() {
  sendToWorker({ type: 'leave' })
  document.querySelector('pear-snake').leave()
  hideGameOver()
  document.querySelector('#peers-count').textContent = 0
  document.querySelector('#game-topic').innerText = ''
  document.querySelector('#game').classList.add('hidden')
  document.querySelector('#setup').classList.remove('hidden')
}

function showGameOver(score) {
  document.querySelector('#final-score').textContent = `Score ${score}`
  document.querySelector('#game-over').classList.remove('hidden')
}

function hideGameOver() {
  document.querySelector('#game-over').classList.add('hidden')
}

const MAX_NAMED = 5
let hudCache = ''

function updateHud(game) {
  const standings = game.leaderboard()
  const serialized = JSON.stringify(standings)
  if (serialized === hudCache) return
  hudCache = serialized

  const line = document.querySelector('#score-line')
  line.textContent = ''

  if (standings.length <= 1) {
    line.textContent = `Score ${game.myScore()}`
    return
  }

  let shown = standings
  let more = 0
  if (standings.length > MAX_NAMED) {
    shown = standings.slice(0, MAX_NAMED)
    const me = standings.find((s) => s.me)
    if (me && !shown.some((s) => s.me)) {
      shown = [...standings.slice(0, MAX_NAMED - 1), me]
    }
    more = standings.length - MAX_NAMED
  }

  for (const s of shown) {
    const chip = document.createElement('div')
    chip.className = 'chip' + (s.me ? ' me' : '')
    const swatch = document.createElement('div')
    swatch.className = 'swatch'
    swatch.style.backgroundColor = s.color
    const score = document.createElement('span')
    score.textContent = s.score
    chip.append(swatch, score)
    line.appendChild(chip)
  }
  if (more > 0) {
    const chip = document.createElement('div')
    chip.className = 'chip more'
    chip.textContent = `+${more}`
    line.appendChild(chip)
  }
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

const VECTORS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
}

const QUEUE_LIMIT = 2

const POINTS_PER_PEAR = 100

class Player {
  constructor(id, game) {
    this.id = id
    this.color = '#' + id.slice(0, 6)
    this.game = game
    this.snake = []
    this.direction = { x: 0, y: 0 }
  }

  tick(food) {
    if (this.snake.length === 0) this.snake.unshift(this.game.pos())
    const head = {
      x: (this.snake[0].x + this.direction.x + Game.tiles) % Game.tiles,
      y: (this.snake[0].y + this.direction.y + Game.tiles) % Game.tiles
    }
    this.snake.unshift(head)
    const ate = head.x === food.x && head.y === food.y
    if (!ate) this.snake.pop()
    return ate
  }

  collides(player) {
    const head = this.snake[0]
    if (!head) return false
    return player.snake.some((seg) => seg.x === head.x && seg.y === head.y)
  }

  selfCollides() {
    const [head, ...body] = this.snake
    return body.some((segment) => segment.x === head.x && segment.y === head.y)
  }
}

class Game extends HTMLElement {
  static grid = 20
  static tiles = 30

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.topicBuffer = null
    this.players = new Map()
    this.connected = new Set()
    this.speed = 100
    this.food = null
    this.player = null
    this.drop = false
    this.queue = []
    this.timer = null
    this.drawing = false
    this.shadowRoot.innerHTML = `
      <style> canvas { background: #000; display: block; margin: auto } </style>
      <canvas></canvas>
    `
    this.canvas = this.shadowRoot.querySelector('canvas')
    this.ctx = this.canvas.getContext('2d')

    this.keydown = (e) => {
      if (e.key === 'ArrowUp') this.setDirection('up')
      else if (e.key === 'ArrowDown') this.setDirection('down')
      else if (e.key === 'ArrowLeft') this.setDirection('left')
      else if (e.key === 'ArrowRight') this.setDirection('right')
    }
  }

  connectedCallback() {
    this.canvas.width = Game.grid * Game.tiles
    this.canvas.height = Game.grid * Game.tiles
  }

  start(playerId, topicBuffer) {
    this.topicBuffer = topicBuffer
    this.food = { x: this.topicBuffer[0] % Game.tiles, y: this.topicBuffer[1] % Game.tiles }
    this.player = new Player(playerId, this)
    this.addPlayer(this.player)
    this.loop()
    if (!this.drawing) {
      this.drawing = true
      this.draw()
    }
    document.addEventListener('keydown', this.keydown)
  }

  setDirection(dir) {
    if (this.drop || !this.player) return
    if (this.queue.length >= QUEUE_LIMIT) return
    const next = VECTORS[dir]
    const last = this.queue[this.queue.length - 1] ?? this.player.direction
    const same = next.x === last.x && next.y === last.y
    const reverse = next.x === -last.x && next.y === -last.y
    if (same || reverse) return
    this.queue.push(next)
  }

  over() {
    if (this.drop) return
    this.canvas.style.background = '#151815'
    this.drop = true
    this.dropPlayer(this.player)
    showGameOver(this.myScore())
  }

  sync() {
    if (!this.player) return
    const data = JSON.stringify({
      id: this.player.id,
      food: this.food,
      snake: this.player.snake,
      drop: this.drop
    })
    sendToWorker({ type: 'send', data })
  }

  pos() {
    const coords = {
      x: Math.floor(Math.random() * Game.tiles),
      y: Math.floor(Math.random() * Game.tiles)
    }
    if (coords.x === this.food?.x && coords.y === this.food?.y) return this.pos()
    if (
      [...this.players.values()].some(
        (player) => coords.x === player.snake[0]?.x && coords.y === player.snake[0]?.y
      )
    ) {
      return this.pos()
    }
    return coords
  }

  tick() {
    if (this.topicBuffer === null) return
    if (this.drop) return
    const turn = this.queue.shift()
    if (turn) this.player.direction = turn
    if (this.food === null) this.food = this.pos()
    const ate = this.player.tick(this.food)
    if (ate) this.food = this.pos()
    for (const opponent of this.players.values()) {
      if (opponent === this.player) {
        if (this.player.selfCollides()) this.over()
      } else if (this.player.collides(opponent)) this.over()
      else if (opponent.collides(this.player)) this.dropPlayer(opponent)
    }
  }

  draw() {
    requestAnimationFrame(() => this.draw())
    if (this.food === null) return
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    if (pearImage.complete && pearImage.naturalHeight > 0) {
      const scale = Game.grid / Math.max(pearImage.naturalWidth, pearImage.naturalHeight)
      const w = pearImage.naturalWidth * scale
      const h = pearImage.naturalHeight * scale
      this.ctx.drawImage(
        pearImage,
        this.food.x * Game.grid + (Game.grid - w) / 2,
        this.food.y * Game.grid + (Game.grid - h) / 2,
        w,
        h
      )
    }
    for (const player of this.players.values()) {
      this.ctx.fillStyle = player.color
      for (const seg of player.snake) {
        this.ctx.fillRect(seg.x * Game.grid, seg.y * Game.grid, Game.grid, Game.grid)
      }
    }
  }

  loop() {
    this.tick()
    this.sync()
    updateHud(this)
    this.timer = setTimeout(() => this.loop(), this.speed)
  }

  destroy() {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  leave() {
    this.destroy()
    document.removeEventListener('keydown', this.keydown)
    this.queue.length = 0
    this.players.clear()
    this.connected.clear()
    this.food = null
    this.player = null
    this.drop = false
    this.topicBuffer = null
    this.canvas.style.background = '#000'
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  reset() {
    if (!this.topicBuffer || !this.player) return
    const id = this.player.id
    this.dropPlayer(this.player)
    this.queue.length = 0
    this.drop = false
    this.player = new Player(id, this)
    this.addPlayer(this.player)
    this.canvas.style.background = '#000'
    updateHud(this)
  }

  score(player) {
    return Math.max(0, player.snake.length - 1) * POINTS_PER_PEAR
  }

  myScore() {
    return this.player ? this.score(this.player) : 0
  }

  leaderboard() {
    const players = new Map(this.players)
    if (this.player) players.set(this.player.id, this.player)
    return [...players.values()]
      .map((p) => ({
        id: p.id,
        color: p.color,
        score: this.score(p),
        me: p.id === this.player?.id
      }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  }

  addPlayer(player) {
    this.players.set(player.id, player)
  }

  dropPlayer(player) {
    if (!this.players.has(player.id)) return
    this.players.delete(player.id)
  }

  addPeer(id) {
    this.connected.add(id)
    if (!this.players.has(id)) this.addPlayer(new Player(id, this))
  }

  removePeer(id) {
    this.connected.delete(id)
    const player = this.players.get(id)
    if (player) this.dropPlayer(player)
  }

  applyPeerState(state) {
    let player = this.players.get(state.id)

    if (state.drop) {
      if (player) this.dropPlayer(player)
      return
    }

    if (!player) {
      if (!this.connected.has(state.id)) return
      player = new Player(state.id, this)
      this.addPlayer(player)
    }

    if (state.snake) {
      if (state.snake.length > player.snake.length) this.food = state.food
      player.snake = state.snake
    }
  }
}

customElements.define('pear-snake', Game)
