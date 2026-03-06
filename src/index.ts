import chalk from 'chalk'

import { getYargsParser } from './yargs-parser.ts'
import { log } from './common/log.ts'

try {
    await getYargsParser(Bun.argv).demandCommand().strict().parse()
} catch (e) {
    log(chalk.red(`\n✗ ${(e as Error).message}`))
    process.exit(1)
}
