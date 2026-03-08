import chalk from 'chalk'
import { hideBin } from 'yargs/helpers'

import { getYargsParser } from './yargs-parser.ts'
import { menuAction } from './actions/menu.ts'
import { log } from './common/log.ts'

const args = hideBin(Bun.argv)
const hasArgs = args.length > 0

try {
    if (!hasArgs && process.stdin.isTTY) {
        await menuAction()
    } else {
        await getYargsParser(Bun.argv).strict().parse()
    }
} catch (e) {
    if ((e as Error).name === 'ExitPromptError') {
        process.exit(0)
    }
    log(chalk.red(`\n✗ ${(e as Error).message}`))
    process.exit(1)
}
