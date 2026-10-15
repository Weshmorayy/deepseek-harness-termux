# Upgrading DSH to `0.2.0-rc.2` on Termux / Android arm64

**Date:** 2026-10-15  
**From:** `0.1.5-alpha.1`  
**To:** `0.2.0-rc.2` (`npm latest` as of this date)

> ⚠️ **RC caveat:** `npm latest` resolves to `0.2.0-rc.2`, a release candidate,
> not a GA release. It is stable enough for daily use but expect rough edges.

---

## Prerequisites

```bash
termux-wake-lock          # prevent Android from killing the process
df -h $HOME               # need ≥ 3 GB free
dsh --version             # note your current version
```

---

## Step 1 — Backup

```bash
BK="$HOME/.dsh/_backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BK"
cp "$HOME/.dsh/settings.yaml"         "$BK/settings.yaml"        2>/dev/null || true
cp "$HOME/.dsh/.credentials.yaml"     "$BK/.credentials.yaml"    2>/dev/null || true
cp -r "$HOME/.dsh/profiles"           "$BK/profiles"
cp -r "$HOME/.dsh/sessions"           "$BK/sessions"
echo "BACKUP OK: $BK"
```

---

## Step 2 — Pre-upgrade config fixes (MUST apply before install)

### 2.1 — Fix `deepseek-official.baseURL`

`0.2.0` drops the Chat Completions protocol path; the official DeepSeek
provider is Messages API only.

```bash
sed -i 's|baseURL: https://api.deepseek.com/v1|baseURL: https://api.deepseek.com/anthropic|' \
    "$HOME/.dsh/settings.yaml"
grep "api.deepseek.com" "$HOME/.dsh/settings.yaml" | head -2
# Must show: https://api.deepseek.com/anthropic
```

### 2.2 — Fix `spill-policy.maxInlineBytes` → `maxInlineTokens`

`maxInlineBytes` is **removed** in 0.2.0 and causes a parse error on boot.

```bash
PATCH="$HOME/.dsh/profiles/web/cordis.patch.yml"
sed -i 's/maxInlineBytes:/maxInlineTokens:/g' "$PATCH"
# Also rescale: 20000 bytes ≈ 5000 tokens; keep some headroom
sed -i 's/maxInlineTokens: 20000/maxInlineTokens: 6000/' "$PATCH"
grep "maxInline" "$PATCH"
# Must show: maxInlineTokens: 6000
```

---

## Step 3 — Stop the running dsh

```bash
pkill -f "dsh web" 2>/dev/null; sleep 2
dsh --version   # confirm no dsh web is running
```

---

## Step 4 — Install 0.2.0-rc.2

```bash
npm install -g @deepseek-ai/dsh@latest \
    --ignore-scripts \
    --fetch-timeout=600000 \
    --fetch-retries=5
npm ls -g @deepseek-ai/dsh --depth=0   # must show 0.2.0-rc.2
```

> **Why `--ignore-scripts`?** koffi 3.1.1 (bundled in DSH) fails to compile
> on Android arm64 — Bionic's `statx` struct conflicts with koffi's glibc-style
> expectation. We install a prebuilt instead (Step 5).

---

## Step 5 — Fix native addons (Termux-specific)

### 5.1 — Upgrade koffi to 3.3.0 + install android-arm64 prebuilt

```bash
DSH_MOD="$(npm root -g)/@deepseek-ai/dsh/node_modules"
cd "$DSH_MOD"
npm install koffi@3.3.0 @koromix/koffi-android-arm64@3.3.0 \
    --no-save --ignore-scripts
# Verify:
node -e "const k=require('$DSH_MOD/koffi/index.js'); console.log('koffi OK:', k.version)"
```

Expected output: `koffi OK: 3.3.0`

### 5.2 — Create `node-addon-require-builtin-android-arm64` JS shim

`dsh-app-boot` loads Node.js internals for profile resolution via this native
addon. No android-arm64 binary is published. Since DSH runs with
`--expose-internals`, a JS shim that wraps `require()` satisfies all
validation checks:

```bash
SHIM="$(npm root -g)/@deepseek-ai/dsh/node_modules/node-addon-require-builtin-android-arm64"
mkdir -p "$SHIM"

cat > "$SHIM/package.json" << 'JSON'
{
  "name": "node-addon-require-builtin-android-arm64",
  "version": "0.1.9",
  "description": "Termux JS shim — uses --expose-internals",
  "main": "index.js"
}
JSON

cat > "$SHIM/index.js" << 'JS'
'use strict';
// Termux/Android shim for node-addon-require-builtin.
// Works because dsh is launched with --expose-internals, making
// require('internal/...') work without a native addon.
function requireBuiltin(id) { return require(id); }
function isAllowedInternalId() { return true; }
function getNativeBindingInfo() {
  return { mode: 'unrestricted', product: 'require-builtin', backend: 'napi', abi: 'napi-v9' };
}
module.exports = { requireBuiltin, isAllowedInternalId, getNativeBindingInfo };
JS
echo "Shim created OK"
```

### 5.3 — Fix the `dsh` bin shim

The new install overwrites `/usr/bin/dsh` with a broken shebang:

```bash
cat > /data/data/com.termux/files/usr/bin/dsh << 'SHIMEOF'
#!/data/data/com.termux/files/usr/bin/sh
if [ "$1" = "help" ]; then set -- "--help"; fi
exec node --expose-internals --max-old-space-size=2048 \
  /data/data/com.termux/files/usr/lib/node_modules/@deepseek-ai/dsh/lib/bin.js "$@"
SHIMEOF
chmod +x /data/data/com.termux/files/usr/bin/dsh
```

---

## Step 6 — Apply Android source patches

Re-run install.sh's patch section (or run install.sh with idempotent skip detection):

```bash
bash ~/deepseek-harness-termux/install.sh
# It will skip already-installed steps and re-apply any missing patches.
```

Alternatively, apply patches manually:
```bash
REPO=~/deepseek-harness-termux
DSH_PKGS="$(npm root -g)/@deepseek-ai/dsh/node_modules/@deepseek-ai"
for p in "$REPO"/patches/*.patch; do
  # (see install.sh apply_patch function for target mapping)
  echo "Patch: $(basename $p)"
done
```

---

## Step 7 — Verify

```bash
dsh --version
# Must print: 0.2.0-rc.2

dsh --profile web --dump-config > /dev/null 2>&1; echo "config: exit=$?"
# Must print: config: exit=0
# (dsh-vision-router warning is expected and non-fatal)

grep "maxInline" "$HOME/.dsh/profiles/web/cordis.patch.yml"
# Must show: maxInlineTokens: 6000

grep "api.deepseek.com" "$HOME/.dsh/settings.yaml.imported" 2>/dev/null \
 || grep "api.deepseek.com" "$HOME/.dsh/settings.yaml" 2>/dev/null
# Must show: https://api.deepseek.com/anthropic
```

---

## Step 8 — Start

```bash
dsh-start
# OR:
dsh web --no-open
# Wait ~25 seconds; open the printed token URL in your browser.
```

---

## Known issues after upgrade

| Issue | Severity | Workaround |
|---|---|---|
| `dsh-vision-router@2.2.1` incompatible | Medium | `dsh plugin allow-version dsh-vision-router@2.2.1` |
| `modlens` settings UI broken | Low | Cosmetic; plugin still loads |
| `dsh-bill` rpc degraded | Low | API at `/dsh-bill/api` still works |
| `dsh-web-search-exa` missing | Low | Built-in search works for DeepSeek account models |
| Web root returns 401 | Expected | Use full `?token=...` URL from `dsh-start` |
| Startup ~25s on Termux | Expected | Run `dsh-start` and wait |

---

## Rollback to 0.1.5-alpha.1

```bash
BK="/path/to/your/backup"   # set to your backup dir
pkill -f "dsh web" || true
npm install -g @deepseek-ai/dsh@0.1.5-alpha.1

cat > /data/data/com.termux/files/usr/bin/dsh << 'SHIMEOF'
#!/data/data/com.termux/files/usr/bin/sh
if [ "$1" = "help" ]; then set -- "--help"; fi
exec node --expose-internals --max-old-space-size=2048 \
  /data/data/com.termux/files/usr/lib/node_modules/@deepseek-ai/dsh/lib/bin.js "$@"
SHIMEOF
chmod +x /data/data/com.termux/files/usr/bin/dsh

cp -a "$BK/settings.yaml" "$HOME/.dsh/settings.yaml"
cp -a "$BK/.credentials.yaml" "$HOME/.dsh/.credentials.yaml" 2>/dev/null || true
rm -rf "$HOME/.dsh/profiles" && cp -a "$BK/profiles" "$HOME/.dsh/profiles"
dsh --version   # must print 0.1.5-alpha.1
```

---

## Shims installed (must survive future upgrades)

These files are **not** part of the standard DSH package. They are wiped by
`npm install -g @deepseek-ai/dsh` and must be reapplied. The `install.sh`
script handles this automatically on re-run.

| Path | Purpose |
|---|---|
| `/data/data/com.termux/files/usr/bin/dsh` | Termux-compatible shim with `--expose-internals` |
| `.../dsh/node_modules/koffi@3.3.0` | koffi upgraded from bundled 3.1.1 (no arm64 prebuilt) |
| `.../dsh/node_modules/@koromix/koffi-android-arm64@3.3.0` | koffi native `.node` binary |
| `.../dsh/node_modules/node-addon-require-builtin-android-arm64/` | Profile resolution JS shim |

---

## Post-upgrade fixes (applied 2026-10-15, after initial upgrade)

### Fix A — Session persistence EACCES on `.zstd` link (run after every DSH upgrade)

Two sites in `dsh-session-persistence-jsonl/lib/index.js` need patching:

```bash
DSH_SESH="$(npm root -g)/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js"

# 1. Add rename to imports (line 4)
sed -i 's/import { link, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, stat/import { link, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, stat/' "$DSH_SESH"

# 2. Wrap the internals.fs.link() call at ~line 2034 with EACCES→rename fallback
#    (patch -p1 with patches/02-session-persistence-link-rename.patch; if it fails,
#    apply the fix manually — see GUIDE.md Roadblock 19 for the exact diff)
```

The `.zstd` link error also comes from the `link(tmp, finalPath)` at ~line 3142 —
this is already handled by the original patch 02 (the hunk 2 succeeded).

### Fix B — Workspace archive sessionKnown check

```bash
DSH_WORK="$(npm root -g)/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-workspace/lib/index.js"
# Comment out the sessionKnown check — patch 06 hunk 1 failed on 0.2.0 new bundle
sed -i 's/if (!await this.sessionKnown(sessionId)) throw new WorkspaceUnknownSessionError(sessionId, "archive");/\/\/ [Termux] skip: if (!await this.sessionKnown(sessionId)) throw new WorkspaceUnknownSessionError(sessionId, "archive");/' "$DSH_WORK"
```

### Fix C — OpenRouter refresh model guard

In `~/.dsh/refresh-openrouter-models.mjs` around line 255–258, the guard that
prevents overwriting the file when the default model would be removed was too
strict — it also rejected catalog routes (which have no explicit `models:` list).
Fixed by checking `Array.isArray(route?.models) && route.models.length > 0` before
running the membership check.

### Fix D — Missing sidebar / navigation (browser localStorage)

DSH 0.2.0 changed the `localStorage` schema (`dsh.workspace.view.v5`). Old
cached state causes the sidebar and nav buttons to vanish.

**Fix:** DevTools → Application tab → Local Storage → `http://127.0.0.1:3080`
→ delete all `dsh.*` keys → hard reload (`Ctrl+Shift+R`).

The left-of-session-name button is the **workspace switcher panel toggle**.
On screens < 1024 px `dsh-web-mobile` hides the sidebar rail — widen the
window or rotate to landscape to restore it.

### Fix E — flock android crash

See `patches/09-node-addon-system-flock-android.patch` and `install.sh` step 5e.

### Fix F — dsh-vision-router version exemption

```bash
dsh plugin --profile web allow-version dsh-vision-router@2.2.1 \
  --dsh-version 0.2.0-rc.2 --accept-risk
```

---

## vision-router pending fix (2026-10-15)

### Root cause
DSH 0.1.7+ renamed service `settingsScope` → `settings`. `dsh-vision-router@2.2.1`
was built for the old name and hangs on boot waiting for a service that will
never arrive, causing "1 entry did not activate".

### Fixes (apply after each DSH upgrade)

**1. dsh-settings backward-compat alias:**
```bash
DSH_SETTINGS="$(npm root -g)/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-settings/lib/index.js"
# After super(ownerContext, "settings"), add the alias — see GUIDE.md Roadblock 20
```

**2. vision-router inject patch:**
```bash
VRCLIENT="$HOME/.dsh/profiles/web/node_modules/dsh-vision-router/lib/client.js"
sed -i "s/exports\.inject = \['settingsScope',/exports.inject = ['settings',/" "$VRCLIENT"
sed -i "s/ctx\.settingsScope\.bind/(ctx.settingsScope ?? ctx.settings)?.bind/g" "$VRCLIENT"
for f in vision-routing-settings-prelude.js structured-flow-hardening.js; do
  sed -i "s/ctx\.settingsScope\b/(ctx.settingsScope ?? ctx.settings)/g" \
    "$HOME/.dsh/profiles/web/node_modules/dsh-vision-router/lib/$f"
done
```

### Clear localStorage on Chrome for Android (no F12)

Bookmarklet — create a bookmark with this URL:
```
javascript:(function(){Object.keys(localStorage).filter(k=>k.startsWith('dsh.')).forEach(k=>localStorage.removeItem(k));location.reload();})();
```
Navigate to DSH, then tap ⋮ → Bookmarks → "Clear DSH Storage".

Or: tap the lock/tune icon in address bar → Site settings → Clear & reset.
