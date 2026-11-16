# token-radar-01 entry

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/lsinatra/token-radar-01-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/lsinatra/token-radar-01-entry/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Entry for the make.fun bounty [token-radar-01](https://make.fun/bounty/token-radar-01) — "Build the best token launch radar" ($1,325, top 10 share it, deadline 2026-12-14T10:00Z).

A comps-fitted token launch radar ranking pre-token DefiLlama protocols by implied launch value, with costed farm plans.

A Node 22 program (`main.ts`) reads the sealed DefiLlama snapshot, ranks every pre-token protocol by a fitted implied launch value, and writes a static dashboard (`dashboard/`), a ranked board (`board.json`), three screenshots (`screenshots/`) and a dossier (`dossier.json`).

## How it works

The value model fits a log-log size curve (mcap vs TVL) on the snapshot's own traded tokens, with category multipliers, a growth factor from the 7-day change, and a maturity factor from the protocol's age without a token. The fit and its out-of-sample validation (leave-one-out, time-split, bootstrap slope interval) are computed at build time and reported on the board. Every farm plan is costed (capital + gas + hold days) and netted to a farm / thin / skip verdict at the low end of the validation error band.

## Run

Requires Node 22+. From the repository root:

```
node --experimental-strip-types main.ts /path/to/snapshot.json /path/to/output
```

The program reads `/input/snapshot.json` (the sealed snapshot) and writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` to the output directory. It is deterministic: two runs produce byte-identical output.
