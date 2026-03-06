import fs from 'node:fs'
import path from 'node:path'

import simpleGit, { CleanOptions, ResetMode, SimpleGit } from 'simple-git'

import { getGitCacheDir } from './cache.ts'
import { log } from './log.ts'

type GitterType = 'cache' | { type: 'user-config'; dir: string }

export class Gitter {
    private readonly type: GitterType
    private readonly git: SimpleGit
    private readonly org: string
    private readonly gitCacheDir: string | null

    constructor(type: GitterType, team: string, org: string = 'navikt') {
        this.type = type
        this.org = org

        if (type === 'cache') {
            this.gitCacheDir = getGitCacheDir(team)
            fs.mkdirSync(this.gitCacheDir, { recursive: true })

            this.git = simpleGit({
                baseDir: this.gitCacheDir,
                binary: 'git',
                maxConcurrentProcesses: 10,
            })
        } else {
            this.gitCacheDir = null
            this.git = simpleGit({
                baseDir: type.dir,
                binary: 'git',
                maxConcurrentProcesses: 10,
            })
        }
    }

    public async cloneOrPull(
        repo: string,
        defaultBranch: string,
        silent = false,
        shallow = false,
    ): Promise<'updated' | 'cloned' | 'skipped' | { type: 'error'; message: string }> {
        return this.exists(repo) ? this.pull(repo, defaultBranch, silent) : this.clone(repo, silent, shallow)
    }

    private async pull(
        repo: string,
        defaultBranch: string,
        silent: boolean,
    ): Promise<'updated' | { type: 'error'; message: string }> {
        const t1 = performance.now()
        const repoClient = this.createRepoGitClient(repo)

        if (this.type === 'cache') {
            try {
                await repoClient
                    .clean([CleanOptions.FORCE, CleanOptions.RECURSIVE])
                    .reset(ResetMode.HARD, ['origin/HEAD'])
                    .checkout(defaultBranch)
                    .pull({
                        '--rebase': null,
                    })
            } catch (e) {
                return {
                    type: 'error',
                    message: (e as Error).message,
                }
            }
        } else {
            try {
                const currentBranch = await repoClient.revparse(['--abbrev-ref', 'HEAD'])
                if (currentBranch.trim() === defaultBranch) {
                    await repoClient.pull({ '--rebase': null })
                } else {
                    await repoClient.fetch('origin', `${defaultBranch}:${defaultBranch}`)
                }
            } catch (e) {
                return {
                    type: 'error',
                    message: (e as Error).message,
                }
            }
        }

        if (!silent) {
            log(`${repo}, exists, pulled OK (${Math.round(performance.now() - t1)}ms)`)
        }

        return 'updated'
    }

    public async clone(
        repo: string,
        silent: boolean,
        shallow: boolean,
        localPath?: string,
    ): Promise<'cloned' | 'skipped' | { type: 'error'; message: string }> {
        const dest = localPath ?? repo
        if (this.exists(dest)) {
            if (!silent) {
                log(`${dest} already exists, skipping clone`)
            }
            return 'skipped'
        }

        const remote = `https://github.com/${this.org}/${repo}.git`
        const t1 = performance.now()
        try {
            await this.git.clone(remote, dest, shallow ? { '--depth': 1 } : undefined)
        } catch (e) {
            return {
                type: 'error',
                message: (e as Error).message,
            }
        }

        if (!silent) {
            log(`Cloned ${repo}${shallow ? ' (shallow)' : ''} OK (${Math.round(performance.now() - t1)}ms))`)
        }

        return 'cloned'
    }

    public createRepoGitClient(repo: string): SimpleGit {
        if (this.type === 'cache' && this.gitCacheDir) {
            return simpleGit({
                baseDir: `${this.gitCacheDir}/${repo}`,
                binary: 'git',
                maxConcurrentProcesses: 1,
            })
        } else if (this.type !== 'cache') {
            return simpleGit({
                baseDir: `${this.type.dir}/${repo}`,
                binary: 'git',
                maxConcurrentProcesses: 1,
            })
        }
        throw new Error('Invalid Gitter state: cache type without gitCacheDir')
    }

    private exists(repo: string): boolean {
        if (this.type === 'cache' && this.gitCacheDir) {
            return fs.existsSync(path.join(this.gitCacheDir, repo))
        } else if (this.type !== 'cache') {
            return fs.existsSync(path.join(this.type.dir, repo))
        }
        return false
    }
}
