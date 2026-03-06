# copilot-config

Delte GitHub Copilot-instruksjoner for NAV-team. Brukes av [`@navikt/copilot-cli`](https://github.com/navikt/copilot-cli) (`ccli`) for å distribuere instruksjoner, prompts og skills til team-repos.

## Hva er dette?

Dette repoet inneholder **plattform- og teknologispesifikke instruksjoner** som er felles for alle team i NAV:

| Mappe | Innhold |
|-------|---------|
| `copilot-instructions/` | Templates for `copilot-instructions.md` (med `{{variables}}`) |
| `instructions/` | `.instructions.md`-filer (nais, kotlin, kafka, frontend, security, etc.) |
| `prompts/` | `.prompt.md`-filer (nais-manifest, kafka-topic) |
| `skills/` | Skills med `SKILL.md` (flyway-migration, observability-setup) |
| `user-agents/agents/` | Delte agenter (installeres lokalt via `ccli setup`) |
| `config.yml` | Profil-definisjoner som bestemmer hvilke filer hvert repo-type får |

## Hvordan brukes det?

1. **Installer CLI**: `npm install -g @navikt/copilot-cli`
2. **Sett opp team**: `ccli init`
3. **Synk til repos**: `ccli sync --all --dry-run` (forhåndsvis), deretter `ccli sync --all`
4. **Installer agenter**: `ccli setup`

`ccli sync` kloner dette repoet, detekterer tech stack i hvert team-repo, og distribuerer relevante filer til `.github/`-mappen.

## Profiler

`config.yml` definerer fire profiler:

| Profil | Trigger | Filer |
|--------|---------|-------|
| **backend** | `build.gradle.kts` → Kotlin | kotlin, testing-kotlin + conditional (kafka, sql, spring/ktor) |
| **frontend** | `package.json` → Next.js/Vite | frontend, testing-typescript |
| **microfrontend** | `package.json` → Vite + microfrontend | frontend, testing-typescript |
| **other** | Fallback | Kun base instruksjoner |

Alle profiler får `common`-instruksjoner: auth, security, observability, nais.

## Bidra

Instruksjonene vedlikeholdes inner-source:

- **Nais-team** → `instructions/nais.instructions.md`, `prompts/nais-manifest.prompt.md`
- **Sikkerhet** → `instructions/security.instructions.md`, `instructions/auth.instructions.md`
- **Aksel-team** → (legges til ved behov)
- **Alle** → PR mot dette repoet

### Legge til ny instruksjon

1. Opprett filen i riktig mappe (`instructions/`, `prompts/`, eller `skills/`)
2. Legg til filnavnet i `config.yml` under riktig profil (eller `common` for alle)
3. Opprett PR

### Template-variabler

`copilot-instructions/`-templates bruker variabler som fylles inn per repo:

| Variabel | Eksempel |
|----------|----------|
| `{{repo_name}}` | `syfomodiaperson` |
| `{{description}}` | Repo-beskrivelse fra GitHub |
| `{{team_name}}` | `team-esyfo` |
| `{{org}}` | `navikt` |
| `{{commands}}` | Build-kommandoer basert på språk |
| `{{framework}}` | `Spring Boot`, `Ktor`, `Next.js` |
| `{{database}}` | `PostgreSQL (via Spring Data JDBC)` |
| `{{messaging}}` | `Apache Kafka` |
| `{{testing}}` | `Kotest, MockK` |

## Team-spesifikke instruksjoner

Team-spesifikke instruksjoner lever **ikke her** — de lever i teamets eget config-repo. Se [copilot-cli README](https://github.com/navikt/copilot-cli) for detaljer om team-config-strukturen.
