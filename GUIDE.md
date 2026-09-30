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
└── scripts/
    ├── ai-status          ← system dashboard
    ├── ai-models          ← model table + refresh
    ├── ai-quota           ← quota status
    ├── ai-health          ← provider ping check
    ├── freellmapi-start   ← start API gateway
    └── freellmapi-client  ← start dashboard UI

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
