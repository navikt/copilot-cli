import chalk from 'chalk'

import { log } from '../common/log.ts'
import { loadTeamConfig, getConfigPath } from '../config/team-config.ts'

export async function showConfigAction(): Promise<void> {
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
}
