import { spawn } from 'child_process'
import { createInterface } from 'readline'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { command, arg, flag, summary } from 'paparam'

const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url))
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const name = pkg.name
const product = pkg.productName ?? pkg.name

const cmd = command(
  'bootstrap',
  summary('Build, stage and seed the Snake app'),
  arg('<version>', 'version to set — patch, minor, major, or explicit e.g. 1.3.2'),
  arg('[link]', 'pear link — skips pear touch if provided'),
  flag('--no-seed', 'skip seeding after stage')
)

if (cmd.parse() === null) process.exit(0)

const version = cmd.args.version
const link = cmd.args.link || pkg.upgrade || null
const doSeed = cmd.flags.seed !== false

function run(cmd) {
  console.log(`$ ${cmd}`)
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, { stdio: 'inherit', shell: true })
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`"${cmd}" exited with code ${code}`))
    )
    child.on('error', reject)
  })
}

function capture(cmd) {
  return new Promise((resolve, reject) => {
    let out = ''
    const child = spawn(cmd, { shell: true })
    child.stdout.on('data', (d) => {
      out += d
    })
    child.stderr.on('data', (d) => {
      out += d
    })
    child.on('exit', () => resolve(out.trim()))
    child.on('error', reject)
  })
}

function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase() === 'y')
    })
  })
}

let pearLink = link
if (!pearLink) {
  console.log('\n--- touch ---')
  const out = await capture('pear touch --json')
  pearLink = 'pear://' + JSON.parse(out.split('\n')[0]).data.key
  if (!pearLink) throw new Error('failed to parse pear link from pear touch output')
  console.log(pearLink)
  console.log('\n--- set upgrade link ---')
  await run(`npm pkg set upgrade=${pearLink}`)
} else {
  console.log(`\n--- using link: ${pearLink} ---`)
  console.log('\n--- version ---')
  await run(`npm version ${version}`)
}

const newVersion = JSON.parse(readFileSync(pkgPath, 'utf8')).version
const target = `${name}-${newVersion}`
const targetDir = `./out/${target}`

console.log('\n--- make ---')
await run(`npm run make:${process.platform}`)

const builds = [
  { platform: 'darwin', arch: 'arm64', app: `${product}.app` },
  { platform: 'darwin', arch: 'x64', app: `${product}.app` },
  { platform: 'linux', arch: 'arm64', app: `${product}.AppImage` },
  { platform: 'linux', arch: 'x64', app: `${product}.AppImage` },
  { platform: 'win32', arch: 'x64', app: `${product}.msix` },
  { platform: 'win32', arch: 'arm64', app: `${product}.msix` }
]

const archFlags = builds
  .filter(({ platform, arch, app }) => existsSync(`./out/${product}-${platform}-${arch}/${app}`))
  .map(
    ({ platform, arch, app }) =>
      `--${platform}-${arch}-app "./out/${product}-${platform}-${arch}/${app}"`
  )
  .join(' ')

console.log(`\n--- build deployment directory: ${targetDir} ---`)
await run(`npx pear-build --package=./package.json ${archFlags} --target ${targetDir}`)

console.log('\n--- stage dry run ---')
await run(`pear stage --dry-run ${pearLink} ${targetDir}`)

const ok = await confirm('\nConfirm [y|N]? ')
if (!ok) {
  console.log('aborted — reverting version commit...')
  await run(`git tag -d v${newVersion}`)
  await run('git reset --hard HEAD~1')
  process.exit(0)
}

console.log('\n--- stage ---')
await run(`pear stage ${pearLink} ${targetDir}`)

if (doSeed) {
  console.log('\n--- seed (ctrl+c to stop) ---')
  await run(`pear seed ${pearLink}`)
} else {
  console.log(`\ndone — ${pearLink}`)
}
