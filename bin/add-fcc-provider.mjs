#!/usr/bin/env node
/** Add free-claude-code (fcc) as an Anthropic-compatible provider in opencode.json. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CONFIG = path.join(os.homedir(), '.config', 'opencode', 'opencode.json')

const res = await fetch('http://127.0.0.1:8082/admin/api/models')
if (!res.ok) throw new Error(`fcc /admin/api/models: HTTP ${res.status}`)
const ids = (await res.json()).models

const wanted = ids.filter(id => /:free|\/free$/.test(id) || /^ollama\//.test(id))
const models = {}
for (const id of wanted) {
  models[id] = {
    name: `${id} (FCC)`,
    modelID: id,
    limit: { context: 131072, output: 8192 },
    capabilities: { tools: true, input: /vl|vision/i.test(id) ? ['text', 'image'] : ['text'], output: ['text'] },
  }
}

const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
cfg.providers ??= {}
cfg.providers.fcc = {
  name: 'free-claude-code (local)',
  package: 'aisdk:@ai-sdk/anthropic',
  settings: { baseURL: 'http://127.0.0.1:8082', apiKey: 'fcc-local' },
  models,
}
// policies: V2 top-level form (experimental.policies is deprecated)
const legacy = cfg.experimental?.policies
if (Array.isArray(legacy) && legacy.length) {
  cfg.policies = [...(cfg.policies ?? [])]
  for (const p of legacy) {
    if (!cfg.policies.some(q => q.action === p.action && q.resource === p.resource && q.effect === p.effect)) cfg.policies.push(p)
  }
  delete cfg.experimental.policies
}
cfg.policies ??= []
if (!cfg.policies.some(p => p.action === 'provider.use' && p.resource === 'fcc' && p.effect === 'allow')) {
  cfg.policies.push({ action: 'provider.use', resource: 'fcc', effect: 'allow' })
}

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const bak = CONFIG.replace(/\.json$/, `.json.bak-fcc-${stamp}`)
fs.copyFileSync(CONFIG, bak)
fs.writeFileSync(CONFIG, JSON.stringify(cfg), 'utf8')
JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
console.log(`fcc provider added with ${wanted.length} models; backup: ${bak}`)
