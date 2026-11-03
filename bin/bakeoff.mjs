#!/usr/bin/env node
/**
 * ofm-bridge bakeoff — run the same prompts through every configured free lane
 * and score latency, token overhead and correctness on one screen.
 *
 * Lanes:
 *   ofm   – Our Free Model gateway  http://127.0.0.1:18900  (OpenAI surface)
 *   fcc   – free-claude-code        http://127.0.0.1:8082   (Anthropic surface)
 *   r9    – 9router                 http://127.0.0.1:20128  (OpenAI surface)
 *
 * Usage: node bin/bakeoff.mjs [--max-tokens 256]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const MAX_TOKENS = Number(process.argv[process.argv.indexOf('--max-tokens') + 1] ?? 256)
const DATA_DIR = process.env.OFM_HOME ?? path.join(os.homedir(), '.our-free-model')
const OFM_KEY = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'settings.json'), 'utf8')).forwardKey
const R9_KEY = process.env.NINEROUTER_API_KEY ? `Bearer ${process.env.NINEROUTER_API_KEY}` : null

const PROMPTS = [
  { id: 'exact', ask: 'Reply with exactly: PONG', check: t => /\bPONG\b/.test((t ?? '').trim()) },
  { id: 'math', ask: 'What is 37 * 94? Answer with the number only.', check: t => (t ?? '').includes('3478') },
  { id: 'sort', ask: 'Given [3,1,2], output the sorted list as a JSON array only.', check: t => (t ?? '').includes('[1,2,3]') || (t ?? '').includes('[1, 2, 3]') },
]

const LANES = [
  { id: 'ofm', model: 'deepseek-v4.1-flash-free', url: 'http://127.0.0.1:18900/v1/chat/completions', headers: { Authorization: `Bearer ${OFM_KEY}` }, anthropic: false },
  { id: 'ofm-combo', model: 'combo:recommended-free', url: 'http://127.0.0.1:18900/v1/chat/completions', headers: { Authorization: `Bearer ${OFM_KEY}` }, anthropic: false },
  { id: 'fcc', model: 'open_router/nvidia/nemotron-3-ultra-550b-a55b:free', url: 'http://127.0.0.1:8082/v1/messages', headers: {}, anthropic: true },
  ...(R9_KEY ? [{ id: 'r9', model: 'kgw/kilo-auto/free', url: 'http://127.0.0.1:20128/v1/chat/completions', headers: { Authorization: R9_KEY }, anthropic: false }] : []),
]

const callOnce = async (prompt, max_tokens) => {
  const req = prompt.anthropic
    ? { model: prompt.model, max_tokens, messages: [{ role: 'user', content: prompt.ask }] }
    : { model: prompt.model, max_tokens, stream: false, messages: [{ role: 'user', content: prompt.ask }] }
  const t0 = performance.now()
  const res = await fetch(prompt.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...prompt.headers },
    body: JSON.stringify(req),
  })
  const ms = Math.round(performance.now() - t0)
  if (!res.ok) return { ms, error: `HTTP ${res.status}` }
  const data = await res.json()
  const text = prompt.anthropic
    ? (data.content ?? []).filter(b => b.type === 'text').map(b => b.text).join(' ')
    : (data.choices ?? [{}])[0]?.message?.content ?? ''
  const tokens = prompt.anthropic ? (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0) : data.usage?.total_tokens ?? 0
  return { ms, text, tokens }
}

const rows = []
for (const lane of LANES) {
  for (const pr of PROMPTS) {
    const target = { ...lane, ...pr }
    try {
      const r = await callOnce(target, MAX_TOKENS)
      const ok = r.error ? null : pr.check(r.text)
      rows.push({ lane: lane.id, model: lane.model, prompt: pr.id, ms: r.ms, tokens: r.tokens, ok, text: (r.text ?? '').replace(/\s+/g, ' ').slice(0, 40), error: r.error })
      console.log(`${ok === true ? 'PASS' : ok === false ? 'FAIL' : 'ERRO'} ${lane.id.padEnd(9)} ${pr.id.padEnd(6)} ${String(r.ms).padStart(6)}ms ${String(r.tokens).padStart(6)}tok ${ok === true ? 'Y' : ok === false ? 'n' : '-'} ${r.error ?? ''}`)
    } catch (e) {
      rows.push({ lane: lane.id, model: lane.model, prompt: pr.id, error: e.message.slice(0, 80) })
      console.log(`ERRO ${lane.id.padEnd(9)} ${pr.id.padEnd(6)} ${e.message.slice(0, 80)}`)
    }
  }
}

const byLane = {}
for (const r of rows) (byLane[r.lane] ??= []).push(r)
console.log('\n=== summary ===')
for (const [lane, rs] of Object.entries(byLane)) {
  const passed = rs.filter(r => r.ok === true).length
  const avg = Math.round(rs.filter(r => r.ms).reduce((a, r) => a + r.ms, 0) / Math.max(1, rs.filter(r => r.ms).length))
  console.log(`${lane.padEnd(9)} ${passed}/${rs.length} pass  avg ${avg}ms`)
}
