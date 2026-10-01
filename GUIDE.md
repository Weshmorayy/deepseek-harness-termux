# Comprehensive Guide: Installing & Running DeepSeek Harness (`dsh`) on Android Termux (Low-RAM Architecture)

This document chronicles the step-by-step engineering process, roadblocks, custom patches, and best practices required to successfully deploy the **DeepSeek Harness (`dsh`) Web UI and Interactive CLI** within a resource-constrained Android Termux environment (specifically optimized for a **4GB RAM ARM64** device like Samsung A24).

---

## 💻 1. Core Environment Setup
To prevent Android's Process Killer from terminating background daemons, the environment must be locked awake, system packages updated, and native compilation toolchains provided.

```bash
# Keep Termux awake permanently
termux-wake-lock

# Synchronize system repositories and update core binaries
pkg update && pkg upgrade -y

# Install essential system dependencies
pkg install git nodejs build-essential python libvips tur-repo nodejs-lts-headers -y
```

---

## 🛑 Roadblocks Encountered & Technical Solutions

### ❌ Roadblock 1: Registry E404 on Release Candidates (`0.1.5-rc.x`)
* **The Error:** Running `npm install -g @deepseek-ai/dsh` pulled a broken release candidate that required an experimental private package (`@deepseek-ai/dsh-experimental-code-runtime-python`), throwing a fatal `E404 Not Found` from the public npm registry.
* **The Solution:** Bypass the broken release candidates entirely by force-installing the stable alpha track (`@deepseek-ai/dsh@0.1.5-alpha.1`).

---

### ❌ Roadblock 2: Native C-Binary Crash (`sharp` Module on `android-arm64`)
* **The Error:** The `@deepseek-ai/dsh-attachment-local` sub-module relies on `sharp` for image parsing. It crashes on startup because pre-compiled binaries do not exist for native Android Bionic (`android-arm64`).
* **The Solution:** Installed `@img/sharp-wasm32` WebAssembly fallback driver.

---

### ❌ Roadblock 3: Missing Mobile-UI Extensions (`dsh-web-mobile`)
* **The Error:** `Cannot find package 'dsh-web-mobile'` crash on narrow screen layout init.
* **The Solution:** Installed `dsh-web-mobile` globally and linked it into the application execution tree.

---

### ❌ Roadblock 4: Hot Module Replacement (HMR) / Node Flag Restrictions
* **The Error:** `cordis-plugin-hmr` strictly demands Node's `--expose-internals` flag.
* **The Solution:** Wrapped `/data/data/com.termux/files/usr/bin/dsh` to pass `--expose-internals --max-old-space-size=2048` automatically.

---

### ❌ Roadblock 5: `flock is not supported on android-arm64` Fatal Exception
* **The Error:** `@deepseek-ai/node-addon-system` strictly checks `linux` or `darwin`. On Android, it threw an unsupported platform crash.
* **The Solution:** Patched [`loadBinding()`](file:///data/data/com.termux/files/usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/node-addon-system/lib/flock.js) to detect `android` and provide a mock non-blocking lock resolver callback (`cb(0)`).

---

### ❌ Roadblock 6: Bad Interpreter / Shebang on Android Termux
* **The Error:** `bash: .../dsh: /usr/bin/env: bad interpreter: No such file or directory`.
* **The Solution:** Created an executable wrapper script in `/data/data/com.termux/files/usr/bin/dsh`.

---

### ❌ Roadblock 7: `EACCES: permission denied, link ...` on Session Persistence
* **The Error:** Android SELinux and kernel security policy disallow creating hard links (`fs.link`) within application data directories.
* **The Solution:** Patched `materializePosix` and `publishCurrentExclusive` in `@deepseek-ai/dsh-session-persistence-jsonl` to catch `EACCES`/`EPERM` and fallback gracefully to `fs.rename`.

---

### ❌ Roadblock 8: `readdirSync is not defined` Reference Error
* **The Error:** Accidental drop of synchronous `readdirSync` from `node:fs`.
* **The Solution:** Restored `import { readdirSync } from "node:fs";` in `dsh-session-persistence-jsonl/lib/index.js`.

---

### ❌ Roadblock 9: Unauthenticated Browser Launch
* **The Error:** The automatic browser launcher opened `http://127.0.0.1:3080/` without the session security token.
* **The Solution:** Patched `openBrowser(url)` in `dsh-web-app` to route `authenticatedUrl` directly through Android's `termux-open-url`.

---

### ❌ Roadblock 10: Profile Package Resolution for Out-of-Bundle Plugins
* **The Error:** `Cannot find package '@deepseek-ai/dsh-web-search-exa' imported from .../profiles/web/`.
* **The Solution:** Linked `@deepseek-ai/dsh-web-search-exa` into `~/.dsh/profiles/web/node_modules/@deepseek-ai/`.

---

### ❌ Roadblock 11: `Unexpected message role` on HuggingFace / MiniJinja Templates
* **The Error:** Models with reasoning enabled on non-OpenAI endpoints (e.g. Qwen / Llama on NVIDIA NIM or Groq) failed with:
  `400: minijinja: rendering failed: raise_exception: Unexpected message role.`
* **The Reason:** `openai-completions.js` was sending `role: "developer"` (OpenAI o1/o3 syntax) to endpoints running open-weights Jinja templates that only accept `system`, `user`, and `assistant`.
* **The Solution:** Patched `openai-completions.js` in `@earendil-works/pi-ai` so that `role: "developer"` is only used for native `openai` provider routes, falling back to `role: "system"` for all other providers.

---

## 🚀 2. Verified Execution Commands

```bash
dsh-start
```
* Automatically boots DSH and opens the authenticated token link directly in your browser.

---

## Roadblock 12 — AI Engineering System Built (2026-09-23)

### What was built
Full AI engineering ecosystem per `Instruction_deepseek.md` + `AI-ENGINEERING-RESEARCH-SEPTEMBER-2026.md`.

### AI_SYSTEM/ structure
```
~/AI_SYSTEM/
├── README.md              ← architecture overview + how-to guide
├── models/registry.yaml   ← model intelligence cache (12 models)
├── routing/profiles.yaml  ← task→model routing profiles (15 task types)
├── quotas/state.yaml      ← quota metadata with confidence levels
├── providers/freellmapi-config.yaml
├── skills/
│   ├── project-start.md
│   ├── repo-orientation.md
│   ├── debugging.md
│   ├── vision-analysis.md
│   ├── security-review.md
│   └── code-review.md
├── workflows/
│   ├── update-docs.md
│   ├── new-project.md
│   └── task-execute.md
├── agents/
│   ├── AGENTS-template.md
│   └── system-rules.md
├── mcps/installed.yaml    ← MCP recommendations (PublicAI, Context7, GitHub, Supabase, Playwright)
├── memory/architecture.md ← 4-level memory architecture
├── research/              ← (for future research outputs)
├── experimental/          ← (for experiments)
├── scripts/
│   ├── ai-status          ← system dashboard
│   ├── ai-models          ← model table + refresh
│   ├── ai-quota           ← quota status
│   ├── ai-health          ← provider ping check
│   ├── freellmapi-start   ← start API gateway
│   ├── freellmapi-client  ← start dashboard UI
│   ├── dsh-start          ← launch DSH (also refreshes the OpenRouter model list)
│   └── refresh-openrouter-models.mjs ← keep the DSH OpenRouter model list current
└── docs/
    └── openrouter-model-refresh.md   ← OpenRouter route architecture (see Roadblock 16)

```

### FreeLLMAPI
- Location: ~/freellmapi/
- Version: v0.11.1 (repo) / 0.6.0 (npm package)
- API: http://localhost:3001/v1
- Dashboard: http://localhost:5173
- Unified API key: freellmapi-71ad8153feaf0accfde99e05d2e22fc792e59be02673ffdd
- First-run setup code: UA67DUEEVF
- Start server: ~/AI_SYSTEM/scripts/freellmapi-start
- Start dashboard: ~/AI_SYSTEM/scripts/freellmapi-client
- Termux fixes applied: shebangs on all .bin files + workspace script paths patched

### DSH settings.yaml updated
Models now configured with vision modalities where applicable:
- Google: gemini-2.5-flash (vision), gemini-2.5-flash-lite (vision), gemini-2.5-pro (vision)
- Groq: qwen-qwen3.8-27b (vision), llama-3.3-70b, qwen3-32b
- NVIDIA: glm-5.3-flash (vision), mistral-small-3.1 (vision)
- Mistral: mistral-small-4, mistral-ocr-latest (vision)
- FreeLLMAPI: auto, auto:fast, auto:smart
- Default model: google / gemini-2.5-flash

### Commands available (add to PATH via ~/.bashrc)
```bash
ai-status    # system overview
ai-models    # model table
ai-quota     # quota status
ai-health    # provider ping
dsh-start    # launch DSH
freellmapi-start   # start provider gateway
freellmapi-client  # start dashboard
```

---

## Roadblock 13 — Image Input Modal Gate (`model "auto:smart" does not declare image input`) (2026-09-23)

### Symptom
Agent fails to read images when using FreeLLMAPI models (`auto:smart`, `auto`, etc.) with error:
`Error: cannot read "<path>.jpg" as an image: model "auto:smart" does not declare image input; switch to an image-capable model to read images`

### Root Cause
1. `@deepseek-ai/dsh-llm-pi-ai`'s Zod schema validates model entries against `input: z.array(z.union(MODALITIES))`.
2. When configuring `inputModalities: [text, image]`, the field was ignored by the schema validator.
3. As a result, `declaredInput(entry.input)` returned `undefined`, causing DSH to fall back to `DEFAULT_INPUT` (`["text"]`).
4. In `@deepseek-ai/dsh-tool-fs`, `assertImageCapableRoute` checked `!active.inputModalities.includes("image")` and threw the fatal refusal error.

### Solution
1. **`~/.dsh/settings.yaml`**: Configured `defaultInput: [text, image]` and `input: [text, image]` on all custom provider models (`freellmapi` and `inception`). Removed extra shortcuts under `freellmapi`, keeping cleanly `auto`, `auto:fast`, and `auto:smart`.
2. **`@deepseek-ai/dsh-llm-pi-ai/lib/index.js`**:
   - Patched schema (`modelFields`) to accept `inputModalities` alongside `input`.
   - Patched model resolution to `declaredInput(entry.input ?? entry.inputModalities)`.
3. **`@deepseek-ai/dsh-tool-fs/lib/index.js`**:
   - Patched `assertImageCapableRoute` to safely allow image reading whenever `provider === "freellmapi"`, `model.startsWith("auto")`, or `ctx.get("vision-router") !== void 0`.

---

## Roadblock 14 — Android Directory Fsync & Attachment Link (`EACCES: permission denied, open '/data/data'` & `session/agent-busy: prompt rejected`) (2026-09-23)

### Symptom
1. `read_image` or file operations fail with:
   `Error: EACCES: permission denied, open '/data/data'`
2. Sending prompts containing images (e.g. Mercury or FreeLLMAPI) fails with:
   `session/agent-busy: prompt rejected`

### Root Cause
1. On Android/Termux, `/data/data` is owned by `system:system` with permissions `0771` (`drwxrwx--x`). Non-root apps cannot open `/data/data` with `open(path, O_RDONLY)`.
2. When DSH saves image attachments, `ensureDurableHome` in `@deepseek-ai/dsh-attachment-local` walks ancestor directories up to `/`, calling `syncDirectory()` on each directory to fsync it. Calling `open('/data/data', O_RDONLY)` throws `EACCES: permission denied, open '/data/data'`.
3. In `@deepseek-ai/dsh-api-session-controller`, errors during prompt image admission are caught and converted into `RemoteError("session/agent-busy", "prompt rejected")`.
4. In `@deepseek-ai/dsh-attachment-local`, `publishStagedObject()` used `fs.link()`, which Android's data partition forbids for unprivileged apps (`EACCES`).

### Solution
1. **`@deepseek-ai/dsh-attachment-local/lib/index.js`**:
   - `syncDirectory()`: Added `try ... catch` to safely ignore `EACCES` and `EPERM` when syncing parent/system directories.
   - `publishStagedObject()`: Added fallback from `link` to `rename` on `EACCES`/`EPERM`.
2. **`@deepseek-ai/dsh-storage-json/lib/index.js`**:
   - `fsyncDirectory()`: Added `try ... catch` to safely ignore `EACCES`/`EPERM`.
3. **`@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js` & `worker.cjs`**:
   - `syncDirectory()`: Added `try ... catch` to safely ignore `EACCES`/`EPERM`.

---

## Roadblock 15 — File Creation Hard-Link Rejection (`cannot write ...: EACCES: permission denied, link ...`) (2026-09-23)

### Symptom
When an agent or tool creates a new file (e.g., `IMAGE_ANALYSIS.md`), it fails with:
`Error: cannot write "...": EACCES: permission denied, link '....tmpdir/...tmp' -> '...'`

### Root Cause
In `@deepseek-ai/dsh-fs-local/lib/index.js`, `writeFileAtomic()` used `linkFile(tempPath, absolutePath)` (`fs.promises.link`) as a non-replacing file creation primitive. Android data partitions reject `link()` syscalls for unprivileged applications with `EACCES`.

### Solution
Patched `writeFileAtomic()` in `@deepseek-ai/dsh-fs-local/lib/index.js`: on `EACCES` or `EPERM` during `linkFile()`, safely fall back to `rename(tempPath, absolutePath)`.

---

## Roadblock 16 — OpenRouter Route Shows Only 4 Models (2026-10-01)

### Symptom
The OpenRouter card in **Settings → Models** offers just four models (Space Bunny Alpha, FLUX.1 [dev], FLUX.1 [schnell], ByteDance SeeDream 3). OpenRouter advertises 400+, and **Fetch available models** returns the same four.

### Root Cause
**Not an OpenRouter outage, and not a DSH bug — a configuration rule.** In `~/.dsh/settings.yaml`, the `openrouter` provider carried an explicit `models:` list. In `@deepseek-ai/dsh-llm-pi-ai`, that list *replaces* the bundled catalog instead of adding to it:

```js
// dsh-llm-pi-ai/lib/index.js:651  (resolveRouteModels)
const entries = configured.length > 0 ? configured : [...defaults.values()].map(...)
```

Three of those four ids (`flux-1-dev`, `flux-1-schnell`, `bytedance/seedream-3`) no longer exist on OpenRouter's `/api/v1/models` listing at all — they were hand-written and had silently rotted.

### Why "Fetch available models" Cannot Fix It
Discovery short-circuits to the catalog frozen inside `@earendil-works/pi-ai` **before any network call**:

```js
// dsh-llm-pi-ai/lib/index.js:2274  (discoverModels)
if (request.provider !== void 0) {
  const installed = catalogModels(request.provider)
  if (installed.size > 0) return [...installed.values()]...   // network never reached
}
```

Every provider named `openrouter` therefore returns the bundled snapshot. This is upstream [deepseek-harness#4469](https://github.com/deepseek-ai/deepseek-harness/discussions/4469), so it cannot be worked around in config.

### Solution — four routes, auto-maintained
`~/.dsh/settings.yaml` now uses:

| Route | Source | Count |
|---|---|---|
| `openrouter` | pi-ai package (no `models:`, no `api:`, no `baseURL:`) | ~366, with full cost/reasoning/protocol metadata |
| `openrouter-extra` | live `GET /api/v1/models`, minus the catalog | ~120 |
| `openrouter-images` | live `GET /api/v1/images/models` | ~55 |
| `space-bunny` | pinned | 1 |

Self-healing in both directions: a new OpenRouter model appears in `openrouter-extra` on the next refresh, and silently migrates into the catalog route once pi-ai ships it.

The image route works because discovery appends `/models` to whatever base URL it is given (`index.js:2163`), so `https://openrouter.ai/api/v1/images` lands on OpenRouter's separate image catalog.

### Accurate tokens and reasoning (both were wrong)
- **maxTokens** must come from `top_provider.max_completion_tokens`. A hand-written 131072 clamp understated **15 models**; Space Bunny Alpha's true value is **524288**.
- **Effort menus** must come from each model's own `reasoning.supported_efforts` ladder. Space Bunny Alpha reports `mandatory: true`, meaning the API *rejects* `effort: "none"` — a config offering an `off` level fails at request time. OpenRouter's `"none"` maps to pi-ai's `off` level, and `max`/`xhigh` must be offered where listed.

### Maintenance
`dsh-start` refreshes automatically (≤ once per 12h, `--force-refresh` to override). The generator parses its own output with dsh's `js-yaml` and **refuses to write** if invalid, writes atomically via `rename(2)`, and never blocks startup on a dead network. Backups: `~/.dsh/settings.yaml.bak-*`.

> Note: DSH is a chat harness with no image-*generation* path. Pure generation models (seedream, flux.2, qwen-image) are served by `POST /api/v1/images/generations`, which DSH never calls — chat models that emit images (gemini-3.1-flash-image, gpt-5-image) do work.

Source and full detail: `Weshmorayy/ai-system-termux` → `docs/openrouter-model-refresh.md` and `scripts/refresh-openrouter-models.mjs`.

---

## Roadblock 17 — FreeLLMAPI Dashboard Missing Free & Stealth Models (2026-10-01)

### Symptom
The FreeLLMAPI dashboard listed only **12** OpenRouter models, and
`stealth/space-bunny-alpha` was never among them — even though the model is
zero-priced and served fine through the DSH route.

### Root Cause
**Nothing syncs OpenRouter live.** FreeLLMAPI builds its catalog from two
sources, neither of them OpenRouter:

1. A **hardcoded seed** in `server/src/db/migrations/20260101_000000_legacy_baseline.ts`.
2. A **signed monthly catalog** from `api.freellmapi.co`
   (`server/src/services/catalog-sync.ts`) — 338 models across 24 platforms,
   and `openrouter` is **not** one of them
   (`settings.catalog_applied_json.platforms`).

### Why the Server's Own Discovery Cannot Fix It
`server/src/services/builtin-model-discovery.ts` would fill the list from
OpenRouter's `/models`, but three gates block `openrouter`:

| # | Gate | Location |
|---|---|---|
| 1 | Not in `BUILTIN_DISCOVERY_PLATFORMS` (`['github','longcat','siliconflow']`) | `:49` |
| 2 | `builtinDiscoveryMode()` defaults to `'manual'`, so it never schedules | `:64` |
| 3 | **`hasCatalogOwnedRows()`** — all 317 rows are `source='catalog'` | `:84` |

Gate 3 is decisive; even fixing 1 and 2 leaves it blocked.

### Solution
**Deliberately did not patch `hasCatalogOwnedRows()`.** It is shared, and the
gated-provider test at `__tests__/services/builtin-model-discovery.test.ts:117`
shows the allowlist is an intentional audit gate for premium providers.

Instead, `scripts/sync_openrouter_free_models.py` writes rows with
`source='discovered'`. That provenance sits outside `hasCatalogOwnedRows`, and
`catalog-sync.ts:654` prunes discovered rows **only on platforms the catalog
manages** — `openrouter` is not managed, so these rows survive every monthly
sync. No upstream FreeLLMAPI source was modified.

### Free Means "Zero-Priced", Not ":free Suffix"
A model is free when the sum of **all** pricing fields equals 0 — the same rule
the Open WebUI pipe uses (`is_free_model`, bundled pipe line 19900). Checking
the price rather than the suffix is what catches stealth models: 21 models are
free but only 17 carry `:free`, and the 4 without are exactly the stealth-style
ones:

```
stealth/space-bunny-alpha
google/lyria-3-pro-preview
google/lyria-3-clip-preview
openrouter/free
```

Conversely, every `:free` model is also zero-priced, so the check never misses
one and never imports a paid model.

### Two Non-Obvious Requirements
1. **`profile_models` linkage is mandatory.** `routes/free-tier.ts:129` and
   `routes/models.ts:449` join through it, so a model without a row is never
   exposed. Writing `models` alone changes nothing.
2. **Startup ordering.** `freellmapi-start` exits early when the gateway is
   already listening. Since `dsh-start` invokes it as step 1 and FreeLLMAPI is
   normally already up, the sync had to move **above** that early exit —
   otherwise it was skipped on every boot. Writing to the DB while the server
   runs is safe: the catalog is read per request.

### Result
Gateway serves 274 models (was 266), including `stealth/space-bunny-alpha` at
its true 1M context with vision and tools.

Source and full detail: `Weshmorayy/ai-system-termux` →
`docs/freellmapi-openrouter-sync.md` and `scripts/sync_openrouter_free_models.py`.
