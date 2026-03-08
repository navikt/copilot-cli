import path from 'node:path'

import chalk from 'chalk'
import { confirm } from '@inquirer/prompts'

import { log } from '../common/log.ts'
import { checkForUpdates, displayUpdateNotice } from '../common/version-check.ts'
import { Gitter } from '../common/git.ts'
import { getGitCacheDir } from '../common/cache.ts'
import { getOctokitClient } from '../common/octokit.ts'
import { ensureConfigRepos } from '../common/config-repos.ts'
import { requireTeamConfig } from '../config/team-config.ts'
import { loadCopilotSyncConfig } from '../config/sync-config.ts'
import type { RepoProfile } from '../config/sync-config.ts'
import { SHARED_CONFIG_BASE } from '../config/paths.ts'
import { extractTypeFromTopics } from '../config/repo-utils.ts'
import type { RepoTopicNode, RepoType } from '../config/repo-utils.ts'
import { detectRepoStack, logStackInfo } from '../config/detector.ts'
import { assembleForRepo } from '../config/assembler.ts'
import type { AssemblyResult } from '../config/assembler.ts'

const BRANCH_NAME = 'copilot-config-sync'
const COMMIT_MESSAGE = 'chore: oppdater copilot-config [skip ci]'

export interface SyncOptions {
    repo?: string
    all?: boolean
    dryRun?: boolean
}

interface RepoNode {
    name: string
    description?: string
    defaultBranch: string
    topics: string[]
}

interface SyncResult {
    repo: string
    profile: RepoProfile
    assembly: AssemblyResult
    hasChanges: boolean
}

export function repoTypeToProfile(type: RepoType): RepoProfile {
    if (type === 'monorepo') return 'other'
    return type
}

function spawnOrThrow(cmd: string[], cwd: string): void {
    const result = Bun.spawnSync(cmd, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    if (!result.success) {
        const stderr = result.stderr?.toString().trim() ?? ''
        throw new Error(`Command failed: ${cmd.join(' ')}${stderr ? ` — ${stderr}` : ''}`)
    }
}

async function fetchReposByTopic(org: string, topic: string): Promise<RepoNode[]> {
    const octokit = getOctokitClient()
    const repos: RepoNode[] = []

    let page = 1
    while (true) {
        const { data } = await octokit.rest.search.repos({
            q: `org:${org} topic:${topic} archived:false`,
            per_page: 100,
            page,
        })

        for (const item of data.items) {
            // Only include repos where user has push access (needed for branch/PR)
            if (item.permissions && !item.permissions.push) continue

            repos.push({
                name: item.name,
                description: item.description ?? undefined,
                defaultBranch: item.default_branch,
                topics: item.topics ?? [],
            })
        }

        if (data.items.length < 100) break
        page++
    }

    return repos
}

function buildTopicNode(topics: string[]): RepoTopicNode {
    return { repositoryTopics: { nodes: topics.map((t) => ({ topic: { name: t } })) } }
}

function detectGitChanges(repoPath: string): boolean {
    let hasChanges = false

    const diffResult = Bun.spawnSync(['git', 'diff-index', '--quiet', 'HEAD', '--', '.github/'], {
        cwd: repoPath,
        stdio: ['pipe', 'pipe', 'pipe'],
    })
    if (!diffResult.success) {
        hasChanges = true
    }

    const untrackedResult = Bun.spawnSync(
        ['git', 'ls-files', '--others', '--exclude-standard', '.github/'],
        { cwd: repoPath, stdio: ['pipe', 'pipe', 'pipe'] },
    )
    if (untrackedResult.success) {
        const untracked = untrackedResult.stdout.toString().trim()
        if (untracked.length > 0) hasChanges = true
    }

    return hasChanges
}

function resetGithubDir(repoPath: string): void {
    Bun.spawnSync(['git', 'checkout', '--', '.github/'], {
        cwd: repoPath,
        stdio: ['pipe', 'pipe', 'pipe'],
    })
    Bun.spawnSync(['git', 'clean', '-fd', '.github/'], {
        cwd: repoPath,
        stdio: ['pipe', 'pipe', 'pipe'],
    })
}

function logAssemblyResult(assembly: AssemblyResult): void {
    if (assembly.filesWritten.length > 0) {
        log(chalk.green(`    ✓ ${assembly.filesWritten.length} filer skrevet`))
    }
    if (assembly.filesRemoved.length > 0) {
        log(chalk.red(`    🗑 ${assembly.filesRemoved.length} foreldede filer fjernet`))
    }
    if (assembly.filesUnchanged.length > 0) {
        log(chalk.dim(`    - ${assembly.filesUnchanged.length} filer uendret`))
    }
    if (assembly.filesSkipped.length > 0) {
        log(chalk.yellow(`    ⚠ ${assembly.filesSkipped.length} filer hoppet over (ikke administrert av ccli)`))
    }
}

export async function syncAction(options: SyncOptions = {}): Promise<void> {
    const updateCheck = await checkForUpdates()
    if (updateCheck?.isOutdated) displayUpdateNotice(updateCheck)

    if (!options.repo && !options.all) {
        log(chalk.yellow('Spesifiser --repo <navn> for ett repo, eller --all for alle repos.'))
        log(chalk.dim('  Eksempler:'))
        log(chalk.dim('    ccli sync -r mitt-repo'))
        log(chalk.dim('    ccli sync --all --dry-run'))
        log(chalk.dim('    ccli sync --all'))
        return
    }

    const teamConfig = await requireTeamConfig()
    const { team, org, copilot_topic } = teamConfig

    log(chalk.bold(`\n🔄 Copilot Config Sync — ${team}\n`))

    // 1. Clone/pull config repos
    log(chalk.green('Henter konfigurasjon...'))
    const { teamConfigPath } = await ensureConfigRepos(teamConfig)

    // 2. Load sync config from shared repo
    const syncConfigPath = path.join(SHARED_CONFIG_BASE, 'config.yml')
    const syncConfig = await loadCopilotSyncConfig(syncConfigPath)

    // 3. Discover repos by topic
    log(chalk.green(`\nSøker etter repos med topic ${chalk.cyan(copilot_topic)}...`))
    let repos = await fetchReposByTopic(org, copilot_topic)

    if (options.repo) {
        repos = repos.filter((r) => r.name === options.repo)
        if (repos.length === 0) {
            log(chalk.red(`Repo '${options.repo}' ikke funnet med topic ${copilot_topic}`))
            return
        }
    }

    if (repos.length === 0) {
        log(chalk.yellow('Ingen repos funnet. Legg til topicet med:'))
        log(chalk.dim(`  gh repo edit <repo> --add-topic ${copilot_topic}`))
        return
    }

    // Confirm bulk sync (unless single repo or dry-run)
    if (!options.repo && repos.length > 1 && !options.dryRun) {
        const shouldContinue = await confirm({
            message: `Synce ${repos.length} repos og opprette PRer?`,
            default: false,
        })
        if (!shouldContinue) {
            log(chalk.dim('Avbrutt.'))
            return
        }
    }

    log(`\nFant ${chalk.yellow(String(repos.length))} repos\n`)

    // 4. Clone/pull target repos
    log(chalk.green('Kloner/oppdaterer repos...'))
    const gitter = new Gitter('cache', team, org)
    const cloneResults = await Promise.allSettled(
        repos.map((r) => gitter.cloneOrPull(r.name, r.defaultBranch, true)),
    )

    const failedClones: string[] = []
    const succeededRepos = repos.filter((repo, i) => {
        const result = cloneResults[i]
        if (result.status === 'rejected') {
            failedClones.push(repo.name)
            log(chalk.red(`  ✗ ${repo.name}: ${(result.reason as Error).message ?? result.reason}`))
            return false
        }
        if (typeof result.value === 'object' && result.value.type === 'error') {
            failedClones.push(repo.name)
            log(chalk.red(`  ✗ ${repo.name}: ${result.value.message}`))
            return false
        }
        return true
    })

    if (failedClones.length > 0) {
        log(chalk.red(`\n  ${failedClones.length} repo(s) feilet clone/pull: ${failedClones.join(', ')}`))
    }
    if (succeededRepos.length === 0) {
        log(chalk.red('\nAlle repos feilet clone/pull. Avbryter.'))
        return
    }
    log('')

    // 5. Process each repo: detect stack → assemble → track changes
    const gitCacheDir = getGitCacheDir(team)
    const results: SyncResult[] = []
    log(chalk.green('Detekterer stacks og bygger konfigurasjon...\n'))

    for (const repo of succeededRepos) {
        try {
            const repoPath = path.join(gitCacheDir, repo.name)
            const topicType = extractTypeFromTopics(buildTopicNode(repo.topics))
            const profile = repoTypeToProfile(topicType)

            if (profile === 'other') {
                log(chalk.yellow(`  [WARN] ${repo.name} mangler type-topics. Bruker 'other'-profil.`))
            }

            // Detect stack from repo files
            const stack = await detectRepoStack(repoPath)
            stack.repoName = repo.name
            stack.repoDescription = repo.description
            if (stack.type === 'other' && profile !== 'other') {
                stack.type = profile
            }

            const effectiveProfile = stack.type
            if (stack.subProfiles && stack.subProfiles.length > 1) {
                log(chalk.magenta(`  [MONOREPO] ${repo.name} → profiles: ${stack.subProfiles.join(', ')}`))
            }
            logStackInfo(repo.name, stack)

            // Assemble copilot config files into the cached repo
            const assembly = await assembleForRepo(repoPath, effectiveProfile, stack, syncConfig, teamConfigPath)
            const hasChanges = detectGitChanges(repoPath)

            if (options.dryRun) {
                resetGithubDir(repoPath)
                if (hasChanges) {
                    log(chalk.yellow(`    Ville endret: ${assembly.filesWritten.length} filer`))
                } else {
                    const total = assembly.filesWritten.length + assembly.filesUnchanged.length
                    log(chalk.dim(`    Allerede synkronisert (${total} filer)`))
                }
                results.push({ repo: repo.name, profile: effectiveProfile, assembly, hasChanges })
                continue
            }

            logAssemblyResult(assembly)
            results.push({ repo: repo.name, profile: effectiveProfile, assembly, hasChanges })
        } catch (e) {
            log(chalk.red(`  ✗ Feilet for ${repo.name}: ${(e as Error).message}`))
        }
    }

    // Summary
    const changed = results.filter((r) => r.hasChanges)
    const unchanged = results.filter((r) => !r.hasChanges)

    log(`\n${chalk.green('Oppsummering:')}`)
    log(`  ${chalk.yellow(String(changed.length))} repos med endringer`)
    log(`  ${chalk.dim(`${unchanged.length} repos uendret`)}`)
    if (failedClones.length > 0) {
        log(`  ${chalk.red(`${failedClones.length} repos feilet clone/pull`)}`)
    }

    if (options.dryRun) {
        log(chalk.cyan('\n  Dry run — ingen endringer gjort.'))
        return
    }

    if (changed.length === 0) {
        log(chalk.green('\n  Alle repos er oppdaterte!'))
        return
    }

    // 6. Branch, commit, push, create PR for changed repos
    log(chalk.green(`\nOppretter PRer for ${changed.length} repos...\n`))

    for (const { repo } of changed) {
        const repoPath = path.join(gitCacheDir, repo)
        try {
            const repoData = repos.find((r) => r.name === repo)
            const defaultBranch = repoData?.defaultBranch ?? 'main'

            spawnOrThrow(['git', 'checkout', defaultBranch], repoPath)

            Bun.spawnSync(['git', 'branch', '-D', BRANCH_NAME], {
                cwd: repoPath,
                stdio: ['pipe', 'pipe', 'pipe'],
            })

            spawnOrThrow(['git', 'checkout', '-b', BRANCH_NAME], repoPath)
            spawnOrThrow(['git', 'add', '.github/'], repoPath)
            spawnOrThrow(['git', 'commit', '-m', COMMIT_MESSAGE], repoPath)
            spawnOrThrow(['git', 'push', '--force-with-lease', '--set-upstream', 'origin', BRANCH_NAME], repoPath)

            log(chalk.green(`  ✓ Pushet ${repo}`))

            const prBody =
                'Automatisk sync av GitHub Copilot-konfigurasjon.\n\n' +
                'Endringer inkluderer instruksjoner, prompts og skills tilpasset dette repoets stack.'
            const prResult = Bun.spawnSync(
                ['gh', 'pr', 'create', '--title', COMMIT_MESSAGE, '--body', prBody, '--head', BRANCH_NAME],
                { cwd: repoPath, stdio: ['pipe', 'pipe', 'pipe'] },
            )
            if (prResult.success) {
                log(chalk.green(`  ✓ PR opprettet for ${repo}`))
            } else {
                log(chalk.yellow(`  ⚠ PR eksisterer allerede eller kunne ikke opprettes for ${repo}`))
            }

            const mergeResult = Bun.spawnSync(['gh', 'pr', 'merge', '--auto', '-s'], {
                cwd: repoPath,
                stdio: ['pipe', 'pipe', 'pipe'],
            })
            if (mergeResult.success) {
                log(chalk.green(`  ✓ Auto-merge aktivert for ${repo}`))
            } else {
                log(chalk.yellow(`  ⚠ Kunne ikke aktivere auto-merge for ${repo}`))
            }

            spawnOrThrow(['git', 'checkout', defaultBranch], repoPath)
        } catch (e) {
            log(chalk.red(`  ✗ Feilet for ${repo}: ${(e as Error).message}`))
        }
    }

    log(chalk.green('\nFerdig! 🎉'))
}
