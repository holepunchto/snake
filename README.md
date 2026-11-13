# Snake

> P2P multiplayer snake, built on Electron with [pear-runtime](https://github.com/holepunchto/hello-pear-electron)

As made in [Pear Workshop](https://github.com/holepunchto/pear-workshop).

## Architecture

The app runs as a standard Electron application. Peer-to-peer networking via [Hyperswarm](https://github.com/holepunchto/hyperswarm) runs inside an embedded [Bare](https://github.com/nicolo-ribaudo/bare) worker spawned by `pear-runtime` — keeping Node APIs out of the sandboxed renderer process. The renderer communicates with the worker over a simple JSON IPC protocol bridged through the Electron main process.

```
renderer (sandboxed)
  └─ window.bridge (IPC via contextBridge)
       └─ electron main process
            └─ pear-runtime
                 └─ bare worker  ←→  Hyperswarm (P2P)
```

**IPC protocol**

| Direction         | Message                           | Meaning                                     |
| ----------------- | --------------------------------- | ------------------------------------------- |
| renderer → worker | `{ type: 'join', topic }`         | Join or create a game (null topic = create) |
| renderer → worker | `{ type: 'send', data }`          | Broadcast game state to peers               |
| worker → renderer | `{ type: 'ready', id, topic }`    | Game can start while announcing its topic   |
| worker → renderer | `{ type: 'flushed', topic }`      | Topic announced and ready to share          |
| worker → renderer | `{ type: 'connected', id }`       | Peer joined                                 |
| worker → renderer | `{ type: 'disconnected', id }`    | Peer dropped                                |
| worker → renderer | `{ type: 'data', id, payload }`   | Game state from a peer                      |
| worker → renderer | `{ type: 'update', connections }` | Peer count changed                          |

## Development

```sh
npm install
```

```sh
npm start
```

`npm start` runs with `--no-updates` so OTA updates are disabled in development.

Start a second instance:

```sh
npm start -- --storage /tmp/second-instance
```

## Releases

Run **Build Snake Desktop** in [pear-snake-ci-build Actions](https://github.com/holepunchto/pear-snake-ci-build/actions). Select the source ref and platforms; enable `run-stage` to stage Pear updates, or `stage-dry-run` with it to preview staging. Update the version in `package.json` before building a new release.

CI runs `npm run build:release` from this repository without release credentials. It signs the resulting artifacts on separate runners and handles Pear staging. Signing credentials belong only in the CI repository's protected `release` environment.

To compile the current platform locally:

```sh
npm run build:release
```

The unsigned outputs are written to `out/desktop`.

### Provisioning and multisig

Provisioning and multisig remain separate production operations. See [Provision](https://github.com/holepunchto/hello-pear-electron#provision) and [Multisig](https://github.com/holepunchto/hello-pear-electron#multisig) for their setup and usage.
