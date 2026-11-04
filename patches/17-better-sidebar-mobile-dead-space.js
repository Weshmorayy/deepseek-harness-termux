#!/usr/bin/env node
/*
 * 17-better-sidebar-mobile-dead-space — Termux / android (all mobile browsers)
 * ============================================================================
 * SYMPTOM
 *   Confirmed by A/B on 2026-10-17: with `dsh-better-sidebar` mounted, the
 *   mobile UI hugs the top of the screen with a large blank band **below the
 *   composer**. Disabling the plugin made the gap disappear; re-enabling it
 *   brings it back. The gap is intermittent and tends to appear after typing.
 *
 * MECHANISM (read from lib/client.js, v0.26.0)
 *   better-sidebar is the single writer of `--dsh-sidebar-height` on
 *   documentElement, and its own injected CSS spends it as reserved space under
 *   the conversation column:
 *
 *       #root [data-dsh-center-col] { margin-bottom: var(--dsh-sidebar-height, 0px); }
 *
 *   The value is produced by:
 *
 *       writeGeometry(bottomOpen === true ? height + keyboardInset : 0)
 *
 *   with
 *
 *       const inset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
 *       setKeyboardInset(inset > 1 ? Math.round(inset) : 0);
 *
 *   `keyboardInset` is only refreshed from `visualViewport` "resize"/"scroll".
 *   On Android the FINAL visualViewport event as the soft keyboard closes is not
 *   guaranteed to arrive, so the inset stays at the keyboard's height. It is
 *   then added to the push on every re-run of the writer effect, reserving a
 *   dead band that never clears — exactly the reported symptom, and exactly why
 *   it is intermittent and correlates with typing.
 *
 * FIX (three surgical edits, all in the same component)
 *   1. Only credit `keyboardInset` when an editable is ACTUALLY focused. No
 *      focused input/textarea/contenteditable means no soft keyboard can be up,
 *      so the inset must be 0 regardless of what a stale measurement says. This
 *      removes the failure mode at its root rather than chasing events.
 *   2. Re-measure on more signals, including `focusin`/`focusout` on the
 *      document, `window.resize` and `orientationchange`, plus a short
 *      convergence timer after each visualViewport event — so the state settles
 *      even when the final event is missed.
 *   3. Defensively clamp the written push to the live viewport so no arithmetic
 *      slip can reserve more than the screen.
 *
 *   The workbench itself is untouched: while an editor is focused and the panel
 *   is open, the push is still `height + inset`, so the keyboard does not cover
 *   the workbench.
 *
 * IDEMPOTENT — safe to re-run; exits 0 when already applied.
 * Wired into install.sh after patch 16. Re-run install.sh after a DSH upgrade.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const MARKER = "[mobile-dead-space]";

const require = createRequire(import.meta.url);

function locateClient() {
  const candidates = [];
  try {
    const pkg = require.resolve("dsh-better-sidebar/package.json");
    candidates.push(join(dirname(pkg), "lib", "client.js"));
  } catch {
    /* fall through */
  }
  candidates.push(
    "/data/data/com.termux/files/home/.dsh/profiles/web/node_modules/dsh-better-sidebar/lib/client.js",
  );
  return candidates;
}

const TARGET = (() => {
  for (const c of locateClient()) {
    try {
      require("node:fs").accessSync(c);
      return c;
    } catch {
      /* try next */
    }
  }
  return null;
})();

if (TARGET === null) {
  console.error("[17] dsh-better-sidebar/lib/client.js not found — nothing to do.");
  process.exit(1);
}

let src = await readFile(TARGET, "utf8");

if (src.includes(MARKER)) {
  console.log(`[17] already applied — ${TARGET}`);
  process.exit(0);
}

/* ── edit 1: gate the inset on a focused editable ───────────────────────── */
const M_OLD =
  "\t\t\t\tconst measure = () => {\n" +
  "\t\t\t\t\tframe = null;\n" +
  "\t\t\t\t\tconst inset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));\n" +
  "\t\t\t\t\tsetKeyboardInset(inset > 1 ? Math.round(inset) : 0);\n" +
  "\t\t\t\t\tsetVisualViewportHeight(Math.max(0, Math.round(vv.height)));\n" +
  "\t\t\t\t};";

const M_NEW =
  "\t\t\t\t// " +
  MARKER +
  " A soft keyboard can only exist while an editable is focused, so\n" +
  "\t\t\t\t// never credit a measured inset without one. Without this gate a missed\n" +
  "\t\t\t\t// final visualViewport event leaves keyboardInset stuck at the keyboard's\n" +
  "\t\t\t\t// height, and the writer below keeps adding it to --dsh-sidebar-height —\n" +
  "\t\t\t\t// reserving a dead band under the composer that never clears.\n" +
  "\t\t\t\tconst editing = () => {\n" +
  "\t\t\t\t\tconst el = document.activeElement;\n" +
  "\t\t\t\t\tif (el === null || el === void 0) return false;\n" +
  "\t\t\t\t\tconst tag = el.tagName;\n" +
  "\t\t\t\t\treturn tag === \"INPUT\" || tag === \"TEXTAREA\" || tag === \"SELECT\" || el.isContentEditable === true;\n" +
  "\t\t\t\t};\n" +
  "\t\t\t\tconst measure = () => {\n" +
  "\t\t\t\t\tframe = null;\n" +
  "\t\t\t\t\tconst raw = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));\n" +
  "\t\t\t\t\tsetKeyboardInset(editing() && raw > 1 ? Math.round(raw) : 0);\n" +
  "\t\t\t\t\tsetVisualViewportHeight(Math.max(0, Math.round(vv.height)));\n" +
  "\t\t\t\t};";

/* ── edit 2: converge on more signals ───────────────────────────────────── */
const L_OLD =
  "\t\t\t\tconst onResize = () => {\n" +
  "\t\t\t\t\tif (frame === null) frame = requestAnimationFrame(measure);\n" +
  "\t\t\t\t};\n" +
  "\t\t\t\tvv.addEventListener(\"resize\", onResize);\n" +
  "\t\t\t\tvv.addEventListener(\"scroll\", onResize);\n" +
  "\t\t\t\tmeasure();\n" +
  "\t\t\t\treturn () => {\n" +
  "\t\t\t\t\tvv.removeEventListener(\"resize\", onResize);\n" +
  "\t\t\t\t\tvv.removeEventListener(\"scroll\", onResize);\n" +
  "\t\t\t\t\tif (frame !== null) cancelAnimationFrame(frame);\n" +
  "\t\t\t\t};";

const L_NEW =
  "\t\t\t\tlet settle = null;\n" +
  "\t\t\t\tconst onResize = () => {\n" +
  "\t\t\t\t\tif (frame === null) frame = requestAnimationFrame(measure);\n" +
  "\t\t\t\t\t// " +
  MARKER +
  " The final visualViewport event as the keyboard closes is not\n" +
  "\t\t\t\t\t// guaranteed on Android; re-measure once more shortly after so the state\n" +
  "\t\t\t\t\t// converges instead of sticking at the keyboard-open inset.\n" +
  "\t\t\t\t\tif (settle !== null) clearTimeout(settle);\n" +
  "\t\t\t\t\tsettle = setTimeout(measure, 250);\n" +
  "\t\t\t\t};\n" +
  "\t\t\t\tvv.addEventListener(\"resize\", onResize);\n" +
  "\t\t\t\tvv.addEventListener(\"scroll\", onResize);\n" +
  "\t\t\t\twindow.addEventListener(\"resize\", onResize);\n" +
  "\t\t\t\twindow.addEventListener(\"orientationchange\", onResize);\n" +
  "\t\t\t\tdocument.addEventListener(\"focusin\", onResize, true);\n" +
  "\t\t\t\tdocument.addEventListener(\"focusout\", onResize, true);\n" +
  "\t\t\t\tmeasure();\n" +
  "\t\t\t\treturn () => {\n" +
  "\t\t\t\t\tvv.removeEventListener(\"resize\", onResize);\n" +
  "\t\t\t\t\tvv.removeEventListener(\"scroll\", onResize);\n" +
  "\t\t\t\t\twindow.removeEventListener(\"resize\", onResize);\n" +
  "\t\t\t\t\twindow.removeEventListener(\"orientationchange\", onResize);\n" +
  "\t\t\t\t\tdocument.removeEventListener(\"focusin\", onResize, true);\n" +
  "\t\t\t\t\tdocument.removeEventListener(\"focusout\", onResize, true);\n" +
  "\t\t\t\t\tif (frame !== null) cancelAnimationFrame(frame);\n" +
  "\t\t\t\t\tif (settle !== null) clearTimeout(settle);\n" +
  "\t\t\t\t};";

/* ── edit 3: clamp the written push to the live viewport ────────────────── */
const W_OLD =
  "\t\t\t\twriteGeometry(snapshot.state?.bottomOpen === true ? height + keyboardInset : 0);";

const W_NEW =
  "\t\t\t\t// " +
  MARKER +
  " Clamp to the live viewport: no arithmetic slip may reserve more\n" +
  "\t\t\t\t// space than the screen actually has.\n" +
  "\t\t\t\tconst push = snapshot.state?.bottomOpen === true ? height + keyboardInset : 0;\n" +
  "\t\t\t\twriteGeometry(Math.max(0, Math.min(push, Math.max(0, window.innerHeight - 120))));";

let ok = true;
for (const [label, oldS, newS] of [
  ["measure gate", M_OLD, M_NEW],
  ["listener set", L_OLD, L_NEW],
  ["writer clamp", W_OLD, W_NEW],
]) {
  const hits = src.split(oldS).length - 1;
  if (hits !== 1) {
    console.error(`[17] ${label}: expected 1 occurrence, found ${hits} — aborting, review upstream.`);
    ok = false;
    continue;
  }
  src = src.replace(oldS, newS);
}
if (!ok) process.exit(1);

await writeFile(TARGET, src, "utf8");

/* ── verify ─────────────────────────────────────────────────────────────── */
const after = await readFile(TARGET, "utf8");
const checks = {
  marker: after.includes(MARKER),
  gated: after.includes("setKeyboardInset(editing() && raw > 1 ? Math.round(raw) : 0);"),
  extraListeners: after.includes('window.addEventListener("orientationchange", onResize);'),
  settle: after.includes("settle = setTimeout(measure, 250);"),
  clamped:
    after.includes("writeGeometry(Math.max(0, Math.min(push, Math.max(0, window.innerHeight - 120))));") &&
    !after.includes(W_OLD),
};
const allOk = Object.values(checks).every(Boolean);

console.log(`[17] patched ${TARGET}`);
console.log(`[17] checks: ${JSON.stringify(checks)}`);
console.log(`[17] verification: ${allOk ? "OK" : "FAILED — inspect manually"}`);
process.exit(allOk ? 0 : 1);
