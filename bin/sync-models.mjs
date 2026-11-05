#!/usr/bin/env node
/**
 * free-model-bridge sync — pull the live model roster from the Our Free Model
 * standalone gateway and regenerate the `00-free` provider entry in opencode.json.
 *
 * The provider id is `00-free` (not `ofm`) on purpose: OpenCode's catalog sorts
 * providers alphabetically and V2 has no pin/favorite field, so a leading `00`
 * is the only way to hoist this group to the very top of the model list.
 * `--provider <id>` overrides it if you prefer the old `ofm` key.
 *
 * Catalog IDs are generated as `<NN>-<gateway-id>` (e.g. `01-deepseek-v4.1-flash-free`)
 * so OpenCode's ID-sorted catalog keeps the curated order inside the group: the
 * gateway's `modelID` keeps the real upstream id, so behavior is unchanged. Display
 * names carry the same `<NN> · ` prefix plus a one-line role tag, so the order and
 * the "what is this for" hint also hold on surfaces that sort or render by name.
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
const PROVIDER = opt('--provider') ?? '00-free'
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
  'crouton-alpha-free',
  'stealth/crouton-alpha',
]

/* Friendly model names; unknown ids fall back to the raw id. */
const DISPLAY = {
  'combo:recommended-free': 'Auto Combo',
  'deepseek-v4.1-flash-free': 'DeepSeek V4.1 Flash',
  'glm-5.3-flash-free': 'GLM 5.3 Flash',
  'mimo-v2.6-flash-free': 'MiMo V2.6 Flash',
  'nemotron-3.5-super-vl-free': 'Nemotron 3.5 Super VL',
  'nemotron-3.5-lightning-free': 'Nemotron 3.5 Lightning',
  'kilo-auto/free': 'Kilo Auto',
  'nvidia/nemotron-3-ultra-550b-a55b:free': 'Nemotron 3 Ultra 550B',
  'nvidia/nemotron-3.5-super-vl:free': 'Nemotron 3.5 Super VL (Kilo)',
  'nvidia/nemotron-3.5-lightning:free': 'Nemotron 3.5 Lightning (Kilo)',
  'thinkingmachines/inkling:free': 'Inkling',
  'thinkingmachines/inkling-small:free': 'Inkling Small',
  'dots-studio/dots-3-note-preview:free': 'Dots3 Note Preview',
  'stealth/glyph-cluster': 'Glyph Cluster',
  'recursive/flint-v1.0:free': 'Flint 1.0',
  'cohere/north-mini-code:free': 'North Mini Code',
  'openrouter/free': 'OpenRouter Free Router',
  'google/gemma-4-31b-it:free': 'Gemma 4 31B',
  'inclusionai/ling-3.1-flash-1019-free': 'Ling 3.1 Flash',
  'big-pickle': 'Big Pickle',
  'beam-free': 'Beam',
  'reflection/beam-free': 'Beam 1.0',
  'flint-40b-free': 'Flint 40B',
  'pulse-alpha-free': 'Pulse Alpha',
  'liquid/lfm-2.5-2.6b:free': 'LFM2.5 2.6B',
  'xingchen-agi/xing4.0-29b-a4b:free': 'Xing4.0 29B',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free': 'Nemotron 3 Nano Omni',
  'nvidia/nemotron-3.5-content-safety:free': 'Nemotron Content Safety',
  'crouton-alpha-free': 'Crouton Alpha',
  'stealth/crouton-alpha': 'Crouton Alpha (Kilo)',
}

/* One-line "where it excels / what to use it for" hint, shown in the picker.
   V2 has no model description field, so this rides in the display name. */
const TAGS = {
  'combo:recommended-free': 'combo · failover, safest default',
  'deepseek-v4.1-flash-free': 'free · all-round, 1M ctx / 384k out',
  'glm-5.3-flash-free': 'free · fast multilingual + vision',
  'mimo-v2.6-flash-free': 'free · multimodal generalist',
  'nemotron-3.5-super-vl-free': 'free · vision: images, charts, OCR',
  'nemotron-3.5-lightning-free': 'free · fast chat, 128k ctx',
  'kilo-auto/free': 'kilo · task router, low overhead',
  'nvidia/nemotron-3-ultra-550b-a55b:free': 'kilo · biggest brain, hard reasoning',
  'nvidia/nemotron-3.5-super-vl:free': 'kilo · vision workhorse, 1M ctx',
  'nvidia/nemotron-3.5-lightning:free': 'kilo · 1M ctx at speed',
  'thinkingmachines/inkling:free': 'kilo · agentic loops + vision',
  'thinkingmachines/inkling-small:free': 'kilo · cheap agentic loops',
  'dots-studio/dots-3-note-preview:free': 'kilo · doc-scale: 512k in, 460k out',
  'stealth/glyph-cluster': 'kilo · mass rewrites, 256k out',
  'recursive/flint-v1.0:free': 'kilo · long reasoning, 236k out',
  'cohere/north-mini-code:free': 'kilo · coding, refactors, review',
  'openrouter/free': 'kilo · variety across OR free pool',
  'google/gemma-4-31b-it:free': 'kilo · small vision, multilingual',
  'inclusionai/ling-3.1-flash-1019-free': 'kilo · 1M ctx, 262k out, cheap',
  'big-pickle': 'free · general chat + vision',
  'beam-free': 'free · mid-tier reasoning',
  'reflection/beam-free': 'kilo · 1M-context reasoning',
  'flint-40b-free': 'free · mid-tier reasoning',
  'pulse-alpha-free': 'free · experimental frontier preview',
  'liquid/lfm-2.5-2.6b:free': 'kilo · ultra-fast extraction/classify',
  'xingchen-agi/xing4.0-29b-a4b:free': 'kilo · bulk long-output generation',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free': 'kilo · small omni + vision',
  'nvidia/nemotron-3.5-content-safety:free': 'kilo · moderation/safety checks',
  'crouton-alpha-free': 'free · new alpha preview',
  'stealth/crouton-alpha': 'kilo · new alpha preview',
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
  const tag = TAGS[m.id]
  models[`${nn}-${m.id}`] = {
    name: `${nn} · ${label}${tag ? ` — ${tag}` : ''}`,
    modelID: m.id,
    limit: { context: m.context_window || 131072, output: 8192 },
    capabilities: { tools: true, input: vision(m.id) ? ['text', 'image'] : ['text'], output: ['text'] },
  }
}

const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
cfg.providers ??= {}
cfg.providers[PROVIDER] = {
  name: '00 · Free Models (keyless)',
  package: 'aisdk:@ai-sdk/openai-compatible',
  settings: { baseURL: `http://127.0.0.1:${PORT}/v1`, apiKey: key },
  models,
}

/* Renamed provider (was `ofm`): drop the old entry + its stale policy so the
   picker doesn't show the same 28 models twice. */
if (PROVIDER !== 'ofm' && cfg.providers.ofm) delete cfg.providers.ofm

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
if (PROVIDER !== 'ofm') cfg.policies = cfg.policies.filter(p => !(p.action === 'provider.use' && p.resource === 'ofm'))
if (!cfg.policies.some(p => p.action === 'provider.use' && p.resource === PROVIDER && p.effect === 'allow')) {
  cfg.policies.push({ action: 'provider.use', resource: PROVIDER, effect: 'allow' })
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
