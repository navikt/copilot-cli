# copilot-cli (ccli)

CLI-verktøy for å administrere Copilot-konfigurasjon på tvers av team-repos i NAV.

Laget av team-esyfo 🍳

## Installasjon

```bash
npm install -g @navikt/copilot-cli
```

## Kom i gang

```bash
ccli init      # Sett opp team-config
ccli sync      # Synk copilot-config til repos
ccli setup     # Installer agenter lokalt
ccli status    # Se sync-status
```

## Utvikling

```bash
bun install                # Installer avhengigheter
bun run tsc                # Type-check
bun run build              # Bygg CLI
bun run src/index.ts       # Kjør direkte under utvikling
```
