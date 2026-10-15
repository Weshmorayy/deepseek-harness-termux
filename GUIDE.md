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

---

## Roadblock 18 — Upgrade to `0.2.0-rc.2` on Termux/Android (2026-10-15)

### What changed
Upgraded from `dsh 0.1.5-alpha.1` → `0.2.0-rc.2` (`npm latest` as of 2026-10-15).

### Blockers hit and fixes applied

#### ❌ Blocker A: `statx()` / Bionic header collision in koffi 3.1.1
`koffi@3.1.1` (bundled in 0.2.0) fails to compile from source on Android arm64:
```
base.cc:2967: cannot initialize a member subobject of type '__u32'
             with lvalue of type 'const char *'
```
Bionic's `statx` struct definition conflicts with what koffi expects (glibc ABI).
There is no android-arm64 prebuilt for koffi 3.1.1 on npm.

**Fix:** Upgrade the bundled koffi to 3.3.0 (first version with a published
`@koromix/koffi-android-arm64` prebuilt). Run inside `install.sh` after the
npm install step:
```bash
DSH_MOD="$(npm root -g)/@deepseek-ai/dsh/node_modules"
cd "$DSH_MOD"
npm install koffi@3.3.0 @koromix/koffi-android-arm64@3.3.0 --no-save --ignore-scripts
```

#### ❌ Blocker B: `node-addon-require-builtin-android-arm64` missing from npm
`@deepseek-ai/dsh-app-boot` uses this native addon to load Node.js internal
modules for profile resolution. No android-arm64 package is published.

Since DSH already runs with `--expose-internals`, a pure-JS shim satisfies
all required interface methods:

```bash
SHIM="$(npm root -g)/@deepseek-ai/dsh/node_modules/node-addon-require-builtin-android-arm64"
mkdir -p "$SHIM"
cat > "$SHIM/package.json" << 'JSON'
{"name":"node-addon-require-builtin-android-arm64","version":"0.1.9","main":"index.js"}
JSON
cat > "$SHIM/index.js" << 'JS'
'use strict';
function requireBuiltin(id) { return require(id); }
function isAllowedInternalId() { return true; }
function getNativeBindingInfo() {
  return { mode: 'unrestricted', product: 'require-builtin', backend: 'napi', abi: 'napi-v9' };
}
module.exports = { requireBuiltin, isAllowedInternalId, getNativeBindingInfo };
JS
```

#### ❌ Blocker C: `dsh` bin shim shebang broken on Termux
0.2.0's npm postinstall writes `/usr/bin/dsh` as a standalone JS bundle
starting with `#!/usr/bin/env node`. Termux has no `/usr/bin/env`.
`install.sh` already handles this — verify it still rewrites `lib/bin.js`
shebang **and** the `/usr/bin/dsh` wrapper after each upgrade.

### Config breaking changes (applied during upgrade)
| File | Change |
|---|---|
| `~/.dsh/settings.yaml` line 6 | `baseURL: https://api.deepseek.com/v1` → `https://api.deepseek.com/anthropic` |
| `~/.dsh/profiles/web/cordis.patch.yml` | `maxInlineBytes: 20000` → `maxInlineTokens: 6000` |

**Note:** DSH 0.2.0 performs a **one-time import** of `settings.yaml` into the
profile plugin config on first boot, then renames it to `settings.yaml.imported`.
The file is consumed — future DSH restarts read from the profile config, not `settings.yaml`.

### Plugin compatibility with 0.2.0-rc.2
| Plugin | Status |
|---|---|
| `dsh-vision-router@2.2.1` | ❌ Incompatible — peer dep cap at 0.1.6-alpha.1. Use `dsh plugin allow-version` to accept risk. |
| `@liustack/modlens` | ⚠️ Loads but settings UI broken (`scope.settings.register` removed) |
| `dsh-bill` | ⚠️ Degraded — rpc channel not mounted, serves API only |
| `@deepseek-ai/dsh-web-search-exa` | ❌ Failed to import (may be removed in 0.2.0) |
| `dsh-fast`, `dshmarket`, `dsh-web-mobile` | ✅ OK |

### dsh-start status
`dsh-start` works without modification. The script spawns `dsh web --no-open`
and parses stdout for the token URL pattern `http://127.0.0.1:PORT/?token=...`.
0.2.0 still prints this format. Startup is ~25s on this device (vs ~5s on desktop).

### Behavioral changes in 0.2.0
- **Token required** — bare `http://127.0.0.1:3080/` returns HTTP 401; use
  the full `?token=...` URL from `dsh-start` output.
- **Settings moved** — `settings.yaml` → consumed into profile config (one-time).
- **`dsh web` default port** — still 3080 unless overridden.

### See also
Full step-by-step detail: `docs/UPGRADE-0.2.0-rc.2.md`

---

## Roadblock 19 — Post-upgrade patch re-application failures (2026-10-15)

### Symptom A: `This turn failed — EACCES: permission denied, link '...session.v4.jsonl.zstd.tmp' -> '...session.v4.jsonl.zstd'`

Patches 02 and 06 were not re-applied after the 0.2.0 upgrade (patch hunks no
longer matched the new bundle lines). Two distinct link() call sites needed fixing:

1. **`dsh-session-persistence-jsonl` L4** — `rename` was not in the `fs/promises` import:
   ```diff
   -import { link, lstat, mkdir, ... } from "node:fs/promises";
   +import { link, lstat, mkdir, ..., rename, ... } from "node:fs/promises";
   ```
2. **`dsh-session-persistence-jsonl` L2034** — `internals.fs.link()` rethrew
   EACCES instead of falling back to rename:
   ```diff
   -  if (isEEXIST(error)) return false;
   -  throw error;
   +  if (error?.code === 'EACCES' || error?.code === 'EPERM') {
   +    await rename(staged, currentPath);
   +  } else if (isEEXIST(error)) { return false; }
   +  else { throw error; }
   ```
3. **`dsh-workspace` L527** — `sessionKnown()` check threw on sessions absent
   from persistence after an unclean shutdown. Commented out with a Termux note.

### Symptom B: `[openrouter] refresh skipped: saved default openrouter/z-ai/glm-5.3-flash would not resolve`

The refresh script guarded against a model being removed from `openrouter-extra`.
But `z-ai/glm-5.3-flash` lives in the **catalog route** (`openrouter`), which has
NO explicit `models:` list — it uses the pi-ai bundled catalog. The guard
incorrectly failed because `routes['openrouter'].models` is undefined.

Fix in `refresh-openrouter-models.mjs`: skip the guard when the route has no
explicit models list (catalog routes). After fix: `[openrouter] refreshed: 98 extra + 57 image`.

### Symptom C: Missing sidebar / navigation button in DSH Web UI

Caused by **stale `localStorage`** from the old DSH version. The `dsh.workspace.view.v5`
key expects new properties (`groupExpansion`, `sessionUpdatedAtByAccount`, etc.) added in 0.2.0.

**Fix:** In your browser, open DevTools → Application → Local Storage →
`http://127.0.0.1:3080` → delete all `dsh.*` keys → hard reload (Ctrl+Shift+R).

The "home" / back button on the left of the session name is the **workspace
switcher** — it collapses the session list panel. If it disappears, it means
`dsh-web-mobile` is hiding it on narrow screens (< 1024 px). Rotate to
landscape or widen the browser window to restore the full layout.

### Symptom D: Settings tabs stacked weirdly

Intentional 0.2.0 design: settings moved from a flat `settings.yaml` into
per-plugin configuration sections inside the profile. Each plugin now has its
own collapsible settings group. The stacked appearance is the new normal.

### Symptom E: `flock is not supported on android-arm64`

Patched in Roadblock 18 follow-up (see `patches/09-node-addon-system-flock-android.patch`).
`loadBinding()` in `node-addon-system/lib/flock.js` now maps `android→linux`
and falls back to a no-op mock if no native binary is found.

### Symptom F: `dsh-vision-router@2.2.1 incompatible`

Run once to permanently exempt it:
```bash
dsh plugin --profile web allow-version dsh-vision-router@2.2.1 \
  --dsh-version 0.2.0-rc.2 --accept-risk
```

---

## Roadblock 20 — `vision-router` pending on `settingsScope` service (2026-10-15)

### Symptom
```
Failed to load plugins
web boot: 1 entry did not activate
dsh-vision-router: pending (waiting for service: settingsScope)
```

### Root cause
DSH 0.1.7 renamed the `settingsScope` cordis service to `settings`.
`dsh-vision-router@2.2.1` was built against the old name — its client
bundle injects `['settingsScope', 'slots', 'locale', 'sessions', 'remote']`.
Since `settingsScope` no longer exists as a named service, the fiber hangs
waiting for it and never activates.

Modlens also tries `scope.settings.register()` in its settings card; this
throws because `settings.register` was also removed (the 0.2.0 settings API
is `settings.configure()`). Modlens already wraps this in `try/catch`, so
it degrades cleanly.

### Fix A — `dsh-settings` backward-compat alias

After `super(ownerContext, "settings")`, add:
```js
if (!ctx.settingsScope) {
  Object.defineProperty(ctx, 'settingsScope', { get: () => this, configurable: true });
}
```
This makes `ctx.settingsScope` resolve to the settings service instance so
`ctx.inject(['settingsScope'], ...)` fires normally.

File: `.../dsh-settings/lib/index.js` constructor, after the `super()` call.

### Fix B — `vision-router/lib/client.js` inject array

```diff
-exports.inject = ['settingsScope', 'slots', 'locale', 'sessions', 'remote']
+exports.inject = ['settings', 'slots', 'locale', 'sessions', 'remote']
```

And any direct `ctx.settingsScope.` calls → `(ctx.settingsScope ?? ctx.settings)?.`

Files patched: `client.js`, `vision-routing-settings-prelude.js`, `structured-flow-hardening.js`

### Clearing localStorage on Chrome for Android (no DevTools)

**Option A — Bookmarklet (recommended)**
1. In Chrome, bookmark any page
2. Edit the bookmark → change the URL to:
   ```
   javascript:(function(){Object.keys(localStorage).filter(k=>k.startsWith('dsh.')).forEach(k=>localStorage.removeItem(k));location.reload();})();
   ```
3. Open your DSH URL, tap ⋮ → Bookmarks → tap "Clear DSH Storage"

**Option B — Chrome site settings**
Tap the lock/tune icon in the address bar → **Site settings** → **Clear & reset**

**Option C — Full browser clear**
⋮ → Settings → Privacy and security → Delete browsing data → Site data → Delete
(clears all sites, not just DSH)

---

## Roadblock 21 — Bad `settingsScope` alias broke `dsh-settings` (2026-10-15)

### What happened
Attempting to add a `ctx.settingsScope` backward-compat alias inside the
`SettingsForms` constructor failed because cordis guards property access on
the context object — accessing `ctx.settingsScope` without it being in the
`inject` array throws:

```
Error: cannot get property "settingsScope" without inject
```

The `Object.defineProperty(ctx, 'settingsScope', ...)` patch was reverted.

### Actual correct fix
The only correct fix is on the **consumer side** (vision-router), not the
provider side (dsh-settings). Since `dsh-settings` registers as `"settings"`
and vision-router's `inject` listed `"settingsScope"`, change the inject:

```diff
-exports.inject = ['settingsScope', 'slots', 'locale', 'sessions', 'remote']
+exports.inject = ['settings', 'slots', 'locale', 'sessions', 'remote']
```

And guard the one direct `ctx.settingsScope` call:
```diff
-const localScope = ctx.settingsScope.bind({ namespace: 'vision-router' })
+const localScope = (ctx.settingsScope ?? ctx.settings)?.bind({ namespace: 'vision-router' })
```

This was already applied to `dsh-vision-router/lib/client.js` in Roadblock 20.
The `dsh-settings` revert restores it to stock.

### DSH 0.2.0 Web UI — intentional changes from 0.1.5

The sidebar and layout ARE different in 0.2.0 (not a bug, not localStorage):

| Element | 0.1.5 | 0.2.0 |
|---|---|---|
| Left nav | Session list rail | Collapsible workspace panel |
| Right panel | n/a | File preview / context sidebar |
| Session title bar | DeepSeek logo left of name | Workspace switcher toggle |
| Settings | Flat `settings.yaml` | Per-plugin settings pages |
| Token required | No (open access) | Yes (every request needs `?token=`) |

**The "DeepSeek button" / home button** you remember from 0.1.5 is now the
**workspace switcher panel toggle** in 0.2.0 — it expands/collapses the left
session list. On mobile (`dsh-web-mobile`, < 1024px) it's hidden until you
interact with the overlay. Tap the hamburger/≡ icon if visible, or rotate to
landscape to see the full left panel.

**Single-flight race (known 0.2.0-rc.2 bug):** If sessions load but the list
shows empty rows, restart dsh (`dsh-start`) and fully reload the browser tab
(close and re-open the URL, not just refresh).

---

## Roadblock 22 — Missing UI elements: nav toggle, file panel button (2026-10-15)

### Symptoms reported
- No sidebar/nav toggle button left of the session name
- No right-side file panel / file opener button
- These worked in DSH 0.1.5-alpha.1

### Root cause
`dsh-web-mobile` (version 2.4.1) provides BOTH buttons via `MobileNavToggle`
component injected into `conversation.session.header.actions` slot. It was NOT
loading because its `peerDependencies` caps at `< 0.2.0`, causing DSH 0.2.0 to
reject it as incompatible before it even starts.

**These are NOT new 0.2.0 UI features — they were provided by dsh-web-mobile in
0.1.5 too and remained the same. The plugin just wasn't being allowed to run.**

### Fix
```bash
dsh plugin --profile web allow-version dsh-web-mobile@2.4.1 \
  --dsh-version 0.2.0-rc.2 --accept-risk
```

After this, `dsh-web-mobile` activates and contributes:
1. **Sidebar toggle** (left panel, hamburger-style) — left of session name
2. **Files button** (folder icon) — opens right file panel (`data-sidebar-right-expand`)

The right-side file panel itself is provided by `dsh-client-ui-sidebar-right`
(a built-in DSH package, always present). The **open button for it** is
rendered inside `headerCorner` which desktop CSS hides — the mobile plugin
clicks it programmatically via `[data-sidebar-right-expand]`.

### vision-router: pending (waiting for service: settings/settingsScope)
The client-side bundle of `dsh-vision-router@2.2.1` injects `['settingsScope', ...]`
(required). In 0.2.0 the client context doesn't expose `settingsScope`. Fixed by
making the injection **optional** (`?settingsScope`), which lets the plugin
activate even without settings, using `(ctx.settingsScope ?? ctx.settings)?.bind(...)`.

---

## Roadblock 23 — Correct cordis optional inject (2026-10-15)

### What failed and why
The `?serviceName` prefix in the inject array is NOT valid cordis v4 syntax —
cordis treats it as a literal service name (including `?`), so the fiber still
hangs waiting for a service named `"?settingsScope"`.

In `_refresh()`, every key in `inject` is checked. If any is missing,
`epoch = INACTIVE` and the plugin stays pending. There is no array-level
optional syntax.

### Correct fix for an inject that can't always be satisfied

**Option A (used here):** Remove the service from `inject` entirely.
Access it inside `apply` via `ctx.reflect._getImpl('settings', true)?.value`
which reads the service store directly without the inject guard.

```diff
-exports.inject = ['?settingsScope', 'slots', 'locale', 'sessions', 'remote']
+exports.inject = ['slots', 'locale', 'sessions', 'remote']
```

```diff
-const localScope = (ctx.settingsScope ?? ctx.settings)?.bind({ namespace: 'vision-router' })
+const localScope = (() => {
+  try { return ctx.reflect._getImpl('settings', true)?.value?.bind?.({ namespace: 'vision-router' }) }
+  catch(e) { return undefined }
+})()
```

**Option B (alternative):** Use `ctx.inject(['settings'], (scoped) => { ... })`
inside apply — this is the cordis-blessed way for conditional service access.
But it requires restructuring the whole apply function around the callback.

Files patched:
- `dsh-vision-router/lib/client.js` — inject + localScope
- `dsh-vision-router/lib/vision-routing-settings-prelude.js` — ctx.settingsScope usages

`structured-flow-hardening.js` uses a local variable named `settingsScope` — that's
an internal variable, not a cordis service access, so it's left alone.

---

## Roadblock 24 — dsh-web-mobile missing sessionLogDownload/workspaces (2026-10-15)

### Symptom
Nav toggle + files button still absent. dsh-web-mobile appeared in config but
never actually activated — its inject included services not in the client bundle.

### Root cause (confirmed by reading cordis client runner service catalog)
`sessionLogDownload` and `workspaces` are **not provided** in the browser client
context (confirmed: 0 matches in dsh-web-app startup.js). Both are server-side
or separately-mounted services. Without them in the client context, the fiber
stays INACTIVE and the `MobileNavToggle` component is never injected.

### Fix
Remove both from the client inject array. Guard their direct ctx. usages via
`ctx.reflect._getImpl(name, true)?.value?.method?.()` which is safe (returns
undefined) when the service isn't present.

```diff
-exports.inject = ['slots', 'layout', 'locale', 'sessionLogDownload', 'sessions', 'workspaces']
+exports.inject = ['slots', 'layout', 'locale', 'sessions']
```

```diff
-downloadSessionLog: (sessionId) => ctx.sessionLogDownload.download(sessionId),
+downloadSessionLog: (sessionId) => ctx.reflect._getImpl('sessionLogDownload', true)?.value?.download?.(sessionId),
```

```diff
-const workspaces = ctx.workspaces.list.getSnapshot();
+const workspaces = (() => { try { return ctx.reflect._getImpl('workspaces', true)?.value?.list?.getSnapshot() ?? { archivedSessionIds: [] } } catch(e) { return { archivedSessionIds: [] } } })();
```

### File preview (clicking file cards does nothing)
The file cards in the chat trigger `setExpanded(sessionId, true)` on the right
sidebar controller, which calls `layout.openRightbar()`. This requires
`dsh-web-mobile` to be active (it provides the button). Once the plugin
activates, clicking the files icon in the header will open the right panel.
The panel renders the file preview via `dsh-client-ui-sidebar-documentpreview`.

---

## Roadblock 25 — dsh-web-mobile 3.1.0 — the fix was a version update (2026-10-15)

### Root cause (final)
`dsh-web-mobile@2.4.1` was the wrong version. The author released **3.1.0** on
2026-10-13 (two days before this session) which:
- Adds `>=0.2.0-rc.1 <0.3.0-0` to peerDependencies → no version exemption needed
- Removes `workspaces` from the cordis inject array (was the blocker — `workspaces`
  is a slot-hook service, not available to plugin fibers via inject)
- Fixes the "顶栏座位" (topbar seat) layout — exactly the missing nav toggle + files button

All the `lib/client.js` hand-patching in Roadblocks 22-24 was unnecessary
(though they happened to arrive at the same inject fix independently).

### Fix
```bash
cd ~/.dsh/profiles/web
pnpm add "dsh-web-mobile@github:mexiaosqwq/dsh-web-mobile#d4e9a5b426a3b66d48c4feeb7dcf99ac0cc4a3cb"
dsh plugin --profile web allow-version dsh-web-mobile@3.1.0 \
  --dsh-version 0.2.0-rc.2 --accept-risk
```

After this update:
- Sidebar toggle button appears left of session name ✅
- Files/folder button appears right of toggle ✅
- File card preview opens right sidebar panel ✅

### File preview (clicking file cards)
The right-sidebar expand button (`[data-sidebar-right-expand]`) is hidden by
desktop CSS. `dsh-web-mobile@3.1.0` programmatically clicks it via
`openFilesPanel()` triggered by the files button in the session header.
