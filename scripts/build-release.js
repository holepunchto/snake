const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

async function main() {
  const source = path.resolve(__dirname, '..')
  const output = path.join(source, 'out/desktop')
  fs.mkdirSync(output, { recursive: true })
  process.chdir(source)

  const { api: forge } = require('@electron-forge/core')
  const options = {
    dir: source,
    platform: process.platform,
    arch: process.arch,
    outDir: path.join(source, 'out')
  }

  if (process.platform === 'darwin') {
    await forge.package(options)
    execFileSync('ditto', [
      '-c',
      '-k',
      '--sequesterRsrc',
      '--keepParent',
      path.join(options.outDir, `Snake-darwin-${process.arch}`, 'Snake.app'),
      path.join(output, 'payload.zip')
    ])
  } else {
    const maker =
      process.platform === 'win32'
        ? '@electron-forge/maker-msix'
        : 'pear-electron-forge-maker-appimage'
    const results = await forge.make({ ...options, overrideTargets: [maker] })
    const extension = process.platform === 'win32' ? '.msix' : '.AppImage'
    const artifacts = results.flatMap((result) => result.artifacts)
    if (artifacts.length !== 1) throw new Error(`Expected one ${extension} artifact`)
    fs.copyFileSync(artifacts[0], path.join(output, `Snake${extension}`))
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
