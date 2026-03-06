import path from 'node:path'
import fs from 'node:fs'

import { parse, stringify } from 'yaml'

import { resolveHome } from '../common/env.ts'

export interface TeamConfig {
    team: string
    org: string
    copilot_topic: string
    team_config?: {
        repo: string
        path: string
    }
}

export function getConfigDir(): string {
    return path.join(resolveHome(), '.config', 'copilot-cli')
}

export function getConfigPath(): string {
    return path.join(getConfigDir(), 'team.yml')
}

export async function loadTeamConfig(): Promise<TeamConfig | null> {
    const configPath = getConfigPath()
    const file = Bun.file(configPath)

    if (!(await file.exists())) {
        return null
    }

    const content = await file.text()
    const parsed = parse(content)

    return validateTeamConfig(parsed)
}

function validateTeamConfig(parsed: unknown): TeamConfig {
    if (!parsed || typeof parsed !== 'object') {
        throw new Error(`Ugyldig team.yml: forventet et YAML-objekt, fikk ${typeof parsed}`)
    }

    const obj = parsed as Record<string, unknown>

    if (typeof obj.team !== 'string' || obj.team.length === 0) {
        throw new Error(`Ugyldig team.yml: 'team' mangler eller er ikke en streng`)
    }
    if (typeof obj.org !== 'string' || obj.org.length === 0) {
        throw new Error(`Ugyldig team.yml: 'org' mangler eller er ikke en streng`)
    }
    if (typeof obj.copilot_topic !== 'string' || obj.copilot_topic.length === 0) {
        throw new Error(`Ugyldig team.yml: 'copilot_topic' mangler eller er ikke en streng`)
    }

    const config: TeamConfig = {
        team: obj.team,
        org: obj.org,
        copilot_topic: obj.copilot_topic,
    }

    if (obj.team_config != null) {
        if (typeof obj.team_config !== 'object') {
            throw new Error(`Ugyldig team.yml: 'team_config' må være et objekt`)
        }
        const tc = obj.team_config as Record<string, unknown>
        if (typeof tc.repo !== 'string' || tc.repo.length === 0) {
            throw new Error(`Ugyldig team.yml: 'team_config.repo' mangler`)
        }
        if (typeof tc.path !== 'string' || tc.path.length === 0) {
            throw new Error(`Ugyldig team.yml: 'team_config.path' mangler`)
        }
        config.team_config = { repo: tc.repo, path: tc.path }
    }

    return config
}

export async function saveTeamConfig(config: TeamConfig): Promise<void> {
    const configDir = getConfigDir()
    fs.mkdirSync(configDir, { recursive: true })

    const content = stringify(config)
    await Bun.write(getConfigPath(), content)
}

export async function requireTeamConfig(): Promise<TeamConfig> {
    const config = await loadTeamConfig()

    if (!config) {
        throw new Error(
            `Ingen team-config funnet. Kjør 'ccli init' for å sette opp.\n` +
                `Forventet config: ${getConfigPath()}`,
        )
    }

    return config
}
