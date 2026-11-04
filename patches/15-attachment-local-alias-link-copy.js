#!/usr/bin/env node
/*
 * 15-attachment-local-alias-link-copy — Termux / android-arm64
 * ============================================================================
 * SYMPTOM
 *   Sending an image from the DSH Web GUI fails with:
 *       Error: Unable to persist attachment.
 *   Raised as AttachmentError code ATTACHMENT_WRITE_FAILED from
 *   @deepseek-ai/dsh-attachment-local. Happens on EVERY new attachment,
 *   including in a freshly cloned session, and is why the model cannot read
 *   an attached image at all.
 *
 * ROOT CAUSE
 *   There are TWO hard-link sites in dsh-attachment-local/lib/index.js, and
 *   patch 12 fixed only one of them.
 *
 *   1) publishStagedObject()  — link(staged.path, target)
 *      Moving a staging file into place. Patch 12 added the EACCES/EPERM
 *      fallback here (rename). OK.
 *
 *   2) publishImmutableAlias() — link(source, target)
 *      Publishing the friendly display-name alias for an already-committed
 *      content-addressed object. Its catch tolerates ONLY `EEXIST`:
 *
 *        if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
 *
 *      but on Termux `link(2)` is denied outright on the app-data partition:
 *
 *        EACCES: permission denied, link '.../objects/xx/<sha>' -> '.../files/xx/<sha>/name.jpg'
 *
 *      EACCES is not EEXIST, so it rethrows into
 *        throw new AttachmentError("Unable to persist attachment.", "ATTACHMENT_WRITE_FAILED", …)
 *
 *      Both saveFileVerbatim() and saveFileStreamVerbatim() call
 *      publishImmutableObject() (step 1, works) and THEN
 *      publishImmutableAlias() (step 2, throws) — so every attachment save
 *      fails after the object has already been written. That is exactly the
 *      shape observed on disk: ~/.dsh/attachments/v1/objects/ gains fresh
 *      files while .../files/ stays frozen at its last good date.
 *
 * FIX
 *   Give publishImmutableAlias() the same EACCES/EPERM tolerance, using
 *   copyFile() rather than rename(). This distinction matters: here `source`
 *   is the canonical content-addressed object and is still owned by the
 *   originating session, so it must NOT be moved. The alias is
 *   content-addressed too (same sha256), so an independent copy is
 *   semantically identical and keeps the digest verification meaningful.
 *
 *   copyFile() is verified to work on this filesystem where link() is denied.
 *
 * IDEMPOTENT — safe to re-run; exits 0 when already applied.
 * Wired into install.sh after patch 14. Re-run install.sh after a DSH upgrade.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const MARKER = "[Termux/android-arm64] alias";

const require = createRequire(import.meta.url);

function locateLib() {
  const candidates = [];
  try {
    // The package that the DSH host actually loads.
    const pkg = require.resolve("@deepseek-ai/dsh-attachment-local/package.json");
    candidates.push(join(dirname(pkg), "lib", "index.js"));
  } catch {
    /* not resolvable from here; fall back to the known global location */
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
  console.error("[15] dsh-attachment-local/lib/index.js not found — nothing to do.");
  process.exit(1);
}

let src = await readFile(TARGET, "utf8");

if (src.includes(MARKER)) {
  console.log(`[15] already applied — ${TARGET}`);
  process.exit(0);
}

/* ── 1. make sure copyFile is imported ───────────────────────────────────── */
const IMPORT_OLD =
  'import { chmod, link, lstat, mkdir, open, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";';
const IMPORT_NEW =
  'import { chmod, copyFile, link, lstat, mkdir, open, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";';

if (src.includes(IMPORT_OLD)) {
  src = src.replace(IMPORT_OLD, IMPORT_NEW);
} else if (!/import \{[^}]*\bcopyFile\b[^}]*\} from "node:fs\/promises";/.test(src)) {
  console.error("[15] could not find the node:fs/promises import — aborting.");
  process.exit(1);
}

/* ── 2. patch the publishImmutableAlias() link catch ────────────────────── */
const ANCHOR = "\t\t\tawait link(source, target);";
const anchorAt = src.indexOf(ANCHOR);
if (anchorAt === -1) {
  console.error(
    "[15] anchor `await link(source, target);` not found — upstream changed, review manually.",
  );
  process.exit(1);
}

const catchAt = src.indexOf("} catch (error) {", anchorAt);
if (catchAt === -1) {
  console.error("[15] catch block after the alias link() not found — aborting.");
  process.exit(1);
}

const tail = "\t\tawait chmod(target, 256);";
const tailAt = src.indexOf(tail, catchAt);
if (tailAt === -1) {
  console.error("[15] end-of-catch anchor (chmod) not found — aborting.");
  process.exit(1);
}

const NEW_CATCH = `} catch (error) {
			// ${MARKER} link() is denied on the app data partition (EACCES), and it is
			// not EEXIST, so the stock code rethrows into "Unable to persist
			// attachment.". Unlike publishStagedObject we must NOT rename here:
			// \`source\` is the canonical content-addressed object and is still owned
			// by the originating session, so copy it instead. The alias is
			// content-addressed by the same sha256, so a copy is equivalent.
			if (error instanceof Error && "code" in error && (error.code === "EACCES" || error.code === "EPERM")) {
				const exists = await lstat(target).then(() => true, () => false);
				if (exists) {
					if (await digestFile(target) !== sha256) throw new AttachmentError("Stored attachment failed integrity verification.", "ATTACHMENT_CORRUPT");
				} else await copyFile(source, target);
			} else {
				/* v8 ignore next -- Private same-filesystem directories make EEXIST the only recoverable link race. */
				if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
				if (await digestFile(target) !== sha256) throw new AttachmentError("Stored attachment failed integrity verification.", "ATTACHMENT_CORRUPT");
			}
		}
`;

src = src.slice(0, catchAt) + NEW_CATCH + src.slice(tailAt);

await writeFile(TARGET, src, "utf8");

/* ── 3. verify ──────────────────────────────────────────────────────────── */
const after = await readFile(TARGET, "utf8");
const ok =
  after.includes(MARKER) &&
  /\bcopyFile\b/.test(after.split("\n").find((l) => l.includes("node:fs/promises")) ?? "") &&
  after.includes("await copyFile(source, target);");

console.log(`[15] patched ${TARGET}`);
console.log(`[15] verification: ${ok ? "OK" : "FAILED — inspect manually"}`);
process.exit(ok ? 0 : 1);
