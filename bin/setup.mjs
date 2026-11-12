#!/usr/bin/env node
/**
 * free-model-bridge setup — one command that takes a fresh machine from zero
 * to a working free-model stack in OpenCode.
 *
 *   node bin/setup.mjs [--with-fcc] [--install-dir <dir>] [--port <n>]
 *                      [--data-dir <dir>] [--skip-autostart] [--dry-run]
 *                      [--autostart startup|launchd|systemd|none]
 *                      [--print-autostart gateway|fcc]
 *
 * What it does (idempotent — safe to re-run):
 *   1. Preflight checks: node >= 22.19, git present, bun recommended
 *   2. Fetches the OFM gateway (git clone --depth 1) if not already present
 *   3. Starts the gateway if /health is not answering, then waits for it
 *   4. Creates ~/.config/opencode/opencode.json if missing
 *   5. Regenerates the `00-free` provider + policy allow (delegates to bin/sync-models.mjs)
 *   6. Autostart, per platform (no admin needed on any of them):
 *        win32     Startup-folder shortcut
 *        darwin    launchd LaunchAgent  (~/Library/LaunchAgents)
 *        linux     systemd user unit    (~/.config/systemd/user)
 *   7. --with-fcc: installs free-claude-code via uv, pins HOST=127.0.0.1,
 *      starts it, wires the `fcc` provider, and autostarts it the same way.
 *
 * --dry-run prints the resolved plan (paths, ports, the exact unit/plist that
 * would be installed) and exits 0 without touching anything — used by CI.
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
const DRY_RUN = HAS('--dry-run')
const AUTOSTART = opt('--autostart')
const PRINT_AUTOSTART = opt('--print-autostart')
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
const cliEntry = path.join(INSTALL_DIR, 'packages', 'standalone', 'cli.mjs')
const NODE_BIN = process.execPath

/* ---------- autostart: which kind, and the exact unit/plist ---------- */
const autostartKind = () => {
  if (SKIP_AUTOSTART || AUTOSTART === 'none') return 'none'
  if (AUTOSTART && AUTOSTART !== 'auto') return AUTOSTART
  if (process.platform === 'win32') return 'startup'
  if (process.platform === 'darwin') return 'launchd'
  return 'systemd'
}

const gatewayArgs = () => [cliEntry, '--port', String(PORT), '--no-lan']

const xmlEscape = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

const launchdPlist = (label, argv, cwd, outLog) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
${argv.map(a => `    <string>${xmlEscape(a)}</string>`).join('\n')}
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(cwd)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(outLog)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(outLog.replace(/\.out\.log$/, '.err.log'))}</string>
</dict>
</plist>
`

// systemd needs arguments containing whitespace wrapped in double quotes.
const systemdQuote = a => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)

const systemdUnit = (description, argv, cwd) => `[Unit]
Description=${description}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${argv.map(systemdQuote).join(' ')}
WorkingDirectory=${cwd}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`

const GATEWAY_LABEL = 'com.kobadger.free-model-gateway'
const FCC_LABEL = 'com.kobadger.free-claude-code'

/* ---------- autostart rendering (shared by --dry-run / --print-autostart) ---------- */
const FCC_ENV_DIR = path.join(os.homedir(), '.fcc')
const renderAutostart = which => {
  const kind = autostartKind()
  const isFcc = which === 'fcc'
  if (kind === 'launchd') {
    return isFcc
      ? launchdPlist(FCC_LABEL, [fccServerBin()], FCC_ENV_DIR, path.join(FCC_ENV_DIR, 'server.out.log'))
      : launchdPlist(GATEWAY_LABEL, [NODE_BIN, ...gatewayArgs()], DATA_DIR, path.join(DATA_DIR, 'service.out.log'))
  }
  if (kind === 'systemd') {
    return isFcc
      ? systemdUnit('free-claude-code (FCC) — OpenRouter :free + local Ollama', [fccServerBin()], FCC_ENV_DIR)
      : systemdUnit('Free Model Gateway (OFM) — keyless free frontier models for OpenCode', [NODE_BIN, ...gatewayArgs()], DATA_DIR)
  }
  return `# ${kind}: Startup-folder shortcut (${isFcc ? 'FCCServer' : 'FreeModelGateway'}.lnk)\n`
}

/* ---------- --print-autostart: dump one unit/plist to stdout, exit ----------
 * This runs before preflight on purpose: stdout must carry the service
 * definition and nothing else, so the output can be redirected straight into a
 * file (the CI jobs do exactly that). */
if (PRINT_AUTOSTART) {
  process.stdout.write(renderAutostart(PRINT_AUTOSTART === 'fcc' ? 'fcc' : 'gateway'))
  process.exit(0)
}

/* ---------- 1. preflight ---------- */
step('preflight')
if (nodeMajor < 22 || (nodeMajor === 22 && minor < 19)) warn(`node ${process.versions.node} found; the OFM gateway targets node ^22.19 || >=24`)
else ok(`node ${process.versions.node}`)
if (!tryCommand('git', ['--version'])) die('git is required (used to fetch the gateway sources and sync model rosters)')
ok('git found')
if (tryCommand('bun', ['--version'])) ok('bun found (fast free-lane transport)')
else warn('bun not found — the free lane falls back to node transport (slower but works). Install bun from https://bun.sh if you want it.')

/* ---------- dry run: print the plan, change nothing ---------- */
if (DRY_RUN) {
  const kind = autostartKind()
  console.log('\n== dry run (no changes will be made)')
  console.log(`   platform:     ${process.platform} (${process.arch})`)
  console.log(`   node:         ${process.version} (${NODE_BIN})`)
  console.log(`   install dir:  ${INSTALL_DIR}`)
  console.log(`   data dir:     ${DATA_DIR}`)
  console.log(`   gateway:      http://127.0.0.1:${PORT}`)
  console.log(`   opencode cfg: ${CONFIG}`)
  console.log(`   with fcc:     ${WITH_FCC}`)
  console.log(`   autostart:    ${kind}`)
  console.log(`\n-- gateway autostart definition --\n${renderAutostart('gateway')}`)
  if (WITH_FCC) console.log(`-- fcc autostart definition --\n${renderAutostart('fcc')}`)
  process.exit(0)
}

/* ---------- 2. fetch gateway sources ---------- */
step('gateway sources')
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

/* ---------- 6. autostart ---------- */
const createStartupShortcut = (name, shortcutArgs) => {
  const ps =
    `$s = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) '${name}.lnk'));` +
    ` $s.TargetPath = 'powershell.exe';` +
    ` $s.Arguments = '${shortcutArgs.replace(/'/g, "''")}';` +
    ` $s.WindowStyle = 7;` +
    ` $s.Save()`
  return run('powershell.exe', ['-NoProfile', '-Command', ps])
}

const installLaunchd = (label, argv, cwd, outLog) => {
  const dir = path.join(os.homedir(), 'Library', 'LaunchAgents')
  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(cwd, { recursive: true })
  const plistPath = path.join(dir, `${label}.plist`)
  fs.writeFileSync(plistPath, launchdPlist(label, argv, cwd, outLog), 'utf8')
  const uid = typeof process.getuid === 'function' ? process.getuid() : ''
  run('launchctl', ['bootout', `gui/${uid}`, plistPath]) // idempotent re-install; empty first time
  if (run('launchctl', ['bootstrap', `gui/${uid}`, plistPath])) return plistPath
  if (run('launchctl', ['load', '-w', plistPath])) return plistPath // older macOS
  return null
}

const installSystemd = (unitName, description, argv, cwd) => {
  const dir = path.join(os.homedir(), '.config', 'systemd', 'user')
  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(cwd, { recursive: true })
  const unitPath = path.join(dir, `${unitName}.service`)
  fs.writeFileSync(unitPath, systemdUnit(description, argv, cwd), 'utf8')
  run('systemctl', ['--user', 'daemon-reload'])
  if (!run('systemctl', ['--user', 'enable', '--now', `${unitName}.service`])) return null
  // best-effort: keep it running across logout so it truly starts at boot
  try {
    const user = os.userInfo().username
    if (run('loginctl', ['enable-linger', user])) ok('enabled linger so the gateway starts at boot without a login session')
    else warn('could not enable linger (needs root) — the gateway will start at login instead')
  } catch { /* loginctl absent is fine */ }
  return unitPath
}

const autostartGateway = () => {
  const kind = autostartKind()
  if (kind === 'none') { step('autostart'); ok('skipped'); return }
  if (kind === 'startup') {
    step('autostart (Startup folder shortcut)')
    const starter = path.join(REPO_ROOT, 'start', 'gateway-start.ps1')
    const launcherArgs = `-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${starter}" -RepoDir "${INSTALL_DIR}" -Port ${PORT} -DataDir "${DATA_DIR}"`
    if (createStartupShortcut('FreeModelGateway', launcherArgs)) ok('Startup\\FreeModelGateway.lnk created (hidden at logon, idempotent)')
    else warn('could not create the startup shortcut — autostart skipped (gateway still runs manually)')
  } else if (kind === 'launchd') {
    step('autostart (launchd LaunchAgent)')
    const p = installLaunchd(GATEWAY_LABEL, [NODE_BIN, ...gatewayArgs()], DATA_DIR, path.join(DATA_DIR, 'service.out.log'))
    if (p) ok(`installed ${p} (RunAtLoad + KeepAlive; idempotent)`)
    else warn(`launchctl refused — load manually: launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/${GATEWAY_LABEL}.plist`)
  } else if (kind === 'systemd') {
    step('autostart (systemd user unit)')
    const p = installSystemd('free-model-gateway', 'Free Model Gateway (OFM) — keyless free frontier models for OpenCode', [NODE_BIN, ...gatewayArgs()], DATA_DIR)
    if (p) ok(`installed ${p} (enabled at login)`)
    else warn('systemd --user not usable here — run start/gateway-start.sh at login instead')
  } else {
    warn(`unknown autostart kind "${kind}" — skipped (want startup|launchd|systemd|none)`)
  }
}
autostartGateway()

/* ---------- 7. optional FCC ---------- */
function fccServerBin() {
  const exe = process.platform === 'win32' ? 'fcc-server.exe' : 'fcc-server'
  return path.join(os.homedir(), '.local', 'bin', exe)
}

if (WITH_FCC) {
  step('free-claude-code (FCC)')
  const fccBinPath = fccServerBin()

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
  const fccEnvDir = FCC_ENV_DIR
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

  const kind = autostartKind()
  if (kind === 'startup') {
    const launcherArgs = `-NoProfile -WindowStyle Hidden -Command Start-Process -FilePath "${fccBinPath}" -WorkingDirectory "${fccEnvDir}" -WindowStyle Hidden`
    if (createStartupShortcut('FCCServer', launcherArgs)) ok('Startup\\FCCServer.lnk created')
    else warn('could not create the FCC startup shortcut (FCC still runs manually)')
  } else if (kind === 'launchd') {
    const p = installLaunchd(FCC_LABEL, [fccBinPath], fccEnvDir, path.join(fccEnvDir, 'server.out.log'))
    if (p) ok(`installed ${p} (FCC autostarts at login)`)
    else warn('launchctl refused the FCC agent (FCC still runs manually)')
  } else if (kind === 'systemd') {
    const p = installSystemd('free-claude-code', 'free-claude-code (FCC) — OpenRouter :free + local Ollama', [fccBinPath], fccEnvDir)
    if (p) ok(`installed ${p} (FCC enabled at login)`)
    else warn('systemd --user not usable for FCC (FCC still runs manually)')
  }
}

/* ---------- done ---------- */
console.log(`
================================================================
 free-model-bridge is set up.
   gateway:   http://127.0.0.1:${PORT}          (00-free provider in OpenCode)
   dashboard: http://127.0.0.1:${PORT}           (login token in service.out.log)
${WITH_FCC ? `   fcc:       ${FCC_PORTAL}/admin          (fcc provider in OpenCode)\n` : ''} Manual steps that need *you* (web UI, your accounts):
   - EAC lane: dashboard -> EAC -> GitHub sign-in + star the repo
   - account channels (LobsterAI/TRAE/Cline/...): dashboard -> Channels -> sign in
   - aggregate providers with your own API keys: dashboard -> Aggregate
 Optional env: OPENROUTER_API_KEY for FCC's keyed providers (open_router/free works without).
 Verify: node bin/bakeoff.mjs
================================================================`)
