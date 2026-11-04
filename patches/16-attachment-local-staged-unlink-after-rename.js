#!/usr/bin/env node
/*
 * 16-attachment-local-staged-unlink-after-rename — Termux / android-arm64
 * ============================================================================
 * SYMPTOM
 *   Sending/reading an image fails with:
 *       Error: Unable to persist attachment.
 *   (AttachmentError, ATTACHMENT_WRITE_FAILED)
 *   and it is SIZE-INDEPENDENT and CONTENTS-DEPENDENT:
 *     a 37 KB image that the store already holds  -> works
 *     a 22 KB image that the store does not hold  -> fails
 *
 * ROOT CAUSE
 *   `publishStagedObject` in dsh-attachment-local/lib/index.js. Patch 12 added
 *   the Termux EACCES fallback, which MOVES the staging file into place with
 *   `rename()`. But the cleanup line right after it is unconditional:
 *
 *       } catch (error) {
 *         if (EACCES || EPERM) {
 *           const exists = await lstat(target)...
 *           if (exists) { /* verify *\/ }
 *           else await rename(staged.path, target);   // staging file is MOVED
 *         } else { /* EEXIST *\/ }
 *       }
 *       await unlink(staged.path);                     // <-- throws ENOENT here
 *
 *   After a successful rename, `staged.path` no longer exists, so `unlink`
 *   raises ENOENT. That escapes into the function's outer catch, which reports
 *   every non-AttachmentError as:
 *       new AttachmentError("Unable to persist attachment.", "ATTACHMENT_WRITE_FAILED")
 *
 *   So the fallback that was supposed to make writes WORK instead guarantees
 *   they FAIL — but only on the branch that actually renames.
 *
 *   Branch behaviour (reproduced against the real filesystem, byte for byte
 *   from this source — see ~/scratch/attach2/t.mjs):
 *
 *     target does NOT exist -> link EACCES -> rename -> unlink ENOENT
 *                            -> THROW "Unable to persist attachment."
 *     target ALREADY exists -> link EACCES -> lstat hits, no rename
 *                            -> unlink succeeds -> OK
 *
 *   Hence: already-stored content persists (dedupe path), genuinely new
 *   content never does. That is the whole "some images work, some don't"
 *   pattern — not a byte cap.
 *
 * FIX
 *   Route the cleanup through the module's own tolerant helper
 *   `removeTemporary(path)`, which already swallows cleanup errors:
 *
 *       async function removeTemporary(path) {
 *         await unlink(path).catch((cleanupError) => { ... });
 *       }
 *
 *   Semantics are preserved on every branch:
 *     - after a rename  : staging path is gone  -> ENOENT swallowed (the fix)
 *     - after a link    : staging file remains  -> removed exactly as before
 *     - after EEXIST    : staging file remains  -> removed exactly as before
 *
 * IDEMPOTENT — safe to re-run; exits 0 when already applied.
 * Wired into install.sh after patch 15. Re-run install.sh after a DSH upgrade.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const MARKER = "[Termux/android-arm64] staging cleanup after rename";

const require = createRequire(import.meta.url);

function locateLib() {
  const candidates = [];
  try {
    const pkg = require.resolve("@deepseek-ai/dsh-attachment-local/package.json");
    candidates.push(join(dirname(pkg), "lib", "index.js"));
  } catch {
    /* fall through to the known global path */
  }
  candidates.push(
    "/data/data/com.termux/files/usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-attachment-local/lib/index.js",
  );
  return candidates;
}

const TARGET = (() => {
  for (const c of locateLib()) {
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
  console.error("[16] dsh-attachment-local/lib/index.js not found — nothing to do.");
  process.exit(1);
}

let src = await readFile(TARGET, "utf8");

if (src.includes(MARKER)) {
  console.log(`[16] already applied — ${TARGET}`);
  process.exit(0);
}

// Anchor inside publishStagedObject only: the staged unlink that follows the
// rename fallback. publishImmutableAlias has no equivalent unlink, so this
// exact sequence occurs once.
const OLD = "\t\tawait unlink(staged.path);\n\t\tawait chmod(target, 256);";
const NEW =
  "\t\t// " +
  MARKER +
  " — `rename` above already MOVED the staging file, so a bare\n" +
  "\t\t// unlink here raises ENOENT and surfaces as \"Unable to persist attachment.\"\n" +
  "\t\t// removeTemporary() tolerates a missing staging name and is a no-op otherwise.\n" +
  "\t\tawait removeTemporary(staged.path);\n\t\tawait chmod(target, 256);";

const hits = src.split(OLD).length - 1;
if (hits !== 1) {
  console.error(
    `[16] expected exactly 1 occurrence of the staged-unlink sequence, found ${hits} — upstream changed, review manually.`,
  );
  process.exit(1);
}

src = src.replace(OLD, NEW);
await writeFile(TARGET, src, "utf8");

/* ── verify ─────────────────────────────────────────────────────────────── */
const after = await readFile(TARGET, "utf8");
const ok =
  after.includes(MARKER) &&
  after.includes("await removeTemporary(staged.path);") &&
  (after.split(OLD).length - 1) === 0;

console.log(`[16] patched ${TARGET}`);
console.log(`[16] verification: ${ok ? "OK" : "FAILED — inspect manually"}`);
process.exit(ok ? 0 : 1);
