const Hyperswarm = require('hyperswarm')
const crypto = require('hypercore-crypto')
const b4a = require('b4a')

const swarm = new Hyperswarm()

function send(msg) {
  Bare.IPC.write(Buffer.from(JSON.stringify(msg)))
  Bare.IPC.write(Buffer.from('\n'))
}

Bare.IPC.on('data', (data) => {
  const msg = JSON.parse(data.toString())
  if (msg.type === 'join') {
    joinSwarm(msg.topic).catch(console.error)
  } else if (msg.type === 'send') {
    for (const peer of swarm.connections) {
      peer.write(msg.data)
    }
  }
})

swarm.on('connection', (peer) => {
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

swarm.on('update', () => {
  send({ type: 'update', connections: swarm.connections.size })
})

async function joinSwarm(topicHex) {
  const topicBuffer = topicHex ? b4a.from(topicHex, 'hex') : crypto.randomBytes(32)
  const topic = b4a.toString(topicBuffer, 'hex')
  const id = b4a.toString(swarm.keyPair.publicKey, 'hex').slice(0, 6)
  const discovery = swarm.join(topicBuffer, { client: true, server: true })
  await discovery.flushed()
  send({ type: 'ready', id, topic })
}
