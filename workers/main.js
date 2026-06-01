const PearRuntime = require('pear-runtime')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const goodbye = require('graceful-goodbye')
const FramedStream = require('framed-stream')
const crypto = require('hypercore-crypto')
const b4a = require('b4a')
const path = require('bare-path')

const pipe = new FramedStream(Bare.IPC)

const updaterConfig = {
  dir: Bare.argv[2],
  app: Bare.argv[3],
  updates: Bare.argv[4] !== 'false',
  version: Bare.argv[5],
  upgrade: Bare.argv[6],
  name: Bare.argv[7]
}

const store = new Corestore(path.join(updaterConfig.dir, 'pear-runtime/corestore'))
const updaterSwarm = new Hyperswarm()
const pear = new PearRuntime({ ...updaterConfig, swarm: updaterSwarm, store })

pear.updater.on('error', console.error)
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

function send(msg) {
  pipe.write(Buffer.from(JSON.stringify(msg)))
}

gameSwarm.on('connection', (peer) => {
  const id = b4a.toString(peer.remotePublicKey, 'hex').slice(0, 6)
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
  const topicBuffer = topicHex ? b4a.from(topicHex, 'hex') : crypto.randomBytes(32)
  const topic = b4a.toString(topicBuffer, 'hex')
  const id = b4a.toString(gameSwarm.keyPair.publicKey, 'hex').slice(0, 6)
  const discovery = gameSwarm.join(topicBuffer, { client: true, server: true })
  await discovery.flushed()
  send({ type: 'ready', id, topic })
}

pipe.on('data', async (data) => {
  let msg = null
  try {
    msg = JSON.parse(data.toString())
  } catch {
    return
  }
  if (msg.type === 'join') {
    joinGame(msg.topic).catch(console.error)
  } else if (msg.type === 'send') {
    for (const peer of gameSwarm.connections) {
      peer.write(msg.data)
    }
  } else if (msg.type === 'applyUpdate') {
    await pear.updater.applyUpdate()
    send({ type: 'updateApplied' })
  }
})

goodbye(async () => {
  await gameSwarm.destroy()
  await updaterSwarm.destroy()
  await pear.close()
  await store.close()
})
