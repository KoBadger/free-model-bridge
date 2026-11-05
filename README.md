# free-model-bridge

**Free frontier models inside [OpenCode](https://opencode.ai) — one command, no code changes, no admin rights.**

This repo does not reimplement any gateway. It is the missing glue between OpenCode and the two best local free-model gateways, plus a small measurement harness to keep everyone honest:

| Piece | What it gives you | Surface | Auth |
|---|---|---|---|
| [Our Free Model (OFM)](https://github.com/Ebony-Vinyl/dsh-our-free-model) standalone gateway | Keyless **free lane** (OpenCode Zen frontier models), the live **Kilo** keyless pool, **combo** fallback chains, thinking-effort ladder, plus optional lanes unlocked in its dashboard | OpenAI (`/v1/chat/completions`, `/v1/responses`) + Anthropic (`/v1/messages`) on `127.0.0.1:18900` | none for free/Kilo lanes |
| [free-claude-code (FCC)](https://github.com/Alishahryar1/free-claude-code) | **OpenRouter `:free`** models + your local **Ollama** models through a clean Anthropic-Messages API | Anthropic (`/v1/messages`) on `127.0.0.1:8082` | none (`open_router/free`); optional `OPENROUTER_API_KEY` |
| this repo (`free-model-bridge`) | `npm run setup`, model-roster sync, provider wiring, startup shortcuts, **bake-off** harness | — | — |

Both gateways run on your machine, bind to loopback only, and expose models as ordinary OpenCode providers. Nothing here proxies your keys to anyone.

```
OpenCode ──(provider ofm)──▶ 127.0.0.1:18900 ──▶ OFM standalone gateway
                                │   ├─ free lane       opencode.ai/inference/v1/* (Bearer public, minted session ids)
                                │   ├─ kilo lane       Kilo isFree pool (live roster)
                                │   ├─ combo router    named fallback chains → combo:<name> virtual models
                                │   ├─ EAC lane        dashboard: GitHub sign-in + star (co-paid models)
                                │   ├─ account lanes   LobsterAI/Qoder/TRAE/Cline/... (dashboard OAuth)
                                │   └─ aggregate       76 providers with your own keys (dashboard)
                                │
OpenCode ──(provider fcc)──▶ 127.0.0.1:8082 ──▶ free-claude-code
                                    ├─ OpenRouter :free models (incl. open_router/free router id)
                                    └─ local Ollama models
```

## Quick start (Windows 10/11; macOS/Linux notes inline)

Prereqs: **Node ≥ 22.19** (or ≥ 24), **git**. Optional: **Bun** (faster free-lane transport; Node fallback works), **Python 3.14 + uv** only if you want FCC.

```powershell
git clone https://github.com/KoBadger/free-model-bridge
cd free-model-bridge
npm run setup            # add -- --with-fcc to also install free-claude-code
```

That single command:

1. checks node/git/bun,
2. shallow-clones the OFM gateway into `~/Apps/our-free-model` (macOS/Linux: `~/our-free-model`),
3. starts it on `127.0.0.1:18900` if it isn't already up and waits for `/health`,
4. creates `~/.config/opencode/opencode.json` if you don't have one (never touching an existing one without a timestamped backup),
5. generates the **`00-free` provider** with the *live* model roster + the policy-allow entry OpenCode's default-deny policies require,
6. creates a Startup-folder shortcut so the gateway comes back after reboot (no admin; idempotent — it exits if the service already answers). macOS/Linux: prints a systemd user-unit line instead.
7. with `--with-fcc`: installs `free-claude-code` via uv (it fetches Python 3.14.10 itself), **pins `HOST=127.0.0.1` in `~/.fcc/.env`** — the default `0.0.0.0` is LAN-exposed with no auth, so never skip this — starts it, wires the **`fcc` provider**, and creates its startup shortcut.

Then just restart nothing — OpenCode hot-reloads config. Pick models from the `00-free` and `fcc` providers.

### After setup: unlock the rest (in the OFM dashboard)

Open `http://127.0.0.1:18900` (login token is printed in `service.out.log`). These lanes need *your* accounts, which is why setup can't do them:
- **EAC lane** — GitHub sign-in + starring (server-side verified). Co-paid frontier models, `EAC`-prefixed.
- **Account channels** — sign in per channel: LobsterAI, Qoder, TRAE, Cline, Loomy, Raccoon, MiniMax Code, ZCode, Gemini, Kilo.
- **Aggregate lane** — paste your own API keys for 76 providers (OpenRouter, NVIDIA NIM, Groq, Cerebras, Gemini, Bedrock, Vertex, ...). Keys stay in a `0600` `settings.json`.

## Daily ops

| Task | Command |
|---|---|
| Refresh OpenCode's model roster from the live gateway (rebuilds the curated `00-…` ordering) | `npm run sync` |
| Regenerate the model guide (HTML + field notes + PDF) from that same live roster | `npm run guide` |
| Full stack health check | `npm run verify` |
| Re-run setup safely (idempotent) | `npm run setup` |
| Compare lanes: latency + tokens + correctness scorecard | `npm run bakeoff` |
| Dashboard | `http://127.0.0.1:18900` |
| FCC admin | `http://127.0.0.1:8082/admin` |

OpenCode reads `opencode.json` changes live — no restart needed (`/reload` if you're impatient). Every provider write creates `opencode.json.bak-<provider>-<timestamp>` before touching anything.

### Free models at the very top of the list

OpenCode V2 has **no favorite/pin field**, and its catalog sorts providers alphabetically, then models by id. So `npm run sync` uses two levers:

1. **Provider id `00-free`** — digits sort before letters, so the free-model group is the *first* thing in the model list (verified live: `00-free/00-combo:recommended-free` is entry 1 of 367). Display name: `00 · Free Models (keyless)`. If you prefer the old `ofm` key, run `npm run sync -- --provider ofm` — but it drops back to mid-list, which is the whole problem.
2. **Catalog ids `<NN>-<gateway-id>`** — e.g. `00-free/01-deepseek-v4.1-flash-free`, numbered `00`, `01`, … in curated order. The real upstream id lives in `modelID`, so behavior is unchanged.

And because V2 has no per-model description field, **the description rides in the display name**: every entry carries a one-line role tag —

```
01 · DeepSeek V4.1 Flash — free · all-round, 1M ctx / 384k out
15 · North Mini Code     — kilo · coding, refactors, review
```

Three knobs in `bin/sync-models.mjs`: `PRIORITY` (order), `DISPLAY` (name), `TAGS` (the role hint). Models not listed append alphabetically at the bottom, so nothing is ever lost.

### Model notes & guide

- [`docs/models.md`](docs/models.md) — a short field note per model: what it excels at, what to use it for, and what to watch.
- [`docs/model-guide.pdf`](docs/model-guide.pdf) — the same, plus a ranked table with context/output/vision at a glance, a pick-by-task cheat sheet, the measured latency table, and two extra sections: **where all of this came from** (the real upstreams, how the lanes authenticate, security posture) and **how to get it running from this repo** (what `npm run setup` does, step by step).

Both are **generated from the live roster** — after any upstream change:

```powershell
npm run sync    # refresh the OpenCode provider
npm run guide   # regenerate docs/model-guide.html, docs/models.md and the PDF
```

The static sections live in `docs/guide-template.html`; curated per-model notes (name, specialty, field note, longer markdown note) live in `bin/guide-notes.mjs`, and the "pick by task" table drops retired models automatically. New upstream models get a clearly marked fallback note until you add a curated one.

## What you actually get

**22 models observed live on 2026-11-04** (roster is real-time and churns daily; `npm run sync` refreshes). In OpenCode each one is exposed as `<NN>-<id>` in curated order — `00-free/01-deepseek-v4.1-flash-free`, `00-free/07-nvidia/nemotron-3-ultra-550b-a55b:free`, … — while `modelID` keeps the raw id below. The current, always-up-to-date list with descriptions is in [`docs/models.md`](docs/models.md).

- **Free lane (keyless):** `deepseek-v4.1-flash-free` (1M ctx, 384k out), `glm-5.3-flash-free`, `mimo-v2.6-flash-free` (vision), `nemotron-3.5-super-vl-free` (vision), `nemotron-3.5-lightning-free`, `big-pickle`, `beam-free`, `flint-40b-free`, `pulse-alpha-free`, `crouton-alpha-free` (new alpha).
- **Kilo pool (keyless):** `kilo-auto/free`, `nvidia/nemotron-3-ultra-550b-a55b:free`, `nvidia/nemotron-3.5-super-vl:free`, `nvidia/nemotron-3.5-lightning:free`, `reflection/beam-free`, `stealth/glyph-cluster`, `stealth/crouton-alpha` (new alpha), `dots-studio/dots-3-note-preview:free` (512k in / 460k out), `cohere/north-mini-code:free`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`, `openrouter/free`.
- **FCC:** 14 OpenRouter `:free` ids (incl. `open_router/openrouter/free`) + any local Ollama models you have; 359-model catalog if you add keys.
- **Combos:** fallback/round-robin chains exposed as virtual models (`combo:recommended-free` out of the box).

**Features beyond a model list:**
- Three wire formats at the gateway: OpenAI Chat, OpenAI Responses, Anthropic Messages — so any client, not just OpenCode, can use it.
- Thinking-effort menu / budget ladder per model (Light/Balanced/Deep budgets, doubled for models that can't stop reasoning).
- Fail-over logic that distinguishes "hit quota before speaking" (fail over) from "revised its thinking" (don't).
- Body-sniffing stream handling — servers that lie about `Content-Type` still stream.
- OFM's token-saver stack (compacts huge tool outputs upstream), usage dashboard (17-week heatmap, TTFT, speed — all local), request log, egress-IP readout.

## Bake-off: measured, not vibes

`npm run bakeoff` runs three fixed tasks (exact reply, arithmetic, sorting — each checked mechanically) through every lane and prints a scorecard. Two runs on 2026-11-03, all 24 requests passing (`12/12 PASS` each). Latency across runs, lowest and highest observed:

| Lane | Model | avg latency | pass | prompt overhead |
|---|---|---|---|---|
| 00-free (combo) | `combo:recommended-free` | **1.0–2.5 s** | 3/3 | ~5.9k tok (Zen lane injection) |
| 00-free | `deepseek-v4.1-flash-free` | 1.2–1.4 s | 3/3 | ~5.9k tok |
| r9 (9router) | `kgw/kilo-auto/free` | 3.1–4.2 s | 3/3 | ~2k tok |
| fcc | `open_router/nvidia/nemotron-3-ultra-550b-a55b:free` | 2.2–5.1 s | 3/3 | **~22 tok** (no injection) |

Read the numbers, don't just admire the leftmost column: OFM/Zen lanes are fastest but spend ~6k prompt tokens on a hello-world because they present a full OpenCode client fingerprint upstream; Kilo lanes spend ~2k; FCC/OpenRouter is honest and lean (~22 tok) but slower per turn right now. For real coding sessions the up-front overhead amortizes — for tiny one-shots, FCC wins on cost profile.

## Troubleshooting

- **Gateway won't boot** → check `~/.our-free-model/service.err.log`; the setup script points you at it.
- **Key lost** → the API key lives in `~/.our-free-model/settings.json` as `forwardKey`; `npm run sync` re-embeds the current value into the OpenCode provider.
- **FCC answers empty text on small `max_tokens`** → thinking models eat the budget before emitting text (Anthropic wire format); give them headroom.
- **A model dies with 403/429 upstream** → free lanes shift; wait out the quota window or `npm run sync` after upstream updates. `combo:` models exist precisely for this.
- **Kilo lane privacy note** — Kilo prompts *may be logged upstream*. The free lane incidents are the price of keyless access; route anything sensitive through your own aggregate keys instead.
- **No admin rights needed anywhere** — autostart uses your Startup folder, not Task Scheduler.

## Honesty section (worth writing down)

- The free/Kilo lanes borrow quotas of other services by presenting their client fingerprints; that's how keyless access exists here. Respect rate limits, expect occasional breakage when upstream changes, and don't run this on anything sensitive.
- The bare `dsh-our-free-model` on npm **is not from the official author** — it's a third-party repackage with modified `index.js`/`client.js` and a `channel-login.js` that never existed upstream. Use the `@ebony-vinyl`-scoped package or clone the repo — `npm run setup` clones straight from GitHub here, guaranteeing provenance.
- This repo is **not affiliated** with OpenCode, DeepSeek, Ebony-Vinyl, or Alishahryar1. We ship zero lines of their code.

## Credits

- [Our Free Model](https://github.com/Ebony-Vinyl/dsh-our-free-model) (MIT) — the gateway and its lanes; token-saver ideas trace back to free-claude-code.
- [free-claude-code](https://github.com/Alishahryar1/free-claude-code) (AGPL-3.0) — installed at runtime via pip/uv, never bundled here; AGPL applies upstream, this repo doesn't distribute it.
- [OpenCode](https://opencode.ai) — the environment this wires into.
- [9router](https://github.com/decolua/9router) — evaluated in the bake-off as a third lane; left out of setup as optional infrastructure.

MIT license for this repo (see [LICENSE](LICENSE)).
