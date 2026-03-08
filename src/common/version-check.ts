import fs from 'node:fs'
import path from 'node:path'

import chalk from 'chalk'

import { log } from './log.ts'
import { resolveHome } from './env.ts'
import { CLI_VERSION } from './version.ts'

const CACHE_FILE = 'version-check.json'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const NPM_PACKAGE = '@navikt/copilot-cli'

interface VersionCache {
    checkedAt: string
    latest: string
}

export interface UpdateCheck {
    current: string
    latest: string
    isOutdated: boolean
}

function getVersionCacheDir(): string {
    return path.join(resolveHome(), '.cache', 'copilot-cli')
}

function isNewerVersion(current: string, latest: string): boolean {
    const cur = current.split('.').map(Number)
    const lat = latest.split('.').map(Number)
    for (let i = 0; i < 3; i++) {
        const c = cur[i] ?? 0
        const l = lat[i] ?? 0
        if (l > c) return true
        if (l < c) return false
    }
    return false
}

async function readCache(): Promise<VersionCache | null> {
    try {
        const cachePath = path.join(getVersionCacheDir(), CACHE_FILE)
        const file = Bun.file(cachePath)
        if (!(await file.exists())) return null
        const raw = await file.text()
        const data = JSON.parse(raw) as VersionCache
        if (!data.checkedAt || !data.latest) return null
        return data
    } catch {
        return null
    }
}

async function writeCache(latest: string): Promise<void> {
    try {
        const dir = getVersionCacheDir()
        fs.mkdirSync(dir, { recursive: true })
        const cachePath = path.join(dir, CACHE_FILE)
        const data: VersionCache = { checkedAt: new Date().toISOString(), latest }
        await Bun.write(cachePath, JSON.stringify(data, null, 2) + '\n')
    } catch {
        // Ignore write errors — not critical
    }
}

function isCacheValid(cache: VersionCache): boolean {
    const checkedAt = new Date(cache.checkedAt).getTime()
    return Date.now() - checkedAt < CACHE_TTL_MS
}

function fetchLatestVersion(): string | null {
    try {
        const result = Bun.spawnSync(['npm', 'view', NPM_PACKAGE, 'version'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 10_000,
        })
        if (!result.success) return null
        const version = result.stdout.toString().trim()
        // Basic sanity check — should look like a semver string
        if (!/^\d+\.\d+\.\d+/.test(version)) return null
        return version
    } catch {
        return null
    }
}

/**
 * Check if a newer version of ccli is available.
 * Returns null on any error — this should never block the CLI.
 */
export async function checkForUpdates(force?: boolean): Promise<UpdateCheck | null> {
    try {
        const current = CLI_VERSION

        // Try cached result first (unless forced)
        if (!force) {
            const cache = await readCache()
            if (cache && isCacheValid(cache)) {
                return {
                    current,
                    latest: cache.latest,
                    isOutdated: isNewerVersion(current, cache.latest),
                }
            }
        }

        // Fetch from npm
        const latest = fetchLatestVersion()
        if (!latest) return null

        await writeCache(latest)

        return {
            current,
            latest,
            isOutdated: isNewerVersion(current, latest),
        }
    } catch {
        return null
    }
}

/** Display a one-line update notice. */
export function displayUpdateNotice(check: { current: string; latest: string }): void {
    log(
        chalk.yellow(
            `💡 Ny versjon tilgjengelig: ${check.current} → ${chalk.green(check.latest)}. Kjør: ${chalk.cyan(`npm install -g ${NPM_PACKAGE}`)}`,
        ),
    )
}
