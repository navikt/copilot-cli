import fs from 'node:fs'

import chalk from 'chalk'

import { version } from '../dist/package.json'

const result = await Bun.build({
    entrypoints: ['src/index.ts'],
    target: 'bun',
})

if (result.outputs.length > 1) {
    throw new Error('Expected only one output')
}

fs.mkdirSync('./dist/bin', { recursive: true })

const [artifact] = result.outputs
const content = '#!/usr/bin/env bun\n' + (await artifact.text())
await Bun.write('./dist/bin/ccli', content)

Bun.spawnSync('chmod +x ./dist/bin/ccli'.split(' '), {
    stdout: 'inherit',
})

/* eslint-disable no-console */
console.info(
    `Built ${version} (${chalk.green(`${(artifact.size / 1024).toFixed(0)}KB`)}) to ${chalk.yellow('./dist/bin/ccli')}`,
)
