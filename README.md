# Command Code Usage — opencode

See how much of your **Command Code** plan is left — 5-hour, weekly and monthly windows
with reset times — **in opencode's right-hand sidebar**.

Runs on your machine. No model round-trip, so **checking your quota costs no quota**.

```
CC GOAT │ 5h █▎░░░░░░░░ 12% 4h27m后重置 │ 周 █▏░░░░░░░░ 11% 09-27重置 │ 月 ▋░░░░░░░░░ 6% $66.03 10-20重置
```

[简体中文](README.zh-CN.md) · [What was verified](docs/FINDINGS.md)

[![Check](https://github.com/Jovan1666/opencode-command-code-usage/actions/workflows/check.yml/badge.svg)](https://github.com/Jovan1666/opencode-command-code-usage/actions/workflows/check.yml)

---

## Install

There is no marketplace for this one — opencode loads TUI plugins from an absolute `file://`
path in its own config, so you clone it and run the setup script:

```sh
git clone https://github.com/Jovan1666/opencode-command-code-usage
node opencode-command-code-usage/scripts/setup.mjs
```

The script registers the plugin in `~/.config/opencode/tui.json` (under `$XDG_CONFIG_HOME`
when you set it, the same root opencode uses). Re-running it is idempotent — an entry this
plugin already wrote is replaced, not duplicated. `--print` shows the JSON it would write and
touches nothing; `--remove` takes the entry back out and leaves the rest of the file alone.

Restart opencode and the sidebar gets a **Command Code** section, refreshed every 60 seconds.
The plan name and each window land on their own line. It runs locally and never goes through
the model, so it consumes no tokens.

> **There is no `/quota` command here.** opencode's sidebar is the whole surface — nothing to
> type, nothing to install into a command list. The generated line is the same panel the CLI
> prints, so if you want the numbers in a terminal, run `src/cc-usage.mjs` directly (see
> [Commands](#commands)).

## What it shows

| Window | Meaning | On GOAT |
|---|---|---|
| 5-hour | Rolling burst limit — one long session cannot drain the month | $14 |
| Weekly | Rolling 7-day limit | $35 |
| Monthly | The billing period's credit allowance | $70 |

Each window shows **percent used**, a bar, and **when it resets** (a countdown under a day,
a date beyond that). The monthly one also shows the credit left.

Colours follow how full the window is — green under 60 %, amber to 85 %, red above. The
sidebar strips the escape codes and lets opencode's own theme colour the text, so those
thresholds are what the raw status line uses; the terminal and HTML panels keep a slightly
earlier 50 / 80 split.

Plans with no rolling windows (Provider, Enterprise) show the balance alone.
Plans without API access (Go) render nothing at all — no error, no empty box.

## It hides itself when there is nothing to show

A quota bar that is permanently empty, or permanently wrong, is noise. In this adapter the
section appears only when there is something true to put in it:

- **No credential** → nothing renders. The script never prints an error into your editor.
- **No API access** (the $1 Go tier) → nothing renders.
- **A failed fetch** (offline, or a rejected key) → nothing renders, and the next attempt waits
  out a five-minute backoff instead of hammering the API.

The sidebar does not try to work out whether the current session is routed to Command Code.
An opencode TUI plugin is not handed a per-turn model, so the adapter runs the script with
`--always`: the section stays put as long as a credential works and the numbers come back.
The routing-gated mode is the script's own default when it is run with `--statusline` and a
host that passes a model on stdin — see [Commands](#commands) if you want that path.

## Commands

None. opencode TUI plugins cannot register a slash command, so this adapter ships no
`/quota` and no equivalent — the sidebar is the entire interface.

The script underneath is an ordinary CLI, though, and that is what the sidebar calls:

```sh
node src/cc-usage.mjs                 # terminal panel
node src/cc-usage.mjs --compact       # one-line summary
node src/cc-usage.mjs --md            # Markdown table
node src/cc-usage.mjs --json          # the normalised snapshot
node src/cc-usage.mjs --statusline --rows 1   # exactly what the sidebar renders
node src/cc-usage.mjs --watch         # keep refreshing in a terminal
node src/cc-usage.mjs --help          # everything else, including the offline --demo scenes
```

## Credentials

Found automatically, in this order:

1. `COMMAND_CODE_API_KEY` / `COMMANDCODE_API_KEY` / `CMD_API_KEY`
2. any env var whose name contains `commandcode`
3. `~/.commandcode/auth.json` (the official CLI's login state)
4. a Command Code provider route in opencode's own config
   (`~/.config/opencode/opencode.json` or `.jsonc`)
5. a TOML/YAML host config that mentions `commandcode`, including `apiKeyEnv` indirection

If nothing is found the sidebar simply does not render — it never prints an error into your
editor.

## Requirements

- **Node 18+ that is actually on your `PATH`.** This one matters here: opencode is a single
  Bun-compiled binary, so `process.execPath` inside it points at opencode itself. Running the
  script with that path would start opencode recursively and fail — the plugin loads, the slot
  registers, and the fetch quietly returns nothing, forever. So the plugin looks for a real
  `node` on `PATH` first and only falls back to `process.execPath` when that is a node binary.
- A Command Code plan with API access — the $1 Go tier does not have one.
- Nothing else: no package manager, no build step, no dependencies to install.

## A note on pacing warnings

The script computes a burn-rate projection. **The sidebar never shows it**, and neither does
the status line. The terminal panel, `--compact`, `--md` and `--html` still print it, and
`--json` always carries it.

It stays out of the always-on surfaces for a reason: extrapolating from a short sample says
"you will run out" almost every time — 25 minutes into a 5-hour window a normal burst projects
to 140 % — and a warning that is always on is not a warning. Where it *is* printed you asked
for a panel, so the extra line costs you nothing.

## Contributing

```sh
node scripts/check.mjs          # everything: rendering, gating, threshold, formats, secrets
node scripts/check.mjs --quiet  # one line per suite
```

That is the same script CI runs, so a local pass means a green build. It needs no credentials
and touches no network.

`src/cc-usage.mjs` is the only implementation — this repository owns it, so edit it directly.
`src/index.mjs` is the TUI plugin itself (plain JS, no build step: it builds elements through
the host's own runtime), and `scripts/setup.mjs` is the one-file installer. `check.mjs` covers
all three, including the `node` lookup described under [Requirements](#requirements).

## License

MIT — see [LICENSE](LICENSE).
