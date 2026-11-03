#!/usr/bin/env node
/**
 * free-model-bridge verify — one-shot health check for the whole stack.
 *
 * The free-model provider is found by its baseURL (127.0.0.1:18900), not by a
 * hardcoded key, so it works whether you call it `ofm` or `00-free`.
 *
 * Usage: node bin/verify-stack.mjs [--port <n>]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)
const opt = n => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : undefined
}
const PORT = Number(opt('--port') ?? 18900)

const R = []
const add = (ok, label, detail = '') => R.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)

const dataDir = process.env.OFM_HOME ?? path.join(os.homedir(), '.our-free-model')
const cfgPath = path.join(os.homedir(), '.config', 'opencode', 'opencode.json')
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
const key = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')).forwardKey

const j = async (url, opts) => {
  const r = await fetch(url, opts)
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)
  return r.json()
}

// 1. gateway health + management
const health = await fetch(`http://127.0.0.1:${PORT}/health`).then(r => r.ok).catch(() => false)
add(health, 'gateway /health answers')
const sum = await j(`http://127.0.0.1:${PORT}/api/management/summary`, { headers: { Authorization: `Bearer ${key}` } }).catch(() => null)
add(!!sum, 'management API accepts forwardKey')
add(sum?.settings?.standaloneLanEnabled === false, 'LAN relay disabled (loopback only)')
add(sum?.catalog?.length > 0, 'catalog listed', `${sum?.catalog?.length} models`)
add(sum?.capabilities?.kilo === true, 'kilo capability present')
add(sum?.eacAuth?.available === true, 'EAC available upstream')
console.log(`INFO  EAC authorized: ${sum?.eacAuth?.authorized}  channels: ${sum?.channels?.state}`)

// 2. live roster vs config
const models = await j(`http://127.0.0.1:${PORT}/v1/models`, { headers: { Authorization: `Bearer ${key}` } }).then(r => r.data).catch(() => [])
add(Array.isArray(models) && models.length >= 20, '/v1/models roster', `${models.length} ids`)

const [provKey, prov] = Object.entries(cfg.providers ?? {}).find(([, p]) => p?.settings?.baseURL?.includes(`:${PORT}`)) ?? []
add(!!prov, 'free-model provider present in opencode.json', provKey ?? 'missing')
add(prov?.settings?.apiKey === key, 'provider apiKey matches current forwardKey')
add(prov?.settings?.baseURL === `http://127.0.0.1:${PORT}/v1`, 'provider baseURL', prov?.settings?.baseURL)
const entries = Object.entries(prov?.models ?? {})
add(entries.length >= 25, 'models embedded in provider', `${entries.length}`)
const missing = models.map(m => m.id).filter(id => !Object.values(prov?.models ?? {}).some(m => m.modelID === id))
add(missing.length === 0, 'every live model present in config', missing.length ? missing.join(',') : 'none missing')
add(entries.every(([, m]) => /\bmodelID\b/.test(JSON.stringify(m))), 'modelID mapping preserved')
add(entries.some(([, m]) => / — /.test(m.name ?? '')), 'role tags present in display names')
add(/^\d/.test(provKey ?? 'x'), 'provider id sorts first (starts with a digit)', provKey)

// 3. fcc provider (optional)
const fcc = cfg.providers?.fcc
add(!!fcc, 'provider fcc present')
const fccUp = await fetch('http://127.0.0.1:8082/admin/api/status').then(r => r.ok).catch(() => false)
add(fccUp, 'fcc admin API reachable')

// 4. policies (V2 top-level form)
const pol = cfg.policies ?? []
add(pol.some(p => p.action === 'provider.use' && p.resource === provKey && p.effect === 'allow'), `policy allow ${provKey}`)
add(pol.some(p => p.action === 'provider.use' && p.resource === 'fcc' && p.effect === 'allow'), 'policy allow fcc')
add(!cfg.experimental?.policies, 'deprecated experimental.policies removed')

// 5. live chat through the gateway (cheap single request)
const chat = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}` },
  body: JSON.stringify({ model: 'kilo-auto/free', max_tokens: 256, stream: false, messages: [{ role: 'user', content: 'Reply with exactly: OK' }] }),
}).then(r => r.json()).catch(e => ({ error: e.message }))
const txt = chat?.choices?.[0]?.message?.content ?? ''
add(/\bOK\b/.test(txt), 'live chat through gateway (kilo-auto/free)', JSON.stringify(txt).slice(0, 40))

console.log('\n' + R.join('\n'))
const failed = R.filter(l => l.startsWith('FAIL')).length
console.log(`\n${R.length - failed}/${R.length} checks passed`)
process.exit(failed ? 1 : 0)
