import { parse } from 'yaml'

export interface CopilotSyncProfile {
    copilot_instructions: string[]
    team_agent: string | null
    agents?: string[]
    instructions?: string[]
    prompts?: string[]
    skills?: string[]
}

export interface CopilotSyncConfig {
    common: {
        agents?: string[]
        instructions?: string[]
        prompts?: string[]
        skills?: string[]
    }
    profiles: Record<string, CopilotSyncProfile>
}

export type RepoProfile = 'backend' | 'frontend' | 'microfrontend' | 'other'

export async function loadCopilotSyncConfig(configPath: string): Promise<CopilotSyncConfig> {
    const file = Bun.file(configPath)
    if (!(await file.exists())) {
        throw new Error(`Shared config not found: ${configPath}`)
    }

    const content = await file.text()
    const parsed = parse(content)

    if (!parsed || typeof parsed !== 'object') {
        throw new Error(`Ugyldig sync-config (${configPath}): forventet et YAML-objekt`)
    }

    const obj = parsed as Record<string, unknown>

    if (!obj.common || typeof obj.common !== 'object') {
        throw new Error(`Ugyldig sync-config (${configPath}): 'common'-seksjon mangler`)
    }
    if (!obj.profiles || typeof obj.profiles !== 'object') {
        throw new Error(`Ugyldig sync-config (${configPath}): 'profiles'-seksjon mangler`)
    }

    return {
        common: obj.common as CopilotSyncConfig['common'],
        profiles: obj.profiles as CopilotSyncConfig['profiles'],
    }
}

export function getFilesForProfile(
    config: CopilotSyncConfig,
    profile: RepoProfile,
): {
    copilotInstructions: string[]
    agents: string[]
    instructions: string[]
    prompts: string[]
    skills: string[]
    teamAgent: string | null
} {
    const profileConfig = config.profiles[profile]

    if (!profileConfig) {
        return {
            copilotInstructions: ['base.md'],
            agents: [...(config.common.agents ?? [])],
            instructions: [...(config.common.instructions ?? [])],
            prompts: [...(config.common.prompts ?? [])],
            skills: [...(config.common.skills ?? [])],
            teamAgent: null,
        }
    }

    return {
        copilotInstructions: profileConfig.copilot_instructions,
        agents: [...(config.common.agents ?? []), ...(profileConfig.agents ?? [])],
        instructions: [...(config.common.instructions ?? []), ...(profileConfig.instructions ?? [])],
        prompts: [...(config.common.prompts ?? []), ...(profileConfig.prompts ?? [])],
        skills: [...(config.common.skills ?? []), ...(profileConfig.skills ?? [])],
        teamAgent: profileConfig.team_agent,
    }
}

/**
 * Merge files from multiple profiles (for monorepos), deduplicating.
 * copilot_instructions are concatenated in order; other files are unioned.
 */
export function getFilesForProfiles(
    config: CopilotSyncConfig,
    profiles: RepoProfile[],
): ReturnType<typeof getFilesForProfile> {
    if (profiles.length === 0) return getFilesForProfile(config, 'other')
    if (profiles.length === 1) return getFilesForProfile(config, profiles[0])

    const instructionTemplates: string[] = ['base.md']
    const agents = new Set<string>(config.common.agents ?? [])
    const instructions = new Set<string>(config.common.instructions ?? [])
    const prompts = new Set<string>(config.common.prompts ?? [])
    const skills = new Set<string>(config.common.skills ?? [])
    let teamAgent: string | null = null

    for (const profile of profiles) {
        const profileConfig = config.profiles[profile]
        if (!profileConfig) continue

        // Append profile-specific instruction templates (skip base.md, already added)
        for (const t of profileConfig.copilot_instructions) {
            if (t !== 'base.md' && !instructionTemplates.includes(t)) {
                instructionTemplates.push(t)
            }
        }

        for (const a of profileConfig.agents ?? []) agents.add(a)
        for (const i of profileConfig.instructions ?? []) instructions.add(i)
        for (const p of profileConfig.prompts ?? []) prompts.add(p)
        for (const s of profileConfig.skills ?? []) skills.add(s)
        if (!teamAgent && profileConfig.team_agent) teamAgent = profileConfig.team_agent
    }

    return {
        copilotInstructions: instructionTemplates,
        agents: [...agents],
        instructions: [...instructions],
        prompts: [...prompts],
        skills: [...skills],
        teamAgent,
    }
}
