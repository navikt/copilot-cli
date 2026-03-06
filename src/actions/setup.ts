import fs from 'node:fs'
import path from 'node:path'

import chalk from 'chalk'

import { log } from '../common/log.ts'
import { getCacheDir } from '../common/cache.ts'
import { cloneOrPullConfigRepo } from '../common/config-repos.ts'
import { resolveHome } from '../common/env.ts'
import { requireTeamConfig } from '../config/team-config.ts'
import type { TeamConfig } from '../config/team-config.ts'
import { SHARED_CONFIG_BASE } from '../config/paths.ts'

const SHARED_CONFIG_REPO = 'copilot-config'

const HOME = resolveHome()
const COPILOT_DIR = path.join(HOME, '.copilot')
const COPILOT_CONFIG_PATH = path.join(COPILOT_DIR, 'config.json')

interface InstalledPlugin {
    name: string
    marketplace: string
    version: string
    installed_at: string
    enabled: boolean
    cache_path: string
}

interface CopilotConfig {
    installed_plugins?: InstalledPlugin[]
    [key: string]: unknown
}

export interface SetupOptions {
    force?: boolean
}

export async function setupAction(options: SetupOptions = {}): Promise<void> {
    const teamConfig = await requireTeamConfig()
    const { team } = teamConfig

    const pluginName = `${team}-agents`
    const pluginTarget = path.join(COPILOT_DIR, 'installed-plugins', '_direct', pluginName)

    log(chalk.green(`\n🔧 Setter opp GitHub Copilot for ${team}\n`))

    // Ensure config repos are cloned
    await ensureConfigRepos(teamConfig)

    // Resolve team config path (local override or cloned repo)
    let teamConfigPath: string | null = null
    if (Bun.env.TEAM_CONFIG_PATH) {
        teamConfigPath = Bun.env.TEAM_CONFIG_PATH
    } else if (teamConfig.team_config) {
        const teamConfigRepoDir = path.join(getCacheDir(team), 'team-config-repo')
        const candidatePath = path.join(teamConfigRepoDir, teamConfig.team_config.path)
        if (fs.existsSync(candidatePath)) {
            teamConfigPath = candidatePath
        }
    }

    await installPlugin(pluginName, pluginTarget, teamConfigPath, options.force ?? false)
    const registerOk = await registerPlugin(pluginName, pluginTarget)

    if (registerOk) {
        log(chalk.green('\n✅ Oppsett fullført!'))
    } else {
        log(chalk.yellow('\n⚠ Oppsett delvis fullført — se feilene over'))
    }
    log(chalk.dim('  Plugin installert i: ' + pluginTarget))
    log(chalk.dim('\n  Start Copilot på nytt for at endringene skal tre i kraft.'))
}

// ---------------------------------------------------------------------------
// Config repo management
// ---------------------------------------------------------------------------

async function ensureConfigRepos(teamConfig: TeamConfig): Promise<void> {
    const { org } = teamConfig

    // Shared config
    if (Bun.env.COPILOT_CONFIG_PATH) {
        log(chalk.dim(`  Bruker lokal shared config: ${SHARED_CONFIG_BASE}`))
    } else {
        const sharedRemote = `https://github.com/${org}/${SHARED_CONFIG_REPO}.git`
        await cloneOrPullConfigRepo(sharedRemote, SHARED_CONFIG_BASE, SHARED_CONFIG_REPO)
    }

    // Team config
    if (Bun.env.TEAM_CONFIG_PATH) {
        log(chalk.dim(`  Bruker lokal team config: ${Bun.env.TEAM_CONFIG_PATH}`))
        return
    }

    if (teamConfig.team_config) {
        const tcRepoParts = teamConfig.team_config.repo.split('/')
        const tcOrg = tcRepoParts.length > 1 ? tcRepoParts[0] : org
        const tcRepo = tcRepoParts.length > 1 ? tcRepoParts[1] : tcRepoParts[0]

        const teamConfigCloneDir = path.join(getCacheDir(teamConfig.team), 'team-config-repo')
        const teamRemote = `https://github.com/${tcOrg}/${tcRepo}.git`
        await cloneOrPullConfigRepo(teamRemote, teamConfigCloneDir, `${tcOrg}/${tcRepo}`)
    }
}

// ---------------------------------------------------------------------------
// Plugin installation
// ---------------------------------------------------------------------------

async function installPlugin(
    pluginName: string,
    pluginTarget: string,
    teamConfigPath: string | null,
    force: boolean,
): Promise<void> {
    log(chalk.cyan(`📦 Installerer ${pluginName}...`))

    const agentsTargetDir = path.join(pluginTarget, 'agents')
    fs.mkdirSync(agentsTargetDir, { recursive: true })

    // Collect agent files from both sources (team overrides shared on name collision)
    const agentFiles = new Map<string, string>() // filename → source path

    // 1. Shared agents from copilot-config repo
    const sharedAgentsDir = path.join(SHARED_CONFIG_BASE, 'user-agents', 'agents')
    if (fs.existsSync(sharedAgentsDir)) {
        for (const file of fs.readdirSync(sharedAgentsDir).filter((f) => f.endsWith('.agent.md'))) {
            agentFiles.set(file, path.join(sharedAgentsDir, file))
        }
    }

    // 2. Team-specific agents (override shared on name collision)
    if (teamConfigPath) {
        const teamAgentsDir = path.join(teamConfigPath, 'agents')
        if (fs.existsSync(teamAgentsDir)) {
            for (const file of fs.readdirSync(teamAgentsDir).filter((f) => f.endsWith('.agent.md'))) {
                agentFiles.set(file, path.join(teamAgentsDir, file))
            }
        }
    }

    if (agentFiles.size === 0) {
        log(chalk.yellow('  Ingen agenter funnet i konfigurasjon'))
    }

    // Remove stale agents no longer in source
    const existingAgents = fs.existsSync(agentsTargetDir)
        ? fs.readdirSync(agentsTargetDir).filter((f) => f.endsWith('.agent.md'))
        : []
    for (const file of existingAgents) {
        if (!agentFiles.has(file)) {
            fs.unlinkSync(path.join(agentsTargetDir, file))
            log(chalk.yellow(`  🗑 Fjernet foreldet agent: ${file}`))
        }
    }

    // Copy agent files (delta — only changed files)
    for (const [filename, sourcePath] of agentFiles) {
        await copyFileIfChanged(sourcePath, path.join(agentsTargetDir, filename), force)
    }

    // Generate plugin.json dynamically with team name
    const pluginJson = {
        name: pluginName,
        version: '1.0.0',
        description: `Copilot agents for ${pluginName}`,
    }
    const pluginJsonPath = path.join(pluginTarget, 'plugin.json')
    const pluginJsonContent = JSON.stringify(pluginJson, null, 2) + '\n'

    const pluginJsonFile = Bun.file(pluginJsonPath)
    if ((await pluginJsonFile.exists()) && !force) {
        const existing = await pluginJsonFile.text()
        if (existing === pluginJsonContent) {
            log(chalk.dim('  - plugin.json (uendret)'))
            return
        }
    }
    await Bun.write(pluginJsonPath, pluginJsonContent)
    log(chalk.green('  ✓ plugin.json'))
}

async function copyFileIfChanged(source: string, target: string, force: boolean): Promise<void> {
    const fileName = path.basename(source)
    const sourceContent = await Bun.file(source).text()

    if (fs.existsSync(target) && !force) {
        const existing = await Bun.file(target).text()
        if (existing === sourceContent) {
            log(chalk.dim(`  - ${fileName} (uendret)`))
            return
        }
    }

    await Bun.write(target, sourceContent)
    log(chalk.green(`  ✓ ${fileName}`))
}

// ---------------------------------------------------------------------------
// Plugin registration in ~/.copilot/config.json
// ---------------------------------------------------------------------------

async function registerPlugin(pluginName: string, pluginTarget: string): Promise<boolean> {
    let config: CopilotConfig

    const configFile = Bun.file(COPILOT_CONFIG_PATH)
    if (await configFile.exists()) {
        const raw = await configFile.text()
        try {
            config = JSON.parse(raw) as CopilotConfig
        } catch {
            log(chalk.red(`  ✗ Kunne ikke lese ${COPILOT_CONFIG_PATH}`))
            log(chalk.red('    Filen inneholder ugyldig JSON. Fiks den manuelt eller slett den og kjør setup på nytt.'))
            return false
        }
    } else {
        fs.mkdirSync(path.dirname(COPILOT_CONFIG_PATH), { recursive: true })
        config = { installed_plugins: [] }
        log(chalk.green('  ✓ Opprettet ~/.copilot/config.json'))
    }

    const plugins = config.installed_plugins ?? []
    const existing = plugins.find((p) => p.name === pluginName)

    if (existing) {
        existing.cache_path = pluginTarget
        existing.enabled = true
        log(chalk.dim('  - Plugin allerede registrert'))
    } else {
        plugins.push({
            name: pluginName,
            marketplace: '',
            version: '1.0.0',
            installed_at: new Date().toISOString(),
            enabled: true,
            cache_path: pluginTarget,
        })
        log(chalk.green('  ✓ Plugin registrert i config.json'))
    }

    config.installed_plugins = plugins
    await Bun.write(COPILOT_CONFIG_PATH, JSON.stringify(config, null, 2) + '\n')
    return true
}
