import path from 'node:path'
import fs from 'node:fs'

import { resolveHome } from './env.ts'

export function getCacheDir(team: string): string {
    const cacheDir = path.join(resolveHome(), '.cache', 'copilot-cli', team)
    fs.mkdirSync(cacheDir, { recursive: true })
    return cacheDir
}

export function getGitCacheDir(team: string): string {
    const gitCacheDir = path.join(getCacheDir(team), 'repos')
    fs.mkdirSync(gitCacheDir, { recursive: true })
    return gitCacheDir
}
