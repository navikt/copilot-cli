export type RepoType = 'backend' | 'frontend' | 'microfrontend' | 'monorepo' | 'other'

export interface RepoTopicNode {
    repositoryTopics: {
        nodes: {
            topic: {
                name: string
            }
        }[]
    }
}

/**
 * Extracts a repo type from GitHub repository topics.
 * Looks for well-known topic names: monorepo, backend, frontend, microfrontend.
 */
export function extractTypeFromTopics(repo: RepoTopicNode): RepoType {
    const topics = repo.repositoryTopics.nodes.map((it) => it.topic.name)
    if (topics.includes('monorepo')) return 'monorepo'
    if (topics.includes('backend')) return 'backend'
    if (topics.includes('frontend')) return 'frontend'
    if (topics.includes('microfrontend')) return 'microfrontend'
    return 'other'
}
