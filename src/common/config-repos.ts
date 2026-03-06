import fs from 'node:fs'
import path from 'node:path'

import simpleGit from 'simple-git'

import { log } from './log.ts'
import chalk from 'chalk'

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
