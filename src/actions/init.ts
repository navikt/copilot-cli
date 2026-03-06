import chalk from 'chalk'
import { input, confirm } from '@inquirer/prompts'

import { log } from '../common/log.ts'
import { saveTeamConfig } from '../config/team-config.ts'
import type { TeamConfig } from '../config/team-config.ts'

export async function initAction(): Promise<void> {
    log(chalk.bold('\n🔧 Copilot CLI — Oppsett\n'))

    const team = await input({
        message: 'Teamnavn (GitHub-team i navikt)',
        validate: (val) => (val.trim().length > 0 ? true : 'Teamnavn kan ikke være tomt'),
    })

    const org = await input({
        message: 'Organisasjon',
        default: 'navikt',
    })

    const copilotTopic = await input({
        message: 'Copilot-topic',
        default: `${team}-copilot`,
    })

    const hasConfigRepo = await confirm({
        message: 'Har teamet et repo med copilot-config?',
        default: false,
    })

    let teamConfig: TeamConfig = {
        team,
        org,
        copilot_topic: copilotTopic,
    }

    if (hasConfigRepo) {
        const repo = await input({
            message: 'Repo (f.eks. navikt/esyfo-cli)',
            validate: (val) => (val.includes('/') ? true : 'Bruk formatet org/repo (f.eks. navikt/esyfo-cli)'),
        })

        const configPath = await input({
            message: 'Path i repoet',
            default: 'copilot-config/',
        })

        teamConfig = {
            ...teamConfig,
            team_config: {
                repo,
                path: configPath,
            },
        }
    }

    await saveTeamConfig(teamConfig)

    log(chalk.green(`\n✅ Config lagret i ~/.config/copilot-cli/team.yml`))
}
