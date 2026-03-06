import fs from 'node:fs'
import path from 'node:path'

import simpleGit from 'simple-git'
import chalk from 'chalk'

import { log } from './log.ts'
import { getCacheDir } from './cache.ts'
import type { TeamConfig } from '../config/team-config.ts'
import { SHARED_CONFIG_BASE } from '../config/paths.ts'

const SHARED_CONFIG_REPO = 'copilot-config'

/** Clone a config repo (shallow) or pull if it already exists locally. */
export async function cloneOrPullConfigRepo(remoteUrl: string, localPath: string, label: string): Promise<void> {
    if (fs.existsSync(path.join(localPath, '.git'))) {
        log(chalk.dim(`  Oppdaterer ${label}...`))
        const git = simpleGit({ baseDir: localPath })
        await git.pull({ '--rebase': null })
    } else {
        log(chalk.dim(`  Kloner ${label}...`))
        fs.mkdirSync(path.dirname(localPath), { recursive: true })
        const git = simpleGit({ baseDir: path.dirname(localPath) })
        await git.clone(remoteUrl, path.basename(localPath), { '--depth': 1 })
    }
}

/**
 * Ensure shared and team config repos are available locally.
 *
 * Supports env var overrides:
 *   COPILOT_CONFIG_PATH – skip clone of shared config, use local path
 *   TEAM_CONFIG_PATH    – skip clone of team config, use local path
 *
 * Returns the resolved team config path (or null if not configured).
 */
export async function ensureConfigRepos(teamConfig: TeamConfig): Promise<{ teamConfigPath: string | null }> {
    const { org } = teamConfig

    // --- Shared config ---
    if (Bun.env.COPILOT_CONFIG_PATH) {
        if (!fs.existsSync(Bun.env.COPILOT_CONFIG_PATH)) {
            throw new Error(`COPILOT_CONFIG_PATH peker til en sti som ikke finnes: ${Bun.env.COPILOT_CONFIG_PATH}`)
        }
        log(chalk.dim(`  Bruker lokal shared config: ${SHARED_CONFIG_BASE}`))
    } else {
        const sharedRemote = `https://github.com/${org}/${SHARED_CONFIG_REPO}.git`
        await cloneOrPullConfigRepo(sharedRemote, SHARED_CONFIG_BASE, SHARED_CONFIG_REPO)
    }

    // --- Team config ---
    if (Bun.env.TEAM_CONFIG_PATH) {
        if (!fs.existsSync(Bun.env.TEAM_CONFIG_PATH)) {
            throw new Error(`TEAM_CONFIG_PATH peker til en sti som ikke finnes: ${Bun.env.TEAM_CONFIG_PATH}`)
        }
        log(chalk.dim(`  Bruker lokal team config: ${Bun.env.TEAM_CONFIG_PATH}`))
        return { teamConfigPath: Bun.env.TEAM_CONFIG_PATH }
    }

    // Clone/pull team config repo if configured
    if (!teamConfig.team_config) return { teamConfigPath: null }

    const tcRepoParts = teamConfig.team_config.repo.split('/')
    const tcOrg = tcRepoParts.length > 1 ? tcRepoParts[0] : org
    const tcRepo = tcRepoParts.length > 1 ? tcRepoParts[1] : tcRepoParts[0]

    const teamConfigCloneDir = path.join(getCacheDir(teamConfig.team), 'team-config-repo')
    const teamRemote = `https://github.com/${tcOrg}/${tcRepo}.git`
    await cloneOrPullConfigRepo(teamRemote, teamConfigCloneDir, `${tcOrg}/${tcRepo}`)

    return { teamConfigPath: path.join(teamConfigCloneDir, teamConfig.team_config.path) }
}
