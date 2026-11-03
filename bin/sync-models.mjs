#!/usr/bin/env node
/**
 * ofm-bridge sync — pull the live model roster from the Our Free Model
 * standalone gateway and regenerate the `ofm` provider entry in opencode.json.
 *
 * Idempotent: preserves every other provider, the policy list and unrelated
 * settings. Writes a timestamped backup next to the config on every run.
 *
 * Usage: node bin/sync-models.mjs [--dry-run] [--config <path>] [--port <n>]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)
const opt = name => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const DRY = args.includes('--dry-run')
const CONFIG = path.resolve(opt('--config') ?? path.join(os.homedir(), '.config', 'opencode', 'opencode.json'))
const PORT = Number(opt('--port') ?? 18900)
const DATA_DIR = process.env.OFM_HOME ?? path.join(os.homedir(), '.our-free-model')

const key = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'settings.json'), 'utf8')).forwardKey
if (typeof key !== 'string' || key.length < 8) throw new Error(`forwardKey missing in ${DATA_DIR}/settings.json`)

const res = await fetch(`http://127.0.0.1:${PORT}/v1/models`, { headers: { Authorization: `Bearer ${key}` } })
if (!res.ok) throw new Error(`gateway /v1/models: HTTP ${res.status}`)
const list = (await res.json()).data

const vision = id => /vl|vision|image/i.test(id)
const models = {}
for (const m of list) {
  models[m.id] = {
    name: m.id === 'combo:recommended-free' ? 'OFM Combo: recommended-free' : `${m.id} (OFM)`,
    modelID: m.id,
    limit: { context: m.context_window || 131072, output: 8192 },
    capabilities: { tools: true, input: vision(m.id) ? ['text', 'image'] : ['text'], output: ['text'] },
  }
}

const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
cfg.providers ??= {}
cfg.providers.ofm = {
  name: 'Our Free Model (local gateway)',
  package: 'aisdk:@ai-sdk/openai-compatible',
  settings: { baseURL: `http://127.0.0.1:${PORT}/v1`, apiKey: key },
  models,
}
cfg.experimental ??= {}
cfg.experimental.policies ??= []
if (!cfg.experimental.policies.some(p => p.action === 'provider.use' && p.resource === 'ofm' && p.effect === 'allow')) {
  cfg.experimental.policies.push({ action: 'provider.use', resource: 'ofm', effect: 'allow' })
}

if (DRY) {
  console.log(`dry-run: ${Object.keys(models).length} models; no writes`)
} else {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const bak = CONFIG.replace(/\.json$/, `.json.bak-ofm-${stamp}`)
  fs.copyFileSync(CONFIG, bak)
  fs.writeFileSync(CONFIG, JSON.stringify(cfg), 'utf8')
  JSON.parse(fs.readFileSync(CONFIG, 'utf8')) // round-trip check
  console.log(`synced ${Object.keys(models).length} models -> ${CONFIG}`)
  console.log(`backup: ${bak}`)
}
console.log(`models: ${Object.keys(models).join(', ')}`)
