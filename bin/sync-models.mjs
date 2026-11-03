#!/usr/bin/env node
/**
 * free-model-bridge sync — pull the live model roster from the Our Free Model
 * standalone gateway and regenerate the `ofm` provider entry in opencode.json.
 *
 * Catalog IDs are generated as `<NN>-<gateway-id>` (e.g. `01-deepseek-v4.1-flash-free`)
 * so OpenCode's ID-sorted catalog puts the curated order first: the gateway's
 * `modelID` keeps the real upstream id, so behavior is unchanged. Display names
 * carry the same `<NN> · ` prefix, so the order also holds if a surface sorts by name.
 *
 * Curated top-of-list order lives in PRIORITY below (edit to taste). Models not in
 * PRIORITY are appended in alphabetical order and keep counting from the last slot.
 *
 * Idempotent: preserves every other provider and unrelated settings. Writes a
 * timestamped backup next to the config on every run.
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

/* Curated order: index in this list decides the slot. Keep the heaviest hitters
   and today's free additions on top; anything unlisted falls in alphabetically. */
const PRIORITY = [
  'combo:recommended-free',
  'deepseek-v4.1-flash-free',
  'glm-5.3-flash-free',
  'mimo-v2.6-flash-free',
  'nemotron-3.5-super-vl-free',
  'nemotron-3.5-lightning-free',
  'kilo-auto/free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3.5-super-vl:free',
  'nvidia/nemotron-3.5-lightning:free',
  'thinkingmachines/inkling:free',
  'thinkingmachines/inkling-small:free',
  'dots-studio/dots-3-note-preview:free',
  'stealth/glyph-cluster',
  'recursive/flint-v1.0:free',
  'cohere/north-mini-code:free',
  'openrouter/free',
  'google/gemma-4-31b-it:free',
  'inclusionai/ling-3.1-flash-1019-free',
  'big-pickle',
  'beam-free',
  'reflection/beam-free',
  'flint-40b-free',
  'pulse-alpha-free',
  'liquid/lfm-2.5-2.6b:free',
  'xingchen-agi/xing4.0-29b-a4b:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'nvidia/nemotron-3.5-content-safety:free',
]

/* Friendly display names for the roster we know; unknown ids fall back to the raw id. */
const DISPLAY = {
  'combo:recommended-free': 'Auto · recommended-free combo',
  'deepseek-v4.1-flash-free': 'DeepSeek V4.1 Flash · free',
  'glm-5.3-flash-free': 'GLM 5.3 Flash · free',
  'mimo-v2.6-flash-free': 'MiMo V2.6 Flash · free (vision)',
  'nemotron-3.5-super-vl-free': 'Nemotron 3.5 Super VL · free (vision)',
  'nemotron-3.5-lightning-free': 'Nemotron 3.5 Lightning · free',
  'kilo-auto/free': 'Kilo Auto · free router',
  'nvidia/nemotron-3-ultra-550b-a55b:free': 'Nemotron 3 Ultra 550B · kilo',
  'nvidia/nemotron-3.5-super-vl:free': 'Nemotron 3.5 Super VL · kilo (vision)',
  'nvidia/nemotron-3.5-lightning:free': 'Nemotron 3.5 Lightning · kilo',
  'thinkingmachines/inkling:free': 'Inkling · kilo',
  'thinkingmachines/inkling-small:free': 'Inkling Small · kilo',
  'dots-studio/dots-3-note-preview:free': 'Dots3 Note Preview · kilo',
  'stealth/glyph-cluster': 'Glyph Cluster · kilo',
  'recursive/flint-v1.0:free': 'Flint 1.0 · kilo',
  'cohere/north-mini-code:free': 'North Mini Code · kilo',
  'openrouter/free': 'OpenRouter Free Router · kilo',
  'google/gemma-4-31b-it:free': 'Gemma 4 31B · kilo',
  'inclusionai/ling-3.1-flash-1019-free': 'Ling 3.1 Flash · kilo',
  'big-pickle': 'Big Pickle · free',
  'beam-free': 'Beam · free',
  'reflection/beam-free': 'Beam 1.0 · kilo',
  'flint-40b-free': 'Flint 40B · free',
  'pulse-alpha-free': 'Pulse Alpha · free',
  'liquid/lfm-2.5-2.6b:free': 'LFM2.5 2.6B · kilo',
  'xingchen-agi/xing4.0-29b-a4b:free': 'Xing4.0 29B · kilo',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free': 'Nemotron 3 Nano Omni · kilo',
  'nvidia/nemotron-3.5-content-safety:free': 'Nemotron 3.5 Content Safety · kilo',
}

const key = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'settings.json'), 'utf8')).forwardKey
if (typeof key !== 'string' || key.length < 8) throw new Error(`forwardKey missing in ${DATA_DIR}/settings.json`)

const res = await fetch(`http://127.0.0.1:${PORT}/v1/models`, { headers: { Authorization: `Bearer ${key}` } })
if (!res.ok) throw new Error(`gateway /v1/models: HTTP ${res.status}`)
const list = (await res.json()).data

const rank = id => {
  const i = PRIORITY.indexOf(id)
  return i === -1 ? PRIORITY.length : i
}
const ordered = [...list].sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id))

const vision = id => /vl|vision|image/i.test(id)
const models = {}
let slot = 0
for (const m of ordered) {
  const nn = String(slot++).padStart(2, '0')
  const label = DISPLAY[m.id] ?? m.id
  models[`${nn}-${m.id}`] = {
    name: `${nn} · ${label}`,
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

/* policies: V2 top-level form. `experimental.policies` is deprecated (still merged by
   OpenCode) — migrate any existing entries and drop the old key. */
const legacy = cfg.experimental?.policies
if (Array.isArray(legacy) && legacy.length) {
  cfg.policies = [...(cfg.policies ?? [])]
  for (const p of legacy) {
    if (!cfg.policies.some(q => q.action === p.action && q.resource === p.resource && q.effect === p.effect)) cfg.policies.push(p)
  }
  delete cfg.experimental.policies
}
cfg.policies ??= []
if (!cfg.policies.some(p => p.action === 'provider.use' && p.resource === 'ofm' && p.effect === 'allow')) {
  cfg.policies.push({ action: 'provider.use', resource: 'ofm', effect: 'allow' })
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
