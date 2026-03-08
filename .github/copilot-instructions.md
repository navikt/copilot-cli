# Copilot Instructions — copilot-cli (`ccli`)

## Build & Run

```bash
bun install                                      # Install dependencies
bun run build                                    # Build CLI → dist/bin/ccli
bun run tsc                                      # Type-check only
bun run lint                                     # ESLint (no-console = warn)
bun run src/index.ts -- sync --all --dry-run     # Run directly without building
```

No test suite exists. Validate changes with `bun run tsc`, `bun run lint`, and manual `--dry-run` testing.

## Architecture

CLI that distributes GitHub Copilot configuration (instructions, prompts, skills, agents) to organization repos via automated PRs.

### 3-layer config model

The output assembled by `ccli sync` follows a 3-layer model:

1. **User agents** (Lag 1) — Role-based agents installed locally via `ccli setup`
2. **Repo context** (Lag 2) — Instructions, prompts, skills generated per repo by `ccli sync` based on detected stack. Base-instructions are written to `instructions/repo-context.instructions.md` (managed, `applyTo: "**"`) and updated on every sync. `copilot-instructions.md` is scaffolded once and then owned by the repo.
3. **MCP/platform tools** (Lag 3) — External tooling (if available)

Config is sourced from two places:

- **Shared config** (`shared-config/`) — Org-wide templates and instructions. `config.yml` maps profiles (backend/frontend/microfrontend/other) → file lists. These files are **templates**, not application code — they contain `{{variables}}` that the assembler replaces per-repo.
- **Team config** — Team-specific overrides, agents, and per-repo customizations from an external repo (e.g. `copilot-config/` in a team's CLI repo). Supports **profile directories** (`all/`, `backend/`, `frontend/`, `repos/{repoName}/`) so that frontend instructions don't leak into backend repos and vice versa. Overlay order: `all/` → `{profile}/` → `repos/{repoName}/`.

### Template variables

Files in `shared-config/copilot-instructions/` use Mustache-style placeholders replaced by the assembler:

`{{repo_name}}`, `{{description}}`, `{{team_name}}`, `{{org}}`, `{{commands}}`, `{{database}}`, `{{testing}}`

When editing these files, preserve the template variables — they are not meant to be literal text.

### Command flow

- **`sync`** — Core command. Discovers repos by GitHub topic → clones to `~/.cache/copilot-cli/` → detects stack → assembles `.github/` files → creates PRs with auto-merge
- **`setup`** — Installs shared + team agents to `~/.copilot/installed-plugins/`
- **`init`** — Interactive wizard → writes `~/.config/copilot-cli/team.yml`
- **`status`** — Shows sync state per repo via GitHub API
- **`ccli` (no args)** — Launches an interactive menu where the user picks a command

### Key modules

- `src/actions/` — One file per command. `sync.ts` is the most complex (~355 lines)
- `src/config/assembler.ts` — Generates `.github/` output files, replaces template variables, manages file headers. Writes `instructions/repo-context.instructions.md` as the managed base-instructions file.
- `src/config/detector.ts` — Scans `build.gradle.kts`/`package.json` for language, framework, DB, Kafka
- `src/config/sync-config.ts` — Resolves profile → file list mappings from `config.yml`
- `src/common/git.ts` — `Gitter` class wrapping `simple-git` (shallow clones, parallel ops)
- `src/common/octokit.ts` — Lazy singleton Octokit using `gh auth token`
- `src/common/version-check.ts` — Checks npm registry for newer ccli version; result cached for 24 hours. Runs automatically on `sync` and `setup`.

## Conventions

### Bun runtime — not Node.js

This runs on Bun. Use Bun APIs where practical:

- `Bun.file()` / `Bun.write()` over `fs.readFile` / `fs.writeFile`
- `Bun.env` over `process.env`
- `Bun.spawnSync()` when shelling out

### Import paths

Always use `.ts` extensions in imports — Bun requires this:

```typescript
import { log } from './common/log.ts'     // ✅
import { log } from './common/log'         // ❌ won't resolve
```

### Console output

ESLint has `no-console: warn`. Use `log` from `src/common/log.ts` (re-export of `console.log`) and `chalk` for colored terminal output.

### Functional utilities

Uses `remeda` (imported as `R`) for data transformations — prefer it over manual loops/reduces for consistency.

### Managed file marker

Files written by `ccli` to target repos are prefixed with `<!-- Managed by copilot-cli -->`. The assembler only overwrites files with this marker — repo-owned files are never touched.

The main managed base file is `instructions/repo-context.instructions.md` (`applyTo: "**"`). It contains assembled base-content (repo context, stack info, team rules) and is regenerated on every sync. In contrast, `copilot-instructions.md` is scaffolded once (first sync) and then owned by the repo — it is not overwritten on subsequent syncs.

### Stack detection drives assembly

The detector (`src/config/detector.ts`) produces a `RepoStackInfo` with `type`, `language`, `framework`, `databaseLib`, `kafkaLib`, and `subProfiles`. The assembler uses this to conditionally include files (e.g., SQL instructions only when a DB library is detected). Some files are listed in `config.yml`; others are added programmatically by the assembler.

### Error handling

- Global try-catch in `src/index.ts` with `chalk.red` output and `process.exit(1)`
- `Promise.allSettled()` for parallel git/API operations — failures are filtered, not fatal
- Git operations return `'success' | 'skipped' | { type: 'error'; message: string }`

### Environment variable overrides

- `COPILOT_CONFIG_PATH` — local path to shared config (skips git clone)
- `TEAM_CONFIG_PATH` — local path to team config (skips git clone)

### Language

README and user-facing strings are in Norwegian (bokmål). Code, types, and variable names are in English.

## Editing shared-config content

The `shared-config/` directory contains **templates and content that gets distributed** to target repos. When editing:

- **`copilot-instructions/*.md`** — These become the target repo's `.github/copilot-instructions.md`. They use `{{template_variables}}`. Follow the existing ✅ Always / ⚠️ Ask First / 🚫 Never boundary pattern for behavioral rules.
- **`instructions/*.instructions.md`** — Scoped instruction files with `applyTo` frontmatter (e.g., `applyTo: "**/*.{ts,tsx}"`). They land in `.github/instructions/` on target repos.
- **`config.yml`** — Maps profiles to file lists. Conditional files (DB, Kafka, framework-specific) are resolved by the assembler, not listed here.
- **`prompts/`** and **`skills/`** — Multi-step workflows (e.g., nais-manifest setup, flyway migration). Distributed to matching repos.

Changes to these files affect ALL repos on the next `ccli sync`.
