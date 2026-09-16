#!/usr/bin/env node

import { Command } from 'commander';

import { registerConvertCommand } from './commands/convert.js';

const program = new Command();

program
  .name('prizzle')
  .description('Convert Prisma and Drizzle schemas');

registerConvertCommand(program);

try {
  await program.parseAsync();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'The command could not be completed.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
