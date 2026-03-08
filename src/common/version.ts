import pkg from '../../dist/package.json'

/** CLI version — baked in at build time, resolved from dist/package.json in dev mode. */
export const CLI_VERSION: string = pkg.version
