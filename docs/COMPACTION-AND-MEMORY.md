# Compaction & Memory — Tuned Values, Invariants, and How It Works

> Operational reference for this machine (DSH 0.2.0-rc.2, web profile).
> Full research: `~/.dsh-research/MEMORY-SOLUTIONS-2026-10-15.md`.
> Config lives in `~/.dsh/profiles/web/cordis.patch.yml` — validate every edit
> with `dsh --profile web --dump-config` (must exit 0). Restart required after
> changes: `bash ~/deepseek-harness-termux/install.sh && dsh-start`.

---

## 1. The one invariant that has already cost money

`dsh-compaction-basic` computes its trigger as:

```
threshold = min( thresholdRatio × contextWindow ,
                 contextWindow − requestMaxTokens − 65536_headroom )
```

`requestMaxTokens` is the **catalog row's** completion reserve (`maxTokens`
field in the llm-pi-ai catalog / cordis.patch.yml model rows) — NOT the
summarizer cap. If a big-window model's row sets `maxTokens` near its window,
the second branch collapses and compaction fires constantly.

**Rule: on any row with contextWindow ≥ ~500k, keep catalog `maxTokens: 65536`.**

Post-mortem (2026-10-15, continental session): `deepseek/deepseek-v4.1-flash`
row had `maxTokens: 943718` (90% of the 1,048,576 window) → threshold =
1,048,576 − 943,718 − 65,536 = **39,322**, while live context sat at 41–44k →
1,308 compaction attempts / 76 turns (~7 min each, ~30k input + ~9.4k output
billed per cycle), shadowing only 8–14k tokens each time. Fixed by setting
**five** ~1M-window rows (`deepseek-v4.1-flash`, `gemini-4-argon:batch`,
`muse-wonder`, `ember-1`, a `~deepseek/…latest` alias) to 65536 → threshold
restored to **157,286**.

Related trap: a stale session resumes with its **last stored request header**,
so the old trigger can fire one more cycle even after a config fix + restart.
Let that one cycle complete (don't abort); new chats start clean.

## 2. The two `maxTokens` — different jobs

| Knob | Where | Value now | Job |
|---|---|---|---|
| Catalog `maxTokens` | per-model row | 65536 on big-window rows; others untouched | Output reserve per request. Large value ⇒ smaller pressure budget ⇒ lower trigger. Billing is per actual token — the cap itself is free |
| Summarizer `maxTokens` | compaction block (+ mirror row for `space-bunny-alpha`) | 16384 (was 2048 → 8192) | Cap on the summary the compactor writes. Measured outputs run 9.1–9.5k ⇒ anything below ~10k truncates ("incomplete checkpoint") and the fold silently fails |

## 3. Current tuned compaction (global block)

```
thresholdRatio: 0.15      # stock is 0.8 — fires earlier ON PURPOSE (cost)
retainTokens:   32000     # verbatim tail kept after a fold (stock ≈ 16% of window)
maxTokens:      16384     # summarizer budget (see §2)
compactionRetries: 2 · maxOverflowRetries: 1
```

**When it fires:** threshold = min(0.15 × window, window − 65536 − 65536).
Examples: v4.1-flash (1,048,576) → **157,286**; a 262k-window model → ~39,321
(unless its row's maxTokens bites first). Between folds: silence — one fold
absorbs ≈ threshold − retainTokens of accumulated work (~125k on v4.1-flash).

**Aggression verdict:** the 0.15 trigger is a cost feature — it caps per-request
input billing (~157k worst case vs ~800k at stock 0.8) and keeps every fold
small enough to succeed. The genuinely tight knob is **`retainTokens: 32000`**
(stock would keep ~168k on a 1M window). If the model ever "forgets" recent-ish
work right after a fold, raise it to 48000–64000, validate, restart. One line.

## 4. Memory layers (what survives, where)

```
Layer 0  CONFIG      tuned compaction (above) — no treadmill, no truncation deadlock
Layer 1  ALWAYS-ON   ~/AGENTS.md chain (walks cwd → home: global + atelier +
                     per-project rules — works from ANY workspace under home)
                     · skills (<dir>/SKILL.md) · dsh-todo-continuity
                     · HANDOFF RULE: end substantial sessions by writing
                       <project>/.scratch/HANDOFF-<date>.md (codified in ~/AGENTS.md)
Layer 2  RECALL      memory-eternal 0.10.31 (installed 2026-10-15, needs restart)
Layer 3  WATCHLIST   dsh-statecore 0.4.0 (peers pinned 0.1.x — wait for bump),
                     dsh-prime-memory 0.21.0 (per-step inject = steady token cost)
```

Why layers: DSH natively auto-loads **only** the AGENTS.md/CLAUDE.md chain and
skills (upstream Discussion #5333); session logs are never auto-recalled, and
compaction SHADOWS (not deletes) old history — mid-session injections vanish
from the model's view after a fold. So durable knowledge must live on disk,
never in model recall.

## 5. memory-eternal — how it works here

- **Vault:** `~/.dsh/memory-vault/` — plain Markdown knowledge cards, plugin-
  private (no network; filesystem scoped to that dir). Dedup + CJK retrieval +
  knowledge graph. Don't hand-edit `~/.dsh/`; use its CLI.
- **Write path:** at session END it distills the conversation into cards via
  your configured model route (one summarizer-style call — watch the first
  deposit's cost). No per-step drag.
- **Read path:** the agent gets a `memory_recall` tool; it pulls only relevant
  card excerpts on demand — cost scales with need, not vault size. If compaction
  shadows a recall, it can simply re-recall (self-healing).
- **CLI:** `dsh-memory recall|capture|sweep|mcp|serve`. Seeds worth capturing:
  the §1 invariant, Termux patch/shim rules, standing user preferences.
- **Compatibility:** registry-verified `0.2.0-rc.2: compatible` (engines
  `<0.3.0-0`). Verified installed + `dump-config` exit 0 on 2026-10-15.

## 6. Verification recipe (after any compaction/memory change)

```bash
dsh --profile web --dump-config          # exit 0 + spot-check the values
bash ~/deepseek-harness-termux/install.sh && dsh-start
# then, after some work in the affected chat:
zstdcat ~/.dsh/sessions/<id>/session.v4.jsonl.zstd | grep -c compaction/start
# expected: 0 new events while live context < threshold
```
