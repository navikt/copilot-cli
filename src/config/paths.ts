import path from 'node:path'

import { resolveHome } from '../common/env.ts'

function resolveSharedConfigBase(): string {
    const override = Bun.env.COPILOT_CONFIG_PATH
    if (override) {
        return path.resolve(override)
    }

    return path.join(resolveHome(), '.config', 'copilot-cli', 'shared-config')
}

export const SHARED_CONFIG_BASE = resolveSharedConfigBase()

export function resolveTeamConfigBase(): string {
    const override = Bun.env.TEAM_CONFIG_PATH
    if (override) {
        return path.resolve(override)
    }

    return path.join(resolveHome(), '.config', 'copilot-cli', 'team-config')
}
