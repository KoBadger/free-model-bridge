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
5. generates the **`ofm` provider** with the *live* model roster + the policy-allow entry OpenCode's default-deny policies require,
6. creates a Startup-folder shortcut so the gateway comes back after reboot (no admin; idempotent — it exits if the service already answers). macOS/Linux: prints a systemd user-unit line instead.
7. with `--with-fcc`: installs `free-claude-code` via uv (it fetches Python 3.14.10 itself), **pins `HOST=127.0.0.1` in `~/.fcc/.env`** — the default `0.0.0.0` is LAN-exposed with no auth, so never skip this — starts it, wires the **`fcc` provider**, and creates its startup shortcut.

Then just restart nothing — OpenCode hot-reloads config. Pick models from the `ofm` and `fcc` providers.

### After setup: unlock the rest (in the OFM dashboard)

Open `http://127.0.0.1:18900` (login token is printed in `service.out.log`). These lanes need *your* accounts, which is why setup can't do them:
- **EAC lane** — GitHub sign-in + starring (server-side verified). Co-paid frontier models, `EAC`-prefixed.
- **Account channels** — sign in per channel: LobsterAI, Qoder, TRAE, Cline, Loomy, Raccoon, MiniMax Code, ZCode, Gemini, Kilo.
- **Aggregate lane** — paste your own API keys for 76 providers (OpenRouter, NVIDIA NIM, Groq, Cerebras, Gemini, Bedrock, Vertex, ...). Keys stay in a `0600` `settings.json`.

## Daily ops

| Task | Command |
|---|---|
| Refresh OpenCode's model roster from the live gateway (upstream adds/retires models) | `npm run sync` |
| Re-run setup safely (idempotent) | `npm run setup` |
| Compare lanes: latency + tokens + correctness scorecard | `npm run bakeoff` |
| Dashboard | `http://127.0.0.1:18900` |
| FCC admin | `http://127.0.0.1:8082/admin` |

OpenCode reads `opencode.json` changes live — no restart needed (`/reload` if you're impatient). Every provider write creates `opencode.json.bak-<provider>-<timestamp>` before touching anything.

## What you actually get

**Models observed live on 2026-11-03** (roster is real-time; `npm run sync` refreshes):

- **Free lane (keyless):** `deepseek-v4.1-flash-free` (1M ctx), `glm-5.3-flash-free` (1M ctx), `mimo-v2.6-flash-free` (1M ctx, vision), `nemotron-3.5-super-vl-free` (1M ctx, vision), `nemotron-3.5-lightning-free`, `big-pickle`, `beam-free`, `flint-40b-free`, `pulse-alpha-free`, plus region-limited additions as they appear.
- **Kilo pool (keyless):** `kilo-auto/free`, `nvidia/nemotron-3-ultra-550b-a55b:free`, `nvidia/nemotron-3.5-lightning:free`, `thinkingmachines/inkling(-small):free`, `dots-studio/dots-3-note-preview:free`, `stealth/glyph-cluster`, `recursive/flint-v1.0:free`, `cohere/north-mini-code:free`, `google/gemma-4-31b-it:free`, `openrouter/free`, `inclusionai/ling-3.1-flash-1019-free`, and more.
- **FCC:** 14 OpenRouter `:free` ids (incl. `open_router/openrouter/free`) + any local Ollama models you have; 359-model catalog if you add keys.
- **Combos:** fallback/round-robin chains exposed as virtual models (`combo:recommended-free` out of the box).

**Features beyond a model list:**
- Three wire formats at the gateway: OpenAI Chat, OpenAI Responses, Anthropic Messages — so any client, not just OpenCode, can use it.
- Thinking-effort menu / budget ladder per model (Light/Balanced/Deep budgets, doubled for models that can't stop reasoning).
- Fail-over logic that distinguishes "hit quota before speaking" (fail over) from "revised its thinking" (don't).
- Body-sniffing stream handling — servers that lie about `Content-Type` still stream.
- OFM's token-saver stack (compacts huge tool outputs upstream), usage dashboard (17-week heatmap, TTFT, speed — all local), request log, egress-IP readout.

## Bake-off: measured, not vibes

`npm run bakeoff` runs three fixed tasks (exact reply, arithmetic, sorting — each checked mechanically) through every lane and prints a scorecard. Run from 2026-11-03, all 12 requests passing (`12/12 PASS`):

| Lane | Model | avg latency | pass | prompt overhead |
|---|---|---|---|---|
| ofm (combo) | `combo:recommended-free` | **0.98 s** | 3/3 | ~5.9k tok (Zen lane injection) |
| ofm | `deepseek-v4.1-flash-free` | 1.40 s | 3/3 | ~5.9k tok |
| r9 (9router) | `kgw/kilo-auto/free` | 3.13 s | 3/3 | ~2k tok |
| fcc | `open_router/nvidia/nemotron-3-ultra-550b-a55b:free` | 5.13 s | 3/3 | **~22 tok** (no injection) |

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
