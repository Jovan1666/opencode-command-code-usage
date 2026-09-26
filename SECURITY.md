# Security Policy

## Supported versions

The latest commit on `main` is supported. Fixes land there; there are no backport
branches and no maintained older releases.

## Reporting a vulnerability

Report privately through GitHub: open the **Security** tab of
<https://github.com/Jovan1666/opencode-command-code-usage> and choose **Report a
vulnerability**. If that channel is not available to you, open a normal issue that
says only that you have a security report and how to reach you — put no details in
the issue itself.

Say what you ran, what happened, and what you expected; a minimal reproduction is
worth more than a long description. This is a personal project maintained in spare
time, so expect an acknowledgement within a few days, and please hold public
disclosure until a fix is out.

## What this repository does with your machine

The plugin has one shape, and that shape *is* the security model:

| | |
|---|---|
| **Reads** | Your opencode config and the Command Code credentials and session data described below — the files that are already there, and nothing else. |
| **Writes** | One cache directory, `~/.commandcode-usage/`: the public model catalog (`models.json`, 24 h TTL) and the last usage snapshot (`last-report.json`, 180 s TTL, holding a digest of your key rather than the key). |
| **Sends** | HTTPS to `https://api.commandcode.ai` with **your own** key. No other host appears in the code. |
| **Collects** | Nothing. No telemetry, no analytics, no error reporting, no identifiers. |
| **Install** | Runs nothing. There is no package manifest, so no `postinstall` hook to run; no code is downloaded at install time and no remote configuration is fetched. |

The API calls are `GET /alpha/whoami`, `/alpha/billing/credits`,
`/alpha/billing/subscriptions`, `/alpha/usage/summary` — all with your key — and
`/provider/v1/models`, which is public and needs no key at all.

The only third-party code involved is the host's own UI runtime: the plugin pulls
`@opentui/solid` and `solid-js` out of the running opencode process with a dynamic
`import`, and if the host does not expose them it renders nothing rather than falling
back to anything downloaded.

### The host config this adapter writes

The registration step is one entry, in the host's own plugin list, and only when you
run it by hand:

- `scripts/setup.mjs` puts an absolute `file://` URL for `src/index.mjs` into the
  `plugin` array of `~/.config/opencode/tui.json` (or
  `$XDG_CONFIG_HOME/opencode/tui.json`). An entry this plugin wrote earlier is replaced
  rather than duplicated. It does not modify any other key, and it prints the exact path
  before writing.

Nothing else in opencode's configuration is touched, and no UI setting is overridden.
`--print` shows the resulting file contents without writing anything; `--remove` deletes
the entry this plugin added and removes the `plugin` array if it was the only one left;
`--help` writes nothing at all.

## Credentials

Your Command Code key is discovered in this order, and used for nothing except the
`Authorization` header of the requests listed above:

1. `COMMAND_CODE_API_KEY`, `COMMANDCODE_API_KEY`, or `CMD_API_KEY`
2. Any environment variable whose name contains `commandcode`
3. `~/.commandcode/auth.json` (written by the Command Code CLI login)
4. A Command Code provider route in opencode's own config
   (`~/.config/opencode/opencode.json` or `.jsonc`)
5. A host config file that mentions `commandcode` — `apiKey = "..."`, or
   `apiKeyEnv = "NAME"` to name an environment variable instead of inlining the value

A key is never written to a log, to the cache, or into anything the plugin renders.
The cache stores a short non-cryptographic digest whose only purpose is to tell whether the
snapshot belongs to the account that is asking. Prefer the environment variable over a
literal in a config file that might get committed. If you believe a key of yours is
exposed, revoke it in your Command Code account first — that is the only step that
actually helps.

## Scope

In scope: anything in this repository that leaks a credential, sends data anywhere
other than the API base above, writes outside the paths listed here, or turns an
untrusted input (a session file, a transcript, a config value) into code execution.

Out of scope: the Command Code API itself; opencode and its plugin mechanism; and
anything that requires an attacker who already holds your key or your shell.
