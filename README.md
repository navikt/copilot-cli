# copilot-cli (`ccli`)

CLI for å distribuere GitHub Copilot-config til team-repos i NAV.

`ccli` synkroniserer instruksjoner, prompts, skills og agenter til dine team-repos — basert på automatisk stack-deteksjon og team-spesifikke tilpasninger.

## Installasjon

```bash
npm install -g @navikt/copilot-cli
```

Krever [Bun](https://bun.sh) runtime og [GitHub CLI](https://cli.github.com/) (`gh`) innlogget.

## Kom i gang

### 1. Sett opp team-config

```bash
ccli init
```

Følg den interaktive guiden. Dette oppretter `~/.config/copilot-cli/team.yml` med teamet ditt.

### 2. Merk repos med topic

Legg til topic `{team}-copilot` (f.eks. `team-esyfo-copilot`) på repos som skal synkes:

```bash
gh repo edit navikt/mitt-repo --add-topic team-esyfo-copilot
```

### 3. Synk config til repos

```bash
# Forhåndsvis endringer
ccli sync --all --dry-run

# Synk til alle repos med teamets copilot-topic
ccli sync --all

# Synk til ett spesifikt repo
ccli sync --repo mitt-repo
```

### 4. Installer agenter lokalt

```bash
ccli setup
```

## Kommandoer

| Kommando | Beskrivelse |
|----------|-------------|
| `ccli` | Interaktiv meny — velg kommando uten å huske flagg |
| `ccli init` | Sett opp team-config interaktivt |
| `ccli sync --all` | Synk copilot-config til alle team-repos |
| `ccli sync --repo <navn>` | Synk til ett spesifikt repo |
| `ccli setup` | Installer agenter lokalt for Copilot Chat |
| `ccli status` | Vis sync-status for team-repos |
| `ccli config show` | Vis aktiv team-konfigurasjon |
| `ccli --version` | Vis installert versjon |

> **Versjonsjekk:** Ved `ccli sync` og `ccli setup` sjekkes det automatisk om en nyere versjon er tilgjengelig (cachet i 24 timer).

## Hvordan det fungerer

### To-kilde modell

`ccli` kombinerer config fra to kilder:

1. **Delt config** ([navikt/copilot-config](https://github.com/navikt/copilot-config)) — Plattform- og tech-instruksjoner som er felles for alle team (nais, security, kotlin, frontend, kafka, etc.)

2. **Team-config** (teamets eget repo) — Team-spesifikke instruksjoner, agenter og overrides

### Stack-deteksjon og profiler

`ccli sync` detekterer automatisk tech stack i hvert repo:

- **Backend**: Kotlin/Spring Boot/Ktor, Kafka, PostgreSQL, Flyway
- **Frontend**: Next.js, Vite, Aksel
- **Microfrontend**: Vite + micro-frontend-oppsett

Basert på deteksjonen velges riktig **profil** (f.eks. `backend` eller `frontend`). Profilen styrer hvilke instruksjoner fra delt config og team-config som inkluderes — slik at f.eks. frontend-instruksjoner ikke havner i backend-repos.

### Managed base-instruksjoner

Ved sync genereres `instructions/repo-context.instructions.md` som en managed fil med `applyTo: "**"`. Denne inneholder assemblet base-innhold (repo-kontekst, stack-info, team-regler) og oppdateres ved hver sync. `copilot-instructions.md` scaffoldes kun ved første sync og eies deretter av repoet.

### Discovery

Repos med topic `{team}-copilot` synkes. Opt-out = fjern topicet.

## Team-config struktur

Team-config støtter profilmapper slik at du kan skille mellom backend- og frontend-instruksjoner:

```
ditt-config-repo/copilot-config/
├── all/                      ← Synkes til ALLE repos
│   ├── instructions/         ← .instructions.md-filer
│   ├── prompts/              ← .prompt.md-filer
│   └── copilot-instructions.md  ← Appendes under delt config
├── backend/                  ← Kun repos med backend-profil
│   ├── instructions/
│   ├── prompts/
│   └── copilot-instructions.md
├── frontend/                 ← Kun repos med frontend-profil
│   ├── instructions/
│   ├── prompts/
│   └── copilot-instructions.md
├── repos/{reponavn}/         ← Per-repo overrides
│   └── instructions/
└── agents/                   ← Installeres lokalt (ccli setup)
    └── min-agent.agent.md
```

**Overlay-rekkefølge:** `all/` → `{profil}/` → `repos/{repoName}/` — filer fra senere lag overskriver tidligere.

## Utvikling

```bash
bun install
bun run src/index.ts -- sync --all --dry-run   # Kjør direkte
bun run build                                    # Bygg CLI
bun run tsc                                      # Type-sjekk
```

### Env-variabler for lokal testing

| Variabel | Beskrivelse |
|----------|-------------|
| `COPILOT_CONFIG_PATH` | Lokal sti til shared config (skipper git clone) |
| `TEAM_CONFIG_PATH` | Lokal sti til team config (skipper git clone) |
