#!/usr/bin/env node
/**
 * free-model-bridge setup — one command that takes a fresh machine from zero
 * to a working free-model stack in OpenCode.
 *
 *   node bin/setup.mjs [--with-fcc] [--install-dir <dir>] [--port <n>]
 *                      [--data-dir <dir>] [--skip-autostart]
 *
 * What it does (idempotent — safe to re-run):
 *   1. Preflight checks: node >= 22.19, git present, bun recommended
 *   2. Fetches the OFM gateway (git clone --depth 1) if not already present
 *   3. Starts the gateway if /health is not answering, then waits for it
 *   4. Creates ~/.config/opencode/opencode.json if missing
 *   5. Regenerates the `00-free` provider + policy allow (delegates to bin/sync-models.mjs)
 *   6. (win32) Adds a Startup-folder shortcut — no admin needed
 *   7. --with-fcc: installs free-claude-code via uv, pins HOST=127.0.0.1,
 *      starts it, wires the `fcc` provider, adds a startup shortcut (win32)
 */
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const opt = name => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const HAS = n => args.includes(n)

const WITH_FCC = HAS('--with-fcc')
const SKIP_AUTOSTART = HAS('--skip-autostart')
const PORT = Number(opt('--port') ?? 18900)
const FCC_PORT = 8082
const INSTALL_DIR = path.resolve(opt('--install-dir') ?? path.join(os.homedir(), process.platform === 'win32' ? 'Apps' : '.', 'our-free-model'))
const DATA_DIR = path.resolve(opt('--data-dir') ?? path.join(os.homedir(), '.our-free-model'))
const CONFIG_DIR = path.join(os.homedir(), '.config', 'opencode')
const CONFIG = path.join(CONFIG_DIR, 'opencode.json')
const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OFM_REPO_URL = 'https://github.com/Ebony-Vinyl/dsh-our-free-model'
const FCC_PORTAL = `http://127.0.0.1:${FCC_PORT}`

const step = msg => console.log(`\n== ${msg}`)
const ok = msg => console.log(`   ok: ${msg}`)
const warn = msg => console.log(`   WARN: ${msg}`)
const die = msg => { console.error(`\nFAILED: ${msg}`); process.exit(1) }

const run = (cmd, argv, o = {}) => {
  try { execFileSync(cmd, argv, { stdio: 'inherit', ...o }); return true }
  catch { return false }
}
const tryCommand = (cmd, argv) => {
  try { execFileSync(cmd, argv, { stdio: 'ignore' }); return true }
  catch { return false }
}

const nodeMajor = Number(process.versions.node.split('.')[0])
const minor = Number(process.versions.node.split('.')[1])

/* ---------- 1. preflight ---------- */
step('preflight')
if (nodeMajor < 22 || (nodeMajor === 22 && minor < 19)) warn(`node ${process.versions.node} found; the OFM gateway targets node ^22.19 || >=24`)
else ok(`node ${process.versions.node}`)
if (!tryCommand('git', ['--version'])) die('git is required (used to fetch the gateway sources and sync model rosters)')
ok('git found')
if (tryCommand('bun', ['--version'])) ok('bun found (fast free-lane transport)')
else warn('bun not found — the free lane falls back to node transport (slower but works). Install bun from https://bun.sh if you want it.')

/* ---------- 2. fetch gateway sources ---------- */
step('gateway sources')
const cliEntry = path.join(INSTALL_DIR, 'packages', 'standalone', 'cli.mjs')
if (fs.existsSync(cliEntry)) {
  ok(`already present: ${INSTALL_DIR}`)
} else {
  console.log(`cloning ${OFM_REPO_URL} -> ${INSTALL_DIR}`)
  fs.mkdirSync(path.dirname(INSTALL_DIR), { recursive: true })
  if (!run('git', ['clone', '--depth', '1', OFM_REPO_URL, INSTALL_DIR])) die(`git clone failed; clone manually: git clone ${OFM_REPO_URL} "${INSTALL_DIR}"`)
  if (!fs.existsSync(cliEntry)) die('clone succeeded but packages/standalone/cli.mjs is missing — upstream layout changed?')
}

/* ---------- 3. start gateway ---------- */
step('gateway service')
const healthy = async () => {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(2000) }); return r.ok } catch { return false }
}
if (await healthy()) {
  ok(`already serving on 127.0.0.1:${PORT}`)
} else {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const out = fs.openSync(path.join(DATA_DIR, 'service.out.log'), 'a')
  const err = fs.openSync(path.join(DATA_DIR, 'service.err.log'), 'a')
  const child = spawn(process.execPath, [cliEntry, '--port', String(PORT), '--no-lan'], { cwd: DATA_DIR, detached: true, stdio: ['ignore', out, err] })
  child.unref()
  ok(`spawned pid ${child.pid}; waiting for /health`)
  let up = false
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000))
    up = await healthy()
    if (up) break
  }
  if (!up) die(`gateway did not become healthy within 30s — check ${path.join(DATA_DIR, 'service.err.log')}`)
}
ok('gateway is up')

/* ---------- 4. open-code config ---------- */
step('OpenCode config')
fs.mkdirSync(CONFIG_DIR, { recursive: true })
if (!fs.existsSync(CONFIG)) {
  fs.writeFileSync(CONFIG, JSON.stringify({}, null, 2), 'utf8')
  ok(`created empty config ${CONFIG}`)
} else {
  try { JSON.parse(fs.readFileSync(CONFIG, 'utf8')) } catch { die(`${CONFIG} is not valid JSON — fix or remove it first (backup is not taken by setup; sync-models does that)`) }
}

/* ---------- 5. sync provider ---------- */
step('provider sync (00-free)')
if (!run(process.execPath, [path.join(REPO_ROOT, 'bin', 'sync-models.mjs'), '--config', CONFIG, '--port', String(PORT)], { env: { ...process.env, OFM_HOME: DATA_DIR } }))
  die('sync-models.mjs failed — run it manually to see the error')

/* ---------- 6. autostart (win32) ---------- */
const createStartupShortcut = (name, args) => {
  const ps =
    `$s = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) '${name}.lnk'));` +
    ` $s.TargetPath = 'powershell.exe';` +
    ` $s.Arguments = '${args.replace(/'/g, "''")}';` +
    ` $s.WindowStyle = 7;` +
    ` $s.Save()`
  return run('powershell.exe', ['-NoProfile', '-Command', ps])
}

if (!SKIP_AUTOSTART && process.platform === 'win32') {
  step('autostart (Startup folder shortcut)')
  const starter = path.join(REPO_ROOT, 'start', 'gateway-start.ps1')
  const launcherArgs = `-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${starter}" -RepoDir "${INSTALL_DIR}" -Port ${PORT} -DataDir "${DATA_DIR}"`
  if (createStartupShortcut('FreeModelGateway', launcherArgs)) ok('Startup\\FreeModelGateway.lnk created (hidden at logon, idempotent)')
  else warn('could not create the startup shortcut — autostart skipped (gateway still runs manually)')
} else if (!SKIP_AUTOSTART) {
  step('autostart')
  warn(`win32 shortcut only here — on ${process.platform} add a user service, e.g. systemd: \`ExecStart=${process.execPath} ${cliEntry} --port ${PORT}\``)
}

/* ---------- 7. optional FCC ---------- */
if (WITH_FCC) {
  step('free-claude-code (FCC)')
  const fccBin = process.platform === 'win32' ? 'fcc-server.exe' : 'fcc-server'
  const fccBinPath = path.join(os.homedir(), '.local', 'bin', fccBin)

  if (fs.existsSync(fccBinPath)) {
    ok(`fcc-server already installed (${fccBinPath}) — skipping uv tool install`)
  } else {
    if (!tryCommand('uv', ['--version'])) {
      const installer = process.platform === 'win32'
        ? ['powershell.exe', ['-NoProfile', '-Command', "irm https://astral.sh/uv/install.ps1 | iex"]]
        : ['bash', ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh']]
      if (!run(...installer)) die('failed to install uv (needed to run FCC on python 3.14). Install it manually from https://astral.sh')
      // the installer only updates the registry PATH — make the freshly installed uv visible to this process too
      process.env.PATH = `${path.join(os.homedir(), '.local', 'bin')}${path.delimiter}${process.env.PATH ?? ''}`
    }
    if (!run('uv', ['tool', 'install', '--python', '3.14.10', 'free-claude-code'])) die('uv tool install free-claude-code failed')
  }

  // pin loopback binding — the FCC default 0.0.0.0 is LAN-exposed with no auth
  const fccEnvDir = path.join(os.homedir(), '.fcc')
  fs.mkdirSync(fccEnvDir, { recursive: true })
  const envPath = path.join(fccEnvDir, '.env')
  let envTxt = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
  if (!/^HOST=/m.test(envTxt)) {
    fs.writeFileSync(envPath, (envTxt && !envTxt.endsWith('\n') ? envTxt + '\n' : envTxt) + 'HOST=127.0.0.1\n', 'utf8')
    ok(`pinned HOST=127.0.0.1 in ${envPath} (prevents 0.0.0.0 LAN exposure)`)
  } else ok(`${envPath} already pins HOST`)

  const fccHealthy = async () => {
    try { const r = await fetch(`${FCC_PORTAL}/admin/api/status`, { signal: AbortSignal.timeout(2000) }); return r.ok } catch { return false }
  }
  if (await fccHealthy()) ok('fcc-server already serving on 8082')
  else if (fs.existsSync(fccBinPath)) {
    const out = fs.openSync(path.join(fccEnvDir, 'server.out.log'), 'a')
    const err = fs.openSync(path.join(fccEnvDir, 'server.err.log'), 'a')
    const child = spawn(fccBinPath, [], { cwd: fccEnvDir, detached: true, stdio: ['ignore', out, err] })
    child.unref()
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1000))
      if (await fccHealthy()) break
    }
    if (!(await fccHealthy())) die(`fcc-server did not come up — check ${path.join(fccEnvDir, 'server.err.log')}`)
    ok('fcc-server started on 127.0.0.1:8082')
  } else die(`fcc-server binary not found at ${fccBinPath} although install reported success — try running it once manually`)

  if (!run(process.execPath, [path.join(REPO_ROOT, 'bin', 'add-fcc-provider.mjs')])) die('add-fcc-provider.mjs failed')

  if (!SKIP_AUTOSTART && process.platform === 'win32') {
    const launcherArgs = `-NoProfile -WindowStyle Hidden -Command Start-Process -FilePath "${fccBinPath}" -WorkingDirectory "${fccEnvDir}" -WindowStyle Hidden`
    if (createStartupShortcut('FCCServer', launcherArgs)) ok('Startup\\FCCServer.lnk created')
    else warn('could not create the FCC startup shortcut (FCC still runs manually)')
  }
}

/* ---------- done ---------- */
console.log(`
================================================================
 free-model-bridge is set up.
   gateway:   http://127.0.0.1:${PORT}          (00-free provider in OpenCode)
   dashboard: http://127.0.0.1:${PORT}           (login token in service.out.log)
${WITH_FCC ? `   fcc:       ${FCC_PORTAL}/admin          (fcc provider in OpenCode)\n` : ''}
 Manual steps that need *you* (web UI, your accounts):
   - EAC lane: dashboard -> EAC -> GitHub sign-in + star the repo
   - account channels (LobsterAI/TRAE/Cline/...): dashboard -> Channels -> sign in
   - aggregate providers with your own API keys: dashboard -> Aggregate
 Optional env: OPENROUTER_API_KEY for FCC's keyed providers (open_router/free works without).
 Verify: node bin/bakeoff.mjs
================================================================`)
