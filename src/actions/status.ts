import chalk from 'chalk'

import { log } from '../common/log.ts'
import { getOctokitClient } from '../common/octokit.ts'
import { requireTeamConfig } from '../config/team-config.ts'

export interface StatusOptions {
    repo?: string
}

interface TeamRepo {
    name: string
    description?: string
    topics: string[]
    defaultBranch: string
}

export async function statusAction(options: StatusOptions = {}): Promise<void> {
    const teamConfig = await requireTeamConfig()
    const { team, org, copilot_topic } = teamConfig

    // Header
    log(chalk.bold(`\n📦 Team: ${chalk.cyan(team)} (${org})`))
    if (teamConfig.team_config) {
        log(`🔗 Team-config: ${chalk.cyan(`${teamConfig.team_config.repo}/${teamConfig.team_config.path}`)}`)
    }
    log(`🏷️  Copilot-topic: ${chalk.cyan(copilot_topic)}\n`)

    // Fetch all team repos
    log(chalk.dim('Henter repos...'))
    const allRepos = await fetchAllTeamRepos(org, team)

    if (allRepos.length === 0) {
        log(chalk.yellow('Ingen repos funnet for teamet.'))
        return
    }

    // Single repo mode
    if (options.repo) {
        const repo = allRepos.find((r) => r.name === options.repo)
        if (!repo) {
            log(chalk.red(`Repo '${options.repo}' ikke funnet i ${team}`))
            return
        }
        const hasTopic = repo.topics.includes(copilot_topic)
        const profile = resolveProfileFromTopics(repo.topics)
        if (hasTopic) {
            log(chalk.green(`  ✅ ${repo.name} — ${profile}-profil`))
        } else {
            log(chalk.dim(`  ⚪ ${repo.name} — copilot-topic mangler`))
            log(chalk.dim(`     Legg til med: gh repo edit ${org}/${repo.name} --add-topic ${copilot_topic}`))
        }
        return
    }

    // Partition repos by topic presence
    const withTopic = allRepos.filter((r) => r.topics.includes(copilot_topic))
    const withoutTopic = allRepos.filter((r) => !r.topics.includes(copilot_topic))

    // Repos with copilot-topic (synced)
    if (withTopic.length > 0) {
        log(chalk.green.bold('Synkroniserte repos:'))
        const maxName = Math.max(...withTopic.map((r) => r.name.length))
        for (const repo of withTopic) {
            const profile = resolveProfileFromTopics(repo.topics)
            log(`  ${chalk.green('✅')} ${repo.name.padEnd(maxName)}  — ${chalk.dim(`${profile}-profil`)}`)
        }
    } else {
        log(chalk.yellow('Ingen repos med copilot-topic funnet.'))
    }

    // Repos without copilot-topic
    if (withoutTopic.length > 0) {
        log(`\n${chalk.dim.bold('Team-repos uten copilot-topic:')}`)
        const maxName = Math.max(...withoutTopic.map((r) => r.name.length))
        for (const repo of withoutTopic) {
            log(
                `  ${chalk.dim('⚪')} ${repo.name.padEnd(maxName)}  — ${chalk.dim(
                    `legg til med: gh repo edit ${org}/${repo.name} --add-topic ${copilot_topic}`,
                )}`,
            )
        }
    }

    // Summary
    log(`\n${chalk.bold('Oppsummering:')}`)
    log(`  ${chalk.green(`${withTopic.length} repos med copilot-topic`)}`)
    log(`  ${chalk.dim(`${withoutTopic.length} repos uten copilot-topic`)}`)
}

async function fetchAllTeamRepos(org: string, team: string): Promise<TeamRepo[]> {
    const octokit = getOctokitClient()
    const repos: TeamRepo[] = []

    let page = 1
    while (true) {
        const { data } = await octokit.rest.teams.listReposInOrg({
            org,
            team_slug: team,
            per_page: 100,
            page,
        })

        for (const item of data) {
            if (item.archived) continue
            repos.push({
                name: item.name,
                description: item.description ?? undefined,
                topics: item.topics ?? [],
                defaultBranch: item.default_branch ?? 'main',
            })
        }

        if (data.length < 100) break
        page++
    }

    return repos.sort((a, b) => a.name.localeCompare(b.name))
}

function resolveProfileFromTopics(topics: string[]): string {
    if (topics.includes('monorepo')) return 'monorepo'
    if (topics.includes('backend')) return 'backend'
    if (topics.includes('frontend')) return 'frontend'
    if (topics.includes('microfrontend')) return 'microfrontend'
    return 'other'
}
