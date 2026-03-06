import fs from 'node:fs'
import path from 'node:path'

import chalk from 'chalk'

import { log } from '../common/log.ts'

import { CopilotSyncConfig, getFilesForProfile, getFilesForProfiles, RepoProfile } from './sync-config.ts'
import { RepoStackInfo } from './detector.ts'
import { SHARED_CONFIG_BASE } from './paths.ts'

const MANAGED_HEADER =
    '<!-- Managed by copilot-cli. Do not edit manually. Changes will be overwritten.\n' +
    '     For repo-specific customizations, create your own files without this header. -->\n'

const FRONTMATTER_RE = /^(---\n[\s\S]*?\n---\n)/
const MANAGED_MARKER = '<!-- Managed by copilot-cli'

/** Prepend managed header after YAML frontmatter so Copilot still parses applyTo/description. */
function withManagedHeader(content: string): string {
    const match = content.match(FRONTMATTER_RE)
    if (match) {
        return match[1] + MANAGED_HEADER + content.slice(match[1].length)
    }
    return MANAGED_HEADER + content
}

/** Check if file content has the managed header at the expected position (line 1 or right after frontmatter). */
function isManagedContent(content: string): boolean {
    if (content.startsWith(MANAGED_MARKER)) return true
    const match = content.match(FRONTMATTER_RE)
    return !!match && content.slice(match[1].length).startsWith(MANAGED_MARKER)
}

export interface AssemblyResult {
    filesWritten: string[]
    filesUnchanged: string[]
    filesRemoved: string[]
    filesSkipped: string[]
}

/**
 * Assemble copilot config files for a single repository.
 *
 * Two-source merge:
 *   1. Shared config (SHARED_CONFIG_BASE) — profile-based files from copilot-config repo
 *   2. Team config (teamConfigPath) — team-specific overrides:
 *      - all/copilot-instructions.md → appended to copilot-instructions.md
 *      - all/instructions/, all/prompts/, all/skills/ → added to respective output dirs
 *      - repos/{repoName}/instructions/ etc. → added for this specific repo only
 *
 * @param repoPath       Local checkout of the target repo
 * @param profile        Detected repo profile (backend, frontend, etc.)
 * @param stack          Detected tech stack info
 * @param config         Parsed shared copilot sync config (config.yml)
 * @param teamConfigPath Path to team config root (contains all/ and repos/ dirs). Null to skip.
 */
export async function assembleForRepo(
    repoPath: string,
    profile: RepoProfile,
    stack: RepoStackInfo,
    config: CopilotSyncConfig,
    teamConfigPath: string | null,
): Promise<AssemblyResult> {
    const files =
        stack.subProfiles && stack.subProfiles.length > 1
            ? getFilesForProfiles(config, stack.subProfiles)
            : getFilesForProfile(config, profile)

    // Augment with conditional files based on detected stack
    resolveConditionalFiles(files, stack)

    const result: AssemblyResult = { filesWritten: [], filesUnchanged: [], filesRemoved: [], filesSkipped: [] }

    // Track all files we intend to write (for stale cleanup)
    const managedFiles = new Set<string>()

    // Ensure target directories exist
    const githubDir = path.join(repoPath, '.github')
    const agentsDir = path.join(githubDir, 'agents')
    const instructionsDir = path.join(githubDir, 'instructions')
    const promptsDir = path.join(githubDir, 'prompts')
    const skillsDir = path.join(githubDir, 'skills')

    const hasAgents = files.agents.length > 0 || files.teamAgent !== null
    const dirsToCreate = [instructionsDir, promptsDir, skillsDir]
    if (hasAgents) dirsToCreate.unshift(agentsDir)
    for (const dir of dirsToCreate) {
        fs.mkdirSync(dir, { recursive: true })
    }

    // 1. Scaffold copilot-instructions.md
    //    Base: assembled from shared config templates.
    //    Team layer: append all/copilot-instructions.md if it exists.
    const copilotInstructionsPath = path.join(githubDir, 'copilot-instructions.md')
    let instructionsContent = assembleCopilotInstructions(files.copilotInstructions, stack)

    if (teamConfigPath) {
        const teamInstructions = await readTeamFile(teamConfigPath, 'all/copilot-instructions.md')
        if (teamInstructions !== null) {
            instructionsContent = instructionsContent.trimEnd() + '\n\n' + teamInstructions
        }

        // Also append repo-specific copilot-instructions.md if present
        const repoName = stack.repoName ?? path.basename(repoPath)
        const repoInstructions = await readTeamFile(teamConfigPath, `repos/${repoName}/copilot-instructions.md`)
        if (repoInstructions !== null) {
            instructionsContent = instructionsContent.trimEnd() + '\n\n' + repoInstructions
        }
    }

    await scaffoldIfMissing(copilotInstructionsPath, instructionsContent, result)

    // 2. Copy team agent (renamed to team.agent.md in target)
    if (files.teamAgent) {
        const agentPath = path.join(agentsDir, 'team.agent.md')
        managedFiles.add(agentPath)
        const agentContent = await readSharedConfigFile('user-agents/agents', files.teamAgent)
        await writeIfChanged(agentPath, withManagedHeader(agentContent), result)
    }

    // 3. Copy agents
    for (const agent of files.agents) {
        const agentPath = path.join(agentsDir, agent)
        managedFiles.add(agentPath)
        const agentContent = await readSharedConfigFile('user-agents/agents', agent)
        await writeIfChanged(agentPath, withManagedHeader(agentContent), result)
    }

    // 4. Copy instructions from shared config
    for (const instruction of files.instructions) {
        const instructionPath = path.join(instructionsDir, instruction)
        managedFiles.add(instructionPath)
        const content = await readSharedConfigFile('instructions', instruction)
        await writeIfChanged(instructionPath, withManagedHeader(content), result)
    }

    // 5. Copy prompts from shared config
    for (const prompt of files.prompts) {
        const promptPath = path.join(promptsDir, prompt)
        managedFiles.add(promptPath)
        const content = await readSharedConfigFile('prompts', prompt)
        await writeIfChanged(promptPath, withManagedHeader(content), result)
    }

    // 6. Copy skills from shared config
    for (const skill of files.skills) {
        const skillDir = path.join(skillsDir, skill)
        fs.mkdirSync(skillDir, { recursive: true })
        const skillPath = path.join(skillDir, 'SKILL.md')
        managedFiles.add(skillPath)
        const content = await readSharedConfigFile(`skills/${skill}`, 'SKILL.md')
        await writeIfChanged(skillPath, withManagedHeader(content), result)
    }

    // 7. Overlay team config files (all/ and repos/{repoName}/)
    if (teamConfigPath) {
        const repoName = stack.repoName ?? path.basename(repoPath)
        await overlayTeamConfigDir(teamConfigPath, 'all', repoPath, managedFiles, result)
        await overlayTeamConfigDir(teamConfigPath, `repos/${repoName}`, repoPath, managedFiles, result)
    }

    // 8. Clean up stale managed files
    const dirsToClean = [instructionsDir, promptsDir, skillsDir]
    if (fs.existsSync(agentsDir)) dirsToClean.unshift(agentsDir)
    await cleanStaleManagedFiles(dirsToClean, managedFiles, result)

    return result
}

/**
 * Augment file lists with conditional files based on detected stack.
 * Handles framework-specific instructions, database/kafka-conditional prompts and skills.
 */
export function resolveConditionalFiles(
    files: { instructions: string[]; prompts: string[]; skills: string[] },
    stack: RepoStackInfo,
): void {
    // Database-related
    if (stack.hasDatabase) {
        files.instructions.push('sql.instructions.md')
        files.skills.push('flyway-migration')
    }

    // Framework-specific Kotlin instructions
    const ktFramework = stack.kotlinFramework ?? (stack.language === 'kotlin' ? stack.framework : undefined)
    if (ktFramework) {
        if (ktFramework === 'Spring Boot') {
            files.instructions.push('kotlin-spring.instructions.md')
        } else if (ktFramework === 'Ktor') {
            files.instructions.push('kotlin-ktor.instructions.md')
        }
    }

    // Kafka-related
    if (stack.hasKafka) {
        if (stack.kafkaLib === 'spring-kafka') {
            files.instructions.push('kafka-spring.instructions.md')
        } else {
            files.instructions.push('kafka.instructions.md')
        }
        files.prompts.push('kafka-topic.prompt.md')
    }
}

// ---------------------------------------------------------------------------
// Team config overlay
// ---------------------------------------------------------------------------

/**
 * Copy files from a team config subdirectory (e.g. "all" or "repos/myrepo") into the
 * target repo's .github/ structure. Skips copilot-instructions.md (handled separately).
 */
async function overlayTeamConfigDir(
    teamConfigPath: string,
    subDir: string,
    repoPath: string,
    managedFiles: Set<string>,
    result: AssemblyResult,
): Promise<void> {
    const sourceBase = path.join(teamConfigPath, subDir)
    if (!dirExists(sourceBase)) return

    const githubDir = path.join(repoPath, '.github')

    // Overlay instructions/, prompts/, skills/
    for (const category of ['instructions', 'prompts', 'skills'] as const) {
        const sourceDir = path.join(sourceBase, category)
        if (!dirExists(sourceDir)) continue

        const targetDir = path.join(githubDir, category)
        fs.mkdirSync(targetDir, { recursive: true })

        if (category === 'skills') {
            // Skills have subdirectories with SKILL.md
            for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
                if (!entry.isDirectory()) continue
                const skillSourceDir = path.join(sourceDir, entry.name)
                const skillMdSource = path.join(skillSourceDir, 'SKILL.md')
                if (!fs.existsSync(skillMdSource)) continue

                const skillTargetDir = path.join(targetDir, entry.name)
                fs.mkdirSync(skillTargetDir, { recursive: true })
                const skillTargetPath = path.join(skillTargetDir, 'SKILL.md')
                managedFiles.add(skillTargetPath)

                const content = await Bun.file(skillMdSource).text()
                await writeIfChanged(skillTargetPath, withManagedHeader(content), result)
            }
        } else {
            // instructions/ and prompts/ are flat files
            for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
                if (!entry.isFile()) continue
                const targetPath = path.join(targetDir, entry.name)
                managedFiles.add(targetPath)

                const content = await Bun.file(path.join(sourceDir, entry.name)).text()
                await writeIfChanged(targetPath, withManagedHeader(content), result)
            }
        }
    }

    // Overlay agents/ if present
    const agentsSourceDir = path.join(sourceBase, 'agents')
    if (dirExists(agentsSourceDir)) {
        const agentsTargetDir = path.join(githubDir, 'agents')
        fs.mkdirSync(agentsTargetDir, { recursive: true })

        for (const entry of fs.readdirSync(agentsSourceDir, { withFileTypes: true })) {
            if (!entry.isFile()) continue
            const targetPath = path.join(agentsTargetDir, entry.name)
            managedFiles.add(targetPath)

            const content = await Bun.file(path.join(agentsSourceDir, entry.name)).text()
            await writeIfChanged(targetPath, withManagedHeader(content), result)
        }
    }
}

// ---------------------------------------------------------------------------
// Shared config assembly helpers
// ---------------------------------------------------------------------------

function assembleCopilotInstructions(templates: string[], stack: RepoStackInfo): string {
    const parts: string[] = []

    for (const template of templates) {
        const templatePath = path.join(SHARED_CONFIG_BASE, 'copilot-instructions', template)
        if (!fs.existsSync(templatePath)) {
            throw new Error(`Template file not found: ${templatePath}`)
        }
        let content = fs.readFileSync(templatePath, 'utf8')
        content = replaceTemplateVars(content, stack)
        parts.push(content)
    }

    return parts.join('\n')
}

function replaceTemplateVars(content: string, stack: RepoStackInfo): string {
    const buildCmd = resolveBuildCommand(stack)
    // Use function-style replacements to avoid $ being interpreted as special replacement patterns
    return content
        .replace(/\{\{repo_name}}/g, () => stack.repoName ?? 'unknown')
        .replace(/\{\{description}}/g, () => stack.repoDescription ?? '')
        .replace(/\{\{commands}}/g, () => buildCmd)
        .replace(/\{\{framework}}/g, () => stack.framework ?? 'unknown')
        .replace(/\{\{database}}/g, () =>
            stack.hasDatabase ? `PostgreSQL${stack.databaseLib ? ` (via ${stack.databaseLib})` : ''}` : 'N/A',
        )
        .replace(/\{\{database_details}}/g, () => (stack.databaseLib ? ` (via ${stack.databaseLib})` : ''))
        .replace(/\{\{messaging}}/g, () => (stack.hasKafka ? 'Apache Kafka' : 'N/A'))
        .replace(/\{\{testing}}/g, () => stack.testingLib ?? 'check package.json/build.gradle.kts')
        .replace(/\{\{bundler}}/g, () => stack.bundler ?? 'N/A')
}

function resolveBuildCommand(stack: RepoStackInfo): string {
    if (stack.language === 'kotlin') {
        return ['```bash', './gradlew build   # Build + test + lint', './gradlew test    # Tests only', '```'].join(
            '\n',
        )
    }
    if (stack.language === 'typescript') {
        return [
            '```bash',
            'pnpm run build     # Build',
            'pnpm run test      # Tests',
            'pnpm run lint      # Lint',
            '```',
        ].join('\n')
    }
    return 'Check `package.json` or `build.gradle.kts` for available commands.'
}

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

async function readSharedConfigFile(subdir: string, filename: string): Promise<string> {
    const filePath = path.join(SHARED_CONFIG_BASE, subdir, filename)
    const file = Bun.file(filePath)
    if (!(await file.exists())) {
        throw new Error(`Template file not found: ${filePath}`)
    }
    return file.text()
}

/** Read a file from the team config directory. Returns null if not found. */
async function readTeamFile(teamConfigPath: string, relativePath: string): Promise<string | null> {
    const filePath = path.join(teamConfigPath, relativePath)
    const file = Bun.file(filePath)
    if (!(await file.exists())) {
        return null
    }
    return file.text()
}

async function writeIfChanged(targetPath: string, content: string, result: AssemblyResult): Promise<void> {
    const relativePath = targetPath.split('.github/').pop() ?? targetPath
    const existingFile = Bun.file(targetPath)

    if (await existingFile.exists()) {
        const existing = await existingFile.text()
        if (existing === content) {
            result.filesUnchanged.push(relativePath)
            return
        }
        // Only overwrite files we manage (have our header)
        if (!isManagedContent(existing)) {
            result.filesSkipped.push(relativePath)
            return
        }
    }

    await Bun.write(targetPath, content)
    result.filesWritten.push(relativePath)
}

/**
 * Create a scaffold file only if it doesn't exist yet.
 * No managed header — the file is repo-owned from the start.
 */
async function scaffoldIfMissing(targetPath: string, content: string, result: AssemblyResult): Promise<void> {
    const relativePath = targetPath.split('.github/').pop() ?? targetPath
    const existingFile = Bun.file(targetPath)

    if (await existingFile.exists()) {
        result.filesSkipped.push(relativePath)
        return
    }

    await Bun.write(targetPath, content)
    result.filesWritten.push(relativePath)
}

async function cleanStaleManagedFiles(
    dirs: string[],
    currentManagedFiles: Set<string>,
    result: AssemblyResult,
): Promise<void> {
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue

        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)

            if (entry.isDirectory()) {
                // Check SKILL.md inside skill directories
                const skillMd = path.join(fullPath, 'SKILL.md')
                if (fs.existsSync(skillMd) && !currentManagedFiles.has(skillMd)) {
                    const content = await Bun.file(skillMd).text()
                    if (isManagedContent(content)) {
                        fs.unlinkSync(skillMd)
                        try {
                            fs.rmdirSync(fullPath)
                        } catch {
                            /* not empty, that's fine */
                        }
                        const skillRelativePath = skillMd.split('.github/').pop() ?? skillMd
                        result.filesRemoved.push(skillRelativePath)
                        log(chalk.red(`  🗑 Removed stale: ${skillRelativePath}`))
                    }
                }
                continue
            }

            if (!currentManagedFiles.has(fullPath)) {
                const content = await Bun.file(fullPath).text()
                if (isManagedContent(content)) {
                    fs.unlinkSync(fullPath)
                    const relativePath = fullPath.split('.github/').pop() ?? fullPath
                    result.filesRemoved.push(relativePath)
                    log(chalk.red(`  🗑 Removed stale: ${relativePath}`))
                }
            }
        }
    }
}

function dirExists(dirPath: string): boolean {
    try {
        return fs.statSync(dirPath).isDirectory()
    } catch {
        return false
    }
}
