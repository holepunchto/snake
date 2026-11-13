const fs = require('fs')
const path = require('path')
const pkg = require('./package.json')
const appName = pkg.productName ?? pkg.name

function getWindowsKitVersion() {
  const programFiles = process.env['PROGRAMFILES(X86)'] || process.env.PROGRAMFILES
  if (!programFiles) return undefined
  const kitsDir = path.join(programFiles, 'Windows Kits')
  try {
    for (const kit of fs.readdirSync(kitsDir).sort().reverse()) {
      const binDir = path.join(kitsDir, kit, 'bin')
      if (!fs.existsSync(binDir)) continue
      const version = fs
        .readdirSync(binDir)
        .filter((d) => /^\d+\.\d+\.\d+\.\d+$/.test(d))
        .sort()
        .pop()
      if (version) return version
    }
  } catch {
    return undefined
  }
}

const packagerConfig = {
  icon: 'build/icon',
  protocols: [{ name: appName, schemes: [pkg.name] }],
  derefSymlinks: true
}

module.exports = {
  packagerConfig,

  makers: [
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {}
    },
    {
      name: '@electron-forge/maker-msix',
      platforms: ['win32'],
      config: {
        appManifest: path.join(__dirname, 'build', 'AppxManifest.xml'),
        packageAssets: path.join(__dirname, 'build'),
        windowsKitVersion: getWindowsKitVersion(),
        sign: false
      }
    },
    {
      name: 'pear-electron-forge-maker-appimage',
      platforms: ['linux'],
      config: {
        icons: [
          { file: 'build/icon/icon-16x16.png', size: 16 },
          { file: 'build/icon/icon-32x32.png', size: 32 },
          { file: 'build/icon/icon-64x64.png', size: 64 },
          { file: 'build/icon/icon-128x128.png', size: 128 },
          { file: 'build/icon/icon-256x256.png', size: 256 }
        ]
      }
    },
    {
      name: 'pear-electron-forge-maker-flatpak',
      platforms: ['linux'],
      config: {
        appId: 'com.pears.Snake',
        icon: `${packagerConfig.icon}.png`,
        metainfo: 'build/metainfo.xml',
        entrypoint: 'build/entrypoint.sh',
        comment: 'P2P multiplayer snake game',
        categories: ['Game']
      }
    },
    {
      name: 'pear-electron-forge-maker-snap',
      platforms: ['linux'],
      config: {
        snapcraftYamlPath: 'build/snapcraft.yaml',
        summary: 'P2P multiplayer snake game',
        description: 'A peer-to-peer multiplayer snake game built on Pear.',
        contact: 'hello@holepunchto.to',
        license: 'Apache-2.0',
        issues: 'https://github.com/holepunchto/snake/issues',
        website: 'https://github.com/holepunchto/snake',
        icon: `${packagerConfig.icon}.png`
      }
    }
  ],

  hooks: {
    readPackageJson: async (forgeConfig, packageJson) => {
      if (process.env.UPGRADE_KEY) {
        packageJson.upgrade = process.env.UPGRADE_KEY
      }

      return packageJson
    },
    preMake: async () => {
      fs.rmSync(path.join(__dirname, 'out', 'make'), { recursive: true, force: true })

      if (process.platform !== 'win32') return

      const manifest = path.join(__dirname, 'build', 'AppxManifest.xml')
      const msixVersion = pkg.version.replace(/^(\d+\.\d+\.\d+)$/, '$1.0')
      const xml = fs.readFileSync(manifest, 'utf-8')
      fs.writeFileSync(manifest, xml.replace(/Version="[^"]*"/, `Version="${msixVersion}"`))
    }
  },

  plugins: [
    {
      name: 'electron-forge-plugin-universal-prebuilds',
      config: {}
    },
    {
      name: 'electron-forge-plugin-prune-prebuilds',
      config: {}
    }
  ]
}
