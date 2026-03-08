import chalk from 'chalk'
import { select, input } from '@inquirer/prompts'

import { log } from '../common/log.ts'
import { checkForUpdates, displayUpdateNotice } from '../common/version-check.ts'
import { CLI_VERSION } from '../common/version.ts'
import { initAction } from './init.ts'
import { syncAction } from './sync.ts'
import { setupAction } from './setup.ts'
import { statusAction } from './status.ts'
import { showConfigAction } from './config.ts'

type MenuChoice = 'init' | 'sync' | 'setup' | 'status' | 'update' | 'config-show'

export async function menuAction(): Promise<void> {
    log(chalk.bold('\n⚡ Copilot CLI\n'))

    const command = await select<MenuChoice>({
        message: 'Hva vil du gjøre?',
        choices: [
            { name: '🔧 init         Sett opp team-config', value: 'init' },
            { name: '🔄 sync         Synk copilot-config til repos', value: 'sync' },
            { name: '📦 setup        Installer agenter lokalt', value: 'setup' },
            { name: '📋 status       Vis sync-status', value: 'status' },
            { name: '⬆️  update       Sjekk for oppdateringer', value: 'update' },
            { name: '⚙️  config show  Vis aktiv team-config', value: 'config-show' },
        ],
    })

    switch (command) {
        case 'init':
            return initAction()
        case 'sync':
            return syncFromMenu()
        case 'setup':
            return setupAction({})
        case 'status':
            return statusFromMenu()
        case 'update':
            return updateFromMenu()
        case 'config-show':
            return showConfigAction()
    }
}

async function syncFromMenu(): Promise<void> {
    const mode = await select<'all' | 'repo' | 'dry-run'>({
        message: 'Hvordan vil du synce?',
        choices: [
            { name: '🔄 Alle repos', value: 'all' },
            { name: '📌 Spesifikt repo', value: 'repo' },
            { name: '👀 Alle repos (dry-run / preview)', value: 'dry-run' },
        ],
    })

    switch (mode) {
        case 'all':
            return syncAction({ all: true })
        case 'dry-run':
            return syncAction({ all: true, dryRun: true })
        case 'repo': {
            const repo = await input({
                message: 'Reponavn (f.eks. my-app)',
                validate: (val) => (val.trim().length > 0 ? true : 'Reponavn kan ikke være tomt'),
            })
            return syncAction({ repo: repo.trim() })
        }
    }
}

async function statusFromMenu(): Promise<void> {
    const mode = await select<'all' | 'repo'>({
        message: 'Vis status for …',
        choices: [
            { name: '📋 Alle repos', value: 'all' },
            { name: '📌 Spesifikt repo', value: 'repo' },
        ],
    })

    if (mode === 'all') {
        return statusAction({})
    }

    const repo = await input({
        message: 'Reponavn (f.eks. my-app)',
        validate: (val) => (val.trim().length > 0 ? true : 'Reponavn kan ikke være tomt'),
    })
    return statusAction({ repo: repo.trim() })
}

async function updateFromMenu(): Promise<void> {
    log(chalk.dim(`\n  Installert versjon: ${CLI_VERSION}`))
    log(chalk.dim('  Sjekker npm for oppdateringer...\n'))

    const check = await checkForUpdates(true)
    if (!check) {
        log(chalk.yellow('  Kunne ikke sjekke for oppdateringer. Sjekk nettverkstilkoblingen.'))
        return
    }

    if (check.isOutdated) {
        displayUpdateNotice(check)
    } else {
        log(chalk.green(`  ✅ Du kjører nyeste versjon (${check.current})`))
    }
    log('')
}

