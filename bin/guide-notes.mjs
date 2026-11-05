/**
 * Curated model knowledge for the guide generator. Keyed by the gateway's raw
 * model id. Entries for models that are temporarily retired upstream are kept —
 * if the id comes back, its notes come back with it.
 *
 *   name      display name used in the guide
 *   specialty one-line "specializes in" cell for the ranked table
 *   note      1–2 sentence field note for the PDF
 *   md        [excels, use, watch?] paragraphs for docs/models.md
 */
export const NOTES = {
  'combo:recommended-free': {
    name: 'Auto Combo',
    specialty: 'Safest default: falls over to the next free link if one dies before answering. Use when a specific model keeps 429ing.',
    note: 'Chains free links and only fails over when a link dies before producing content. For unattended jobs and a “just work” default.',
    md: ['never being the bottleneck: it chains several free links and only moves to the next one when a link fails *before producing any content*.', 'unattended or long jobs where a 429 mid-run shouldn\'t kill the session, and as the "don\'t make me think" default.', 'that you inherit the head link\'s latency and its prompt overhead.'],
  },
  'deepseek-v4.1-flash-free': {
    name: 'DeepSeek V4.1 Flash',
    specialty: 'All-round flagship. Strong reasoning and agentic coding, enormous output budget — the default daily driver.',
    note: 'All-round reasoning and coding with the biggest output budget here (384k). The main driver for real coding sessions and long writes.',
    md: ['broad competence — reasoning, coding, tool use — with the **largest output budget in the stack** (384k).', 'your main driver: real coding sessions, whole-file writes, long explanations, multi-step agent work.', 'the ~5.9k-token free-lane system prompt on tiny one-shots, and shared quota at busy hours.'],
  },
  'glm-5.3-flash-free': {
    name: 'GLM 5.3 Flash',
    specialty: 'Fast general reasoning, strong multilingual work, vision included — great second opinion to 01.',
    note: 'Fast, well-structured, strong multilingual coverage, vision. A second opinion, translations, quick screenshot reviews.',
    md: ['quick, well-structured reasoning with strong multilingual coverage and vision.', 'a second opinion on 01, translation and multilingual docs, and fast reviews of screenshots or diagrams.', 'that it\'s a flash-tier model: great judgment per second, less depth on very hard problems.'],
  },
  'mimo-v2.6-flash-free': {
    name: 'MiMo V2.6 Flash',
    specialty: 'Balanced multimodal generalist; smooth on mixed text + image conversations.',
    note: 'Balanced multimodal generalist. UI iteration, screenshot → notes, everyday image + text chat.',
    md: ['mixed text + image conversations at a balanced speed/quality point.', 'UI iteration, reading screenshots into notes, and everyday multimodal chat.', 'that it\'s a generalist — for dense charts lean on 04.'],
  },
  'nemotron-3.5-super-vl-free': {
    name: 'Nemotron 3.5 Super VL',
    specialty: 'Vision-language specialist: screenshots, UI review, charts, dense OCR-style reading.',
    note: 'Reads images carefully — charts, tables, UI, OCR-style extraction. Diagram → spec, screenshot → bug report.',
    md: ['actually *reading* images: dense charts, tables, UI screenshots, OCR-ish extraction.', '"what does this graph say", screenshot → bug report, diagram → spec, invoice/receipt parsing.', 'output length: it\'s a describer, not a novelist.'],
  },
  'nemotron-3.5-lightning-free': {
    name: 'Nemotron 3.5 Lightning',
    specialty: 'Latency-first reasoning; snappy chat and tight tool loops where 128k context is enough.',
    note: 'The quickest free-lane feel on short context. Quick chat, small edits, tight tool loops (128k cap).',
    md: ['response speed on short context — the quickest free-lane feel.', 'fast chat, small edits, tight tool loops, quick sanity checks.', 'the 128k context: long logs and whole-repo reads belong elsewhere.'],
  },
  'kilo-auto/free': {
    name: 'Kilo Auto',
    specialty: "Kilo's own task router across its free pool — good hands-off option, cheapest overhead on the Kilo side.",
    note: "Routes inside Kilo's free pool with the leanest Kilo overhead. Hands-off default; prompts may be logged upstream.",
    md: ['routing inside Kilo\'s free pool automatically, with the leanest Kilo-side overhead.', 'a hands-off default on the Kilo lane when you don\'t care which model answers.', 'that you get whichever model it picks — prompts may be logged upstream.'],
  },
  'nvidia/nemotron-3-ultra-550b-a55b:free': {
    name: 'Nemotron 3 Ultra 550B',
    specialty: 'Biggest brain in the stack: hardest reasoning, deep analysis, long research tasks.',
    note: 'The heaviest reasoning in the stack. Architecture calls, postmortems, hard debugging — slow, so not for churn.',
    md: ['the heaviest reasoning available here — planning, proofs, gnarly debugging.', 'architecture decisions, postmortems, hard algorithm work, "why is this test flaky" investigations.', 'latency: it\'s the slowest lane. Don\'t use it for bulk churn.'],
  },
  'nvidia/nemotron-3.5-super-vl:free': {
    name: 'Nemotron 3.5 Super VL (Kilo)',
    specialty: 'Vision workhorse with 1M context: diagram-to-code, screenshot debugging, chart extraction.',
    note: 'Same careful vision work without the Zen-lane prompt overhead. Image-heavy tasks when the free lane throttles.',
    md: ['the same careful vision work as 04, without the Zen-lane prompt overhead.', 'image-heavy work when the free lane is throttled, or when you\'re cost-sensitive about prompt tokens.', 'that Kilo\'s free pool can rotate models underneath the id.'],
  },
  'nvidia/nemotron-3.5-lightning:free': {
    name: 'Nemotron 3.5 Lightning (Kilo)',
    specialty: 'Speed + 1M context: fast triage of very long logs, docs and diffs.',
    note: '1M context at speed. First-pass triage of huge logs or diffs, then hand the finding to a deeper model (65k out).',
    md: ['speed at 1M context — rare combination.', 'first-pass triage of huge logs, diffs or transcripts, then hand the finding to a deeper model.', '65k output cap — don\'t ask it to write the whole file back.'],
  },
  'thinkingmachines/inkling:free': {
    name: 'Inkling',
    specialty: 'Agentic reasoning with vision and big outputs; built for multi-step tool work.',
    note: 'Multi-step agentic work with 262k outputs. Autonomous refactor loops and long tool-driven research.',
    md: ['multi-step agentic work: it keeps a plan coherent across tool calls and can emit very large outputs.', 'autonomous coding/refactor loops, long tool-driven research, tasks that need 100k+ token deliverables.', 'that agent loops multiply token use — prefer 11 when iterating.'],
  },
  'thinkingmachines/inkling-small:free': {
    name: 'Inkling Small',
    specialty: 'Cheaper Inkling: same 1M/262k envelope, ideal for repeated agent loops.',
    note: 'Same envelope at lower cost per iteration. test-fix-test cycles; escalate to 10 for the final pass.',
    md: ['the same 1M/262k envelope at lower cost per iteration.', 'test-fix-test cycles and repeated agent passes where you don\'t need peak judgment.', 'it can lose subtle context on very long chains — escalate to 10 for the final pass.'],
  },
  'dots-studio/dots-3-note-preview:free': {
    name: 'Dots3 Note Preview',
    specialty: 'Document-scale tasks: whole repo/book in, book-length output. Rare 460k output ceiling.',
    note: 'Document scale in <i>and</i> out — a 460k output ceiling. Whole books, reports, specs; long inputs restructured.',
    md: ['document-scale work in **both** directions — the 460k output ceiling is the highest here.', 'generating whole books, reports or specs; restructuring long inputs into long deliverables.', 'it\'s a preview model; verify structure on big outputs.'],
  },
  'stealth/glyph-cluster': {
    name: 'Glyph Cluster',
    specialty: 'Massive transforms: full rewrites, exhaustive summaries, big translation passes.',
    note: 'Mass transformation: rewrite, translate, summarize large inputs with room to write back. Not a deep reasoner.',
    md: ['mass transformation — rewrite/translate/summarize large inputs with room to write back.', 'full-file rewrites, bulk translation, exhaustive summaries, style migrations.', 'delicate reasoning: this is a transformer, not a thinker.'],
  },
  'recursive/flint-v1.0:free': {
    name: 'Flint 1.0',
    specialty: 'Open reasoning model with long outputs; solid second choice for large edits.',
    note: 'Reasoning plus long output. Design docs and thorough reviews that need depth <i>and</i> length.',
    md: ['reasoning plus long outputs — think it through, then write it all down.', 'long-form analysis, design docs, thorough reviews that need depth *and* length.', 'that it\'s slower than flash-tier models on small asks.'],
  },
  'cohere/north-mini-code:free': {
    name: 'North Mini Code',
    specialty: 'Compact coding specialist: refactors, code review, tight diff generation.',
    note: 'Code review, refactors, tests, diffs. Purpose-built; pair with 01 when the task is half prose.',
    md: ['code-specific work: review, refactor, tests, diff generation.', 'PR review, writing tests, mechanical refactors where a big generalist is overkill.', 'non-code reasoning — pair it with 01 when the task is half prose.'],
  },
  'openrouter/free': {
    name: 'OpenRouter Free Router',
    specialty: "Routes across OpenRouter's own <code>:free</code> catalog — variety when Kilo's pool is busy.",
    note: "Breadth across OpenRouter's own <code>:free</code> catalog. Variety and fallback when Kilo's pool is saturated.",
    md: ['breadth: it routes across OpenRouter\'s own `:free` catalog.', 'variety when Kilo\'s pool is saturated, comparing answers, or exploring unfamiliar models.', 'the routed model is invisible — don\'t rely on a specific style.'],
  },
  'google/gemma-4-31b-it:free': {
    name: 'Gemma 4 31B',
    specialty: 'Small vision generalist; strong multilingual instruction following.',
    note: 'Small-model discipline: predictable formatting, multilingual, vision. Image triage at volume.',
    md: ['small-model discipline: predictable formatting, solid multilingual instruction following, vision.', 'image triage at volume, multilingual support replies, strict-format extraction.', 'deep reasoning — 31B has limits.'],
  },
  'inclusionai/ling-3.1-flash-1019-free': {
    name: 'Ling 3.1 Flash',
    specialty: 'Efficient 1M-context with 262k outputs — long code transformations at low cost.',
    note: '1M context and 262k out at a low cost profile. Big code transforms, long transcript → deliverable work.',
    md: ['1M context with 262k outputs at a low cost profile.', 'big code transformations, ingesting long transcripts and producing long deliverables.', 'that "flash" here means throughput, not deep thought.'],
  },
  'big-pickle': {
    name: 'Big Pickle',
    specialty: 'General chat with vision and a roomy output budget; comfortable everyday fallback.',
    note: 'Roomy general chat with vision. Everyday Q&amp;A, doc drafting, a comfortable fallback when flagships throttle.',
    md: ['roomy general chat with vision and a generous output budget.', 'everyday Q&A, doc drafting, comfortable fallback when the flagships throttle.', 'the free-lane prompt overhead on tiny asks.'],
  },
  'beam-free': {
    name: 'Beam',
    specialty: 'General reasoning, mid-size; dependable mid-tier when the flagships queue up.',
    note: 'Dependable mid-tier reasoning. A safe, consistent everyday choice rather than a specialist.',
    md: ['dependable mid-tier reasoning without surprises.', 'balanced everyday tasks and a safe "boring" choice when you want consistency.', 'context and output both cap at 131k/32k.'],
  },
  'reflection/beam-free': {
    name: 'Beam 1.0',
    specialty: 'Reasoning at 1M context — long analysis without the free-lane overhead.',
    note: 'Reasoning at 1M context with leaner overhead. Long analysis when the free lane is busy.',
    md: ['reasoning at 1M context with Kilo\'s leaner overhead.', 'long analysis when the free lane is busy or you want to save prompt tokens.', 'it\'s a reasoning model, so short factual asks can feel slow.'],
  },
  'flint-40b-free': {
    name: 'Flint 40B',
    specialty: '40B open reasoning, solid mid-tier judgment on everyday engineering questions.',
    note: '40B open-model judgment. A second perspective on plans and mid-size engineering questions.',
    md: ['40B open-model judgment — a solid second perspective.', 'mid-size engineering questions, review of a plan, alternative answers.', 'it\'s a mid-tier model: don\'t hand it 300k tokens.'],
  },
  'pulse-alpha-free': {
    name: 'Pulse Alpha',
    specialty: 'Experimental generalist — a taste of upcoming free frontier models; expect volatility.',
    note: 'A preview of upcoming free frontier models. Experimentation only — expect volatility.',
    md: ['being a preview of upcoming free frontier models — sometimes surprisingly strong.', 'experimentation and non-critical exploration.', 'volatility: it can change or disappear without notice.'],
  },
  'crouton-alpha-free': {
    name: 'Crouton Alpha',
    specialty: 'Brand-new free-lane alpha — preview model; treat as experimental until probed.',
    note: 'New free-lane alpha that appeared in the roster. Treat as a preview model: try it on a real task before relying on it.',
    md: ['being a brand-new free-lane alpha entry — fresh capacity when the other free models are saturated.', 'exploration and second opinions while you learn its behavior.', 'it is unproven here: no curated track record yet, so validate important outputs.'],
  },
  'stealth/crouton-alpha': {
    name: 'Crouton Alpha (Kilo)',
    specialty: 'New Kilo-side alpha/preview entry — fresh free capacity; verify with a live prompt.',
    note: 'New Kilo-side alpha entry. Fresh free capacity on the Kilo lane; run a real prompt to see what it is good at.',
    md: ['fresh free capacity on the Kilo lane when the established pool models throttle.', 'low-stakes exploration and bulk drafts while you evaluate it.', 'no curated track record yet — check outputs before shipping them.'],
  },
  'liquid/lfm-2.5-2.6b:free': {
    name: 'LFM2.5 2.6B',
    specialty: 'Tiny and fast: classification, extraction, titles — for when every millisecond counts.',
    note: 'Tiny and fast: titles, tags, classification, extraction, routing. A utility model, not a reasoner.',
    md: ['tiny, fast jobs where reasoning would be wasted.', 'titles, tags, classification, extraction, routing decisions, bulk cleanup.', '64k context and 8k output — this is a utility model.'],
  },
  'xingchen-agi/xing4.0-29b-a4b:free': {
    name: 'Xing4.0 29B',
    specialty: 'Sparse 29B MoE: cheap long-output work — bulk rewrites and data generation.',
    note: 'Cheap long-output generation via sparse MoE. Bulk data, mass rewrites and synthetic examples at scale.',
    md: ['cheap long-output generation (sparse MoE, 29B active-ish).', 'bulk data generation, mass rewrites, synthetic examples at scale.', 'quality on hard reasoning; sample before trusting a big run.'],
  },
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free': {
    name: 'Nemotron 3 Nano Omni',
    specialty: 'Small omni reasoning + vision; thrifty for image-aware batch jobs.',
    note: 'Small omni reasoning plus vision. Alt text, screenshot triage at volume, image-aware batch jobs.',
    md: ['small omni reasoning plus vision.', 'image-aware batch jobs — alt text, screenshot triage at volume, moderation with images.', 'depth: it\'s a nano model.'],
  },
  'nvidia/nemotron-3.5-content-safety:free': {
    name: 'Nemotron Content Safety',
    specialty: 'Moderation and safety classification — policy checks, not creative work.',
    note: 'Safety and moderation classification. Policy checks and filtering — not a chat model.',
    md: ['safety and moderation classification.', 'policy checks, content filtering, red-team triage.', 'that it\'s a classifier, not a chat model — don\'t use it for creative work.'],
  },
}

/** Task → model ids for the "pick by task" table. Ids that are retired upstream
 *  drop out of the row automatically, so the table can't go stale. */
export const TASKS = [
  { need: 'A default that just works', ids: ['deepseek-v4.1-flash-free', 'combo:recommended-free'], why: 'Best balance of reasoning, speed and 384k output' },
  { need: 'The hardest thinking', ids: ['nvidia/nemotron-3-ultra-550b-a55b:free', 'deepseek-v4.1-flash-free'], why: 'Largest model in the stack, 1M context' },
  { need: 'Screenshots, UI, charts, OCR', ids: ['nemotron-3.5-super-vl-free', 'nvidia/nemotron-3.5-super-vl:free'], why: 'Vision-language specialists with 1M context' },
  { need: 'Whole repo / book in one shot', ids: ['dots-studio/dots-3-note-preview:free', 'nvidia/nemotron-3.5-lightning:free', 'stealth/glyph-cluster'], why: '512k–1M input with up to 460k output' },
  { need: 'Coding & refactors', ids: ['cohere/north-mini-code:free', 'deepseek-v4.1-flash-free', 'recursive/flint-v1.0:free'], why: 'Purpose-built code models + long-output generalists' },
  { need: 'Agentic tool loops', ids: ['thinkingmachines/inkling:free', 'thinkingmachines/inkling-small:free', 'kilo-auto/free', 'deepseek-v4.1-flash-free'], why: '1M context, vision, 262k outputs' },
  { need: 'Bulk extraction / classification', ids: ['liquid/lfm-2.5-2.6b:free', 'xingchen-agi/xing4.0-29b-a4b:free', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', 'cohere/north-mini-code:free'], why: 'Cheap, fast, purpose-shaped' },
  { need: 'Variety when Kilo is busy', ids: ['openrouter/free', 'combo:recommended-free'], why: 'Routers over independent pools' },
]
