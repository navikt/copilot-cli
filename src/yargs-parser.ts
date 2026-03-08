import yargs, { Argv } from 'yargs'
import { hideBin } from 'yargs/helpers'

import { initAction } from './actions/init.ts'
import { syncAction } from './actions/sync.ts'
import { setupAction } from './actions/setup.ts'
import { statusAction } from './actions/status.ts'
import { showConfigAction } from './actions/config.ts'
import { CLI_VERSION } from './common/version.ts'

export const getYargsParser = (argv: string[]): Argv =>
    yargs(hideBin(argv))
        .scriptName('ccli')
        .version(CLI_VERSION)
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
                        async () => showConfigAction(),
                    )
                    .demandCommand(1, 'Vennligst spesifiser en subkommando: show'),
            () => {},
        )
        .epilog(
            [
                'Tips:',
                '  Kjør ccli uten argumenter for interaktiv meny',
                '',
                'Eksempler:',
                '  ccli init              Sett opp team-config',
                '  ccli sync --all        Synk copilot-config til alle repos',
                '  ccli sync -r my-app    Synk et spesifikt repo',
                '  ccli setup             Installer agenter lokalt',
                '  ccli status            Vis sync-status',
                '  ccli config show       Vis aktiv team-config',
            ].join('\n'),
        )
        .demandCommand(1, 'Vennligst spesifiser en kommando, eller kjør ccli uten argumenter for interaktiv meny.')
