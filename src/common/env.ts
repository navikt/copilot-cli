/** Resolve home directory, throwing if neither HOME nor USERPROFILE is set. */
export function resolveHome(): string {
    const home = Bun.env.HOME ?? Bun.env.USERPROFILE
    if (!home) throw new Error('Could not determine home directory: neither HOME nor USERPROFILE is set')
    return home
}
