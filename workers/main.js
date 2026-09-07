const PearRuntime = require('pear-runtime')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const goodbye = require('graceful-goodbye')
const FramedStream = require('framed-stream')
const crypto = require('hypercore-crypto')
const b4a = require('b4a')
const path = require('bare-path')
const { isBareKit } = require('which-runtime')

// On desktop, Bare.argv starts with the executable path (argv[0]) and the
// worker entry path (argv[1]); on mobile (BareKit) the passed args land at
// argv[0..]. Offset the indices so the same arg order works on every platform.
const argv = (index) => Bare.argv[index + (isBareKit ? 0 : 2)]

const updaterConfig = {
  updates: argv(0) !== 'false',
  version: argv(1),
  upgrade: argv(2),
  name: argv(3),
  dir: argv(4),
  app: argv(5) // omitted in dev runs — the updater is inert without a packaged app
}

const pipe = new FramedStream(Bare.IPC)

const store = new Corestore(path.join(updaterConfig.dir, 'pear-runtime', 'corestore'))
const updaterSwarm = new Hyperswarm()
const pear = new PearRuntime({ ...updaterConfig, swarm: updaterSwarm, store })

pear.updater.on('error', (err) => {
  console.error(err)
  send({ type: 'updateFailed', error: err.message || String(err) })
})
if (updaterConfig.updates !== false) {
  updaterSwarm.on('connection', (connection) => store.replicate(connection))
  updaterSwarm.join(pear.updater.drive.core.discoveryKey, {
    client: true,
    server: false
  })
}

pear.updater.on('updating', () => send({ type: 'updating' }))
pear.updater.on('updated', () => send({ type: 'updated' }))

const gameSwarm = new Hyperswarm()

let joined = null
let commands = Promise.resolve()

function enqueue(fn) {
  commands = commands.then(fn).catch(console.error)
}

function send(msg) {
  pipe.write(Buffer.from(JSON.stringify(msg)))
}

gameSwarm.on('connection', (peer) => {
  const id = b4a.toString(peer.remotePublicKey, 'hex').slice(0, 6)

  if (joined === null) {
    peer.on('error', () => {})
    peer.destroy()
    return
  }

  send({ type: 'connected', id })

  peer.on('data', (message) => {
    send({ type: 'data', id, payload: message.toString() })
  })

  peer.on('error', () => {
    send({ type: 'disconnected', id })
  })

  peer.on('close', () => {
    send({ type: 'disconnected', id })
  })
})

gameSwarm.on('update', () => {
  send({ type: 'update', connections: gameSwarm.connections.size })
})

async function joinGame(topicHex) {
  await leaveGame()
  const topicBuffer = topicHex ? b4a.from(topicHex, 'hex') : crypto.randomBytes(32)
  const topic = b4a.toString(topicBuffer, 'hex')
  const id = b4a.toString(gameSwarm.keyPair.publicKey, 'hex').slice(0, 6)
  joined = topicBuffer
  const discovery = gameSwarm.join(topicBuffer, { client: true, server: true })
  await discovery.flushed()
  send({ type: 'ready', id, topic })
}

async function leaveGame() {
  if (joined === null) return
  const topic = joined
  joined = null
  await gameSwarm.leave(topic)
  // snapshot: destroying removes the connection from the live set
  for (const peer of [...gameSwarm.connections]) peer.destroy()
}

pipe.on('data', async (data) => {
  let msg = null
  try {
    msg = JSON.parse(data.toString())
  } catch {
    return
  }
  if (msg.type === 'join') {
    enqueue(() => joinGame(msg.topic))
  } else if (msg.type === 'leave') {
    enqueue(() => leaveGame())
  } else if (msg.type === 'send') {
    for (const peer of gameSwarm.connections) {
      peer.write(msg.data)
    }
  } else if (msg.type === 'applyUpdate') {
    try {
      await pear.ready()
      await pear.updater.applyUpdate()
      send({ type: 'updateApplied' })
    } catch (err) {
      send({ type: 'updateFailed', error: err.message })
    }
  }
})

goodbye(async () => {
  await gameSwarm.destroy()
  await updaterSwarm.destroy()
  await pear.close()
  await store.close()
})
