import { Octokit } from '@octokit/rest'

let octokit: Octokit | null = null
export function getOctokitClient(): Octokit {
    if (octokit === null) {
        octokit = new Octokit({ auth: getGithubCliToken() })
    }

    return octokit
}

export function getGithubCliToken(): string {
    const subProcess = Bun.spawnSync(['gh', 'auth', 'token'], { stdio: ['pipe', 'pipe', 'pipe'] })
    const stdout = subProcess.stdout.toString().trim()

    if (!subProcess.success || !stdout) {
        throw new Error(`Could not get GitHub CLI token. Run 'gh auth login' and try again.`)
    }

    return stdout
}
