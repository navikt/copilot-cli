import yargs, { Argv } from 'yargs'
import { hideBin } from 'yargs/helpers'
import chalk from 'chalk'

import { initAction } from './actions/init.ts'
import { syncAction } from './actions/sync.ts'
import { setupAction } from './actions/setup.ts'
import { statusAction } from './actions/status.ts'
import { loadTeamConfig, getConfigPath } from './config/team-config.ts'
import { log } from './common/log.ts'

export const getYargsParser = (argv: string[]): Argv =>
    yargs(hideBin(argv))
        .scriptName('ccli')
        .command(
            'init',
            'Sett opp team-config',
            () => {},
            async () => initAction(),
        )
        .command(
            'sync',
            'Synk copilot-config til team-repos',
            (yargs) =>
                yargs
                    .option('repo', { alias: 'r', type: 'string', describe: 'Synk et spesifikt repo' })
                    .option('all', { alias: 'a', type: 'boolean', describe: 'Synk alle repos' })
                    .option('dry-run', { alias: 'd', type: 'boolean', describe: 'Vis endringer uten å gjøre dem' }),
            async (argv) => syncAction({ repo: argv.repo, all: argv.all, dryRun: argv.dryRun }),
        )
        .command(
            'setup',
            'Installer agenter lokalt',
            (yargs) => yargs.option('force', { alias: 'f', type: 'boolean', describe: 'Tving reinstallasjon' }),
            async (argv) => setupAction({ force: argv.force }),
        )
        .command(
            'status',
            'Vis sync-status',
            (yargs) =>
                yargs.option('repo', { alias: 'r', type: 'string', describe: 'Vis status for et spesifikt repo' }),
            async (argv) => statusAction({ repo: argv.repo }),
        )
        .command(
            'config',
            'Administrer team-config',
            (yargs) =>
                yargs
                    .command(
                        'show',
                        'Vis aktiv team-config',
                        () => {},
                        async () => {
                            const config = await loadTeamConfig()
                            if (!config) {
                                log(chalk.yellow(`Ingen config funnet. Kjør 'ccli init' for å sette opp.`))
                                log(chalk.dim(`Forventet: ${getConfigPath()}`))
                                return
                            }
                            log(chalk.bold('\n📋 Aktiv team-config:\n'))
                            log(chalk.dim(`  Fil: ${getConfigPath()}\n`))
                            log(`  Team:           ${chalk.cyan(config.team)}`)
                            log(`  Organisasjon:   ${chalk.cyan(config.org)}`)
                            log(`  Copilot-topic:  ${chalk.cyan(config.copilot_topic)}`)
                            if (config.team_config) {
                                log(`  Config-repo:    ${chalk.cyan(config.team_config.repo)}`)
                                log(`  Config-path:    ${chalk.cyan(config.team_config.path)}`)
                            }
                            log('')
                        },
                    )
                    .demandCommand(1, 'Vennligst spesifiser en subkommando: show'),
            () => {},
        )
        .epilog(
            [
                'Eksempler:',
                '  ccli init              Sett opp team-config',
                '  ccli sync              Synk copilot-config til repos',
                '  ccli setup             Installer agenter lokalt',
                '  ccli status            Vis sync-status',
                '  ccli config show       Vis aktiv team-config',
            ].join('\n'),
        )
