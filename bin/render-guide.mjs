#!/usr/bin/env node
/**
 * free-model-bridge guide — regenerate the model guide from the LIVE roster.
 *
 *   node bin/render-guide.mjs [--no-pdf] [--port <n>]
 *
 * Reads the current `00-free` provider order from opencode.json (run `npm run sync`
 * first), pulls capability metadata from the gateway's management catalog, and
 * re-emits docs/model-guide.html, docs/models.md and docs/model-guide.pdf.
 * Retired models simply vanish; new ones get a clearly marked fallback note until
 * bin/guide-notes.mjs learns about them.
 *
 * The static sections live in docs/guide-template.html (created on first run from
 * the current HTML). Model references inside static text use {{N:<model-id>}}
 * tokens, so nothing goes stale when the roster renumbers.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { NOTES, TASKS } from './guide-notes.mjs'

const args = process.argv.slice(2)
const opt = n => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : undefined
}
const PORT = Number(opt('--port') ?? 18900)
const WITH_PDF = !args.includes('--no-pdf')
const DOCS = path.resolve('docs')
const TEMPLATE = path.join(DOCS, 'guide-template.html')
const HTML_OUT = path.join(DOCS, 'model-guide.html')
const MD_OUT = path.join(DOCS, 'models.md')
const PDF_OUT = path.join(DOCS, 'model-guide.pdf')
const CONFIG = path.join(os.homedir(), '.config', 'opencode', 'opencode.json')
const DATA_DIR = process.env.OFM_HOME ?? path.join(os.homedir(), '.our-free-model')
const key = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'settings.json'), 'utf8')).forwardKey

const fmt = n => {
  if (!n) return '—'
  if (n >= 1000000) return `${Math.round((n / 1000000) * 10) / 10}M`.replace(/\.0M$/, 'M')
  return `${Math.floor(n / 1000)}k`
}
const esc = s => String(s).replace(/&(?![a-z]+;)/g, '&amp;').replace(/</g, '&lt;')

/* ---------- live data ---------- */
const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
const provider = Object.entries(cfg.providers ?? {}).find(([, p]) => p?.settings?.baseURL?.includes(`:${PORT}`))
if (!provider) throw new Error('no free-model provider in opencode.json — run npm run sync first')
const ordered = Object.entries(provider[1].models)

const summary = await fetch(`http://127.0.0.1:${PORT}/api/management/summary`, { headers: { Authorization: `Bearer ${key}` } })
if (!summary.ok) throw new Error(`management summary: HTTP ${summary.status}`)
const catalog = new Map((await summary.json()).catalog.map(m => [m.id, m]))

const live = ordered.map(([catalogKey, m]) => {
  const id = m.modelID
  const cat = catalog.get(id) ?? {}
  const nn = catalogKey.split('-')[0]
  const lane = cat.channel === 'combo' ? 'combo' : cat.channel === 'kilo' ? 'kilo' : 'free'
  return {
    id, nn, lane,
    name: NOTES[id]?.name ?? m.name?.replace(/^\d+ · /, '').split(' — ')[0] ?? id,
    ctx: fmt(cat.contextWindow ?? m.limit?.context),
    out: fmt(cat.maxOutput),
    vision: cat.vision ?? (m.capabilities?.input ?? []).includes('image'),
    specialty: NOTES[id]?.specialty ?? 'Newly appeared in the free pool — no curated note yet; test it with a real prompt.',
    note: NOTES[id]?.note ?? 'Newly appeared upstream. No curated field note yet — run a bake-off or a real prompt to see what it is good at.',
    md: NOTES[id]?.md ?? ['being a newly added free-pool model with no curated track record yet.', 'exploration and low-stakes tasks while you evaluate it.', 'no curated note yet — verify important outputs.'],
  }
})
const byId = new Map(live.map(m => [m.id, m]))
const COUNT = live.length
const LAST = String(COUNT - 1).padStart(2, '0')

/* ---------- generated fragments ---------- */
const ROSTER_ROWS = live.map(m => `
    <tr>
      <td class="num">${m.nn}</td>
      <td class="model">${m.name}<small>${m.id}</small></td>
      <td><span class="badge ${m.lane}">${m.lane}</span></td>
      <td class="dim">${m.ctx}</td><td class="dim">${m.out}</td><td class="${m.vision ? 'yes' : 'no'}">${m.vision ? '✓' : '—'}</td>
      <td>${m.specialty}</td>
    </tr>`).join('')

const FIELD_NOTES = live.map(m => `  <div class="fn"><b>${m.nn} · ${m.name}</b> <span class="lane">${m.lane}</span><br>${m.note}</div>`).join('\n')

const TASK_ROWS = TASKS.map(t => {
  const picks = t.ids.filter(id => byId.has(id)).map(id => `${byId.get(id).nn} ${byId.get(id).name}`)
  if (!picks.length) return ''
  const [first, ...rest] = picks
  return `    <tr><td><b>${t.need}</b></td><td>${first}${rest.length ? ', or ' + rest.join(', ') : ''}</td><td>${t.why}</td></tr>`
}).filter(Boolean).join('\n')

const LAT = [
  { id: 'combo:recommended-free', label: 'combo', obs: '1.0–2.5 s', oh: '~5.9k tok' },
  { id: 'deepseek-v4.1-flash-free', label: 'DeepSeek V4.1 Flash', obs: '1.2–1.4 s', oh: '~5.9k tok' },
  { id: 'kilo-auto/free', label: 'Kilo Auto', obs: '1.1 s (direct lane)', oh: '~2k tok' },
]
const LATENCY_ROWS = LAT.filter(l => byId.has(l.id)).map(l => `        <tr><td>${byId.get(l.id).nn} ${l.label}</td><td>${l.obs}</td><td>${l.oh}</td></tr>`).join('\n') +
  `\n        <tr><td>fcc / OpenRouter <code>:free</code></td><td>2.2–5.1 s</td><td>~22 tok</td></tr>`

/* ---------- template (created once, then owned by you) ---------- */
function ensureTemplate() {
  if (fs.existsSync(TEMPLATE)) return
  let t = fs.readFileSync(HTML_OUT, 'utf8')
  t = t.replace(/<tbody>[\s\S]*?<\/tbody>/, '<tbody>{{ROSTER_ROWS}}</tbody>')
  t = t.replace(/<div class="notes">[\s\S]*?<\/div>\s*(?=\n<h2>)/, '<div class="notes">{{FIELD_NOTES}}</div>\n')
  t = t.replace(/(<table class="avoid">\s*<thead>[\s\S]*?<\/thead>\s*)<tbody>[\s\S]*?<\/tbody>/, '$1<tbody>{{TASK_ROWS}}</tbody>')
  t = t.replace(/(<table>\s*<thead><tr><th>Lane<\/th>[\s\S]*?<\/thead>\s*)<tbody>[\s\S]*?<\/tbody>/, '$1<tbody>{{LATENCY_ROWS}}</tbody>')
  t = t.replace(/\d+ keyless models/, '{{COUNT}} keyless models')
  t = t.replace(/Ranked roster \(\d+ models\)/, 'Ranked roster ({{COUNT}} models)')
  t = t.replace(/A one-line question costs ~5\.9k tokens on the free lane — for cost-sensitive bulk work prefer[\s\S]*?or the <code>fcc<\/code> provider\./, 'A one-line question costs ~5.9k tokens on the free lane — for cost-sensitive bulk work prefer the utility-tier kilo models or the <code>fcc</code> provider.')
  const extra = fs.readFileSync(new URL('./guide-sections.html', import.meta.url), 'utf8')
  t = t.replace('<footer>', extra + '\n\n<footer>')
  fs.writeFileSync(TEMPLATE, t, 'utf8')
  console.log('created docs/guide-template.html (edit the static sections there)')
}

ensureTemplate()
let html = fs.readFileSync(TEMPLATE, 'utf8')
html = html
  .replace('{{ROSTER_ROWS}}', ROSTER_ROWS)
  .replace('{{FIELD_NOTES}}', FIELD_NOTES)
  .replace('{{TASK_ROWS}}', TASK_ROWS)
  .replace('{{LATENCY_ROWS}}', LATENCY_ROWS)
  .replaceAll('{{COUNT}}', String(COUNT))
  .replaceAll('{{DATE}}', new Date().toISOString().slice(0, 10))
html = html.replace(/\{\{N:([^}]+)\}\}/g, (_, id) => byId.get(id)?.nn ?? '—')
fs.writeFileSync(HTML_OUT, html, 'utf8')

/* ---------- models.md ---------- */
const md = `# Model notes — all ${COUNT} free models

Everything below is served by the local gateway with **no login and no API key**, exposed in OpenCode as provider **\`00-free\`**, in the order \`00\`–\`${LAST}\` (the number is the picker order). The same order, names and role tags are generated by \`npm run sync\`; the PDF version of this guide with the ranked table is [\`model-guide.pdf\`](model-guide.pdf). Regenerate both with \`npm run guide\` after the roster changes.

**Lanes.** \`free\` = OpenCode Zen free lane (frontier models; ~5.6–6.4k tokens of injected system prompt per request). \`kilo\` = Kilo AI's keyless *isFree* pool (~2k overhead; **prompts may be logged upstream**). \`combo\` = a local failover chain, not a model.

**On the ranking.** It's practical guidance — capability ceiling, context/output size and measured latency — not benchmark scores. Re-run \`npm run bakeoff\` for a fresh latency scorecard, and \`npm run sync\` when the upstream roster changes.

**Provenance and setup** are covered in sections 7 and 8 of the PDF.

---

${live.map(m => {
  const [excels, use, watch] = m.md
  return `## ${m.nn} · ${m.name} — \`${m.id}\`
\`${m.lane} lane · ${m.ctx} ctx · ${m.out} out${m.vision ? ' · vision' : ''}\`

**Excels at** ${excels}
**Use it for** ${use}${watch ? `\n**Watch** ${watch}` : ''}`
}).join('\n\n')}
`
fs.writeFileSync(MD_OUT, md, 'utf8')

/* ---------- pdf ---------- */
if (WITH_PDF) {
  const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p))
  if (edge) {
    const url = 'file:///' + HTML_OUT.replace(/\\/g, '/')
    const r = spawnSync(edge, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${PDF_OUT}`, url], { stdio: 'ignore' })
    console.log(r.status === 0 ? `pdf: ${PDF_OUT}` : 'pdf render returned non-zero (file may still be written)')
  } else console.log('no Edge/Chrome found — HTML written, render the PDF manually')
}
console.log(`guide regenerated: ${COUNT} models (00–${LAST}) -> docs/model-guide.html, docs/models.md${WITH_PDF ? ', docs/model-guide.pdf' : ''}`)
