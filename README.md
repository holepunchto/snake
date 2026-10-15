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
| worker → renderer | `{ type: 'ready', id, topic }`    | Swarm flushed, game can start               |
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

## Quick Deploy

### Bootstrap

Bootstrap is the lowest deployment tier. It builds the app, stages it to a pear link and seeds it into the network — enough for collaborators to pull the latest version, run demos, or do a quick sanity check. No compression or signing ceremony required.

```sh
npm run bootstrap -- <version> [link] [--no-seed]
```

| Argument    | Description                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `<version>` | Semver increment or explicit version — same as `npm version` (`patch`, `minor`, `major`, `1.3.2`, …)                              |
| `[link]`    | Pear link to stage to. Defaults to the `upgrade` field in `package.json`. Omit on first run to create a new link via `pear touch` |
| `--no-seed` | Skip seeding after stage                                                                                                          |

**First run** — creates a new pear link, writes it to `package.json` as `upgrade`, then builds and stages:

```sh
npm run bootstrap patch
```

**Subsequent runs** — picks up the existing `upgrade` link automatically:

```sh
npm run bootstrap patch
```

**With an explicit link:**

```sh
npm run bootstrap patch pear://‹key›
```

The script will show a dry-run diff and ask for confirmation before staging. If you decline, the `npm version` commit and tag are automatically reverted.

### Multi-architecture builds

`npm run bootstrap` only builds for the machine it runs on. To include other architectures, build on each machine and copy the output into the `out/` directory before running bootstrap:

**macOS arm64** (Apple Silicon)

```sh
npm run make:darwin
# produces: out/Snake-darwin-arm64/Snake.app
```

**macOS x64** (Intel)

```sh
npm run make:darwin
# produces: out/Snake-darwin-x64/Snake.app
```

**Linux arm64 / x64**

```sh
npm run make:linux
# produces: out/Snake-linux-{arch}/Snake.AppImage
```

**Windows x64**

```sh
npm run make:win32
# produces: out/Snake-win32-x64/Snake.msix
```

Copy any of the above `out/Snake-{platform}-{arch}` directories to the machine running bootstrap before invoking it. The bootstrap script scans `out/` and automatically includes every artifact it finds in the `pear-build` command.

## Production Deploy

Taking an application to production would first involve [vendor signing](https://github.com/holepunchto/hello-pear-electron#3-make-distributables-) per Operating System. Then use `pear stage` (as `npm run bootstrap` does) to write signed distributables to the upgrade link. The upgrade link then becomes the source of it's own replacement.

### Provision

Provision syncs from a bootstrapped link into a separate pear link with a smaller data footprint — no accumulated additions/deletions. Use it for stakeholder preview, QA, and dogfooding before committing to production.

Create a new link

```sh
pear touch
```

Set upgrade field to new link, stage that onto prior stage link.

```sh
PRIOR_UPGADE=npm get upgrade
npm set upgrade=<newly-touched-link>
npm run bootstrap $PRIOR_UPGRADE
```

```sh
pear provision <versioned-source-link> <newly-touched-link> <versioned-production-link>
```

See [Provision](https://github.com/holepunchto/hello-pear-electron#provision) in the hello-pear-electron template for full usage.

### Multisig

Multisig is the production tier. A quorum of signers must co-sign the provisioned link before a production update goes live, giving cryptographic proof of collective sign-off and making the release machine-independent and tamper-resistant.

See [Multisig](https://github.com/holepunchto/hello-pear-electron#multisig) in the hello-pear-electron template for the full signing ceremony.

Once a multisig link is acquired based on config, set it as the `package.json` `upgrade` field, write it onto the stage link, from there onto the provision and then complete the multisig flow.
