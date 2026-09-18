import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';
import { select } from '@inquirer/prompts';

import {
  generateDrizzleSchema,
  generatePrismaSchema,
  parseDrizzleSchema,
  parsePrismaSchema,
  validateSchema,
} from '@swayamshinde/core';

type SchemaFormat = 'prisma' | 'drizzle';

interface ConvertOptions {
  to?: string;
  from?: string;
  output?: string;
}

interface Issue {
  table: string;
  issue: string;
  originalSource?: string;
}

export function registerConvertCommand(program: Command): void {
  const command = program
    .command('convert <input-file>')
    .description('Convert a Prisma or Drizzle schema')
    .requiredOption('--to <prisma|drizzle>', 'target schema format')
    .option('--from <prisma|drizzle>', 'source schema format')
    .option('--output <file>', 'write converted schema to a file');

  command.action(async (inputFile: string) => {
    const succeeded = await convertSchema(inputFile, command.opts<ConvertOptions>());
    if (!succeeded) process.exitCode = 1;
  });
}

async function convertSchema(inputFile: string, options: ConvertOptions): Promise<boolean> {
  const source = await readSourceFile(inputFile);
  if (source === undefined) return false;

  try {
    const sourceFormat = await resolveSourceFormat(inputFile, options.from);
    const targetFormat = requiredFormat(options.to, '--to');
    if (sourceFormat === targetFormat) {
      writeError('Source and target formats must differ.');
      return false;
    }

    const parsedSchema = sourceFormat === 'prisma'
      ? await parsePrismaSchema(source)
      : await parseDrizzleSchema(source);
    const validation = validateSchema(parsedSchema);
    const generated = targetFormat === 'prisma'
      ? await generatePrismaSchema(parsedSchema)
      : await generateDrizzleSchema(parsedSchema);

    printIssues('Conversion warnings', generated.warnings, 'warning');
    printIssues('Validation errors', validation.errors, 'error');
    printIssues('Validation warnings', validation.warnings, 'warning');

    if (options.output === undefined) {
      process.stdout.write(`${generated.code}\n`);
      return true;
    }

    await writeFile(options.output, generated.code, 'utf8');
    process.stdout.write(`${chalk.green('Converted schema written to')} ${options.output}\n`);
    return true;
  } catch (error: unknown) {
    writeError(error instanceof Error ? error.message : 'Conversion failed.');
    return false;
  }
}

async function readSourceFile(inputFile: string): Promise<string | undefined> {
  try {
    return await readFile(inputFile, 'utf8');
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      writeError(`Input file '${inputFile}' does not exist.`);
    } else {
      writeError(`Unable to read input file '${inputFile}'.`);
    }
    return undefined;
  }
}

async function resolveSourceFormat(inputFile: string, suppliedFormat: string | undefined): Promise<SchemaFormat> {
  if (suppliedFormat !== undefined) return requiredFormat(suppliedFormat, '--from');

  const extension = extname(inputFile).toLowerCase();
  if (extension === '.prisma') return 'prisma';
  if (extension === '.ts') return 'drizzle';

  return select<SchemaFormat>({
    message: 'What format is the input schema?',
    choices: [
      { name: 'Prisma', value: 'prisma' },
      { name: 'Drizzle', value: 'drizzle' },
    ],
  });
}

function requiredFormat(value: string | undefined, flag: string): SchemaFormat {
  if (value === 'prisma' || value === 'drizzle') return value;
  throw new Error(`${flag} must be either 'prisma' or 'drizzle'.`);
}

function printIssues(label: string, issues: readonly Issue[], severity: 'error' | 'warning'): void {
  if (issues.length === 0) return;

  const color = severity === 'error' ? chalk.red : chalk.yellow;
  process.stderr.write(`${color(`${label}:`)}\n`);
  for (const issue of issues) {
    process.stderr.write(`${color(`  ${issue.table}: ${issue.issue}`)}\n`);
    if (issue.originalSource !== undefined) {
      process.stderr.write(`${chalk.dim(`    ${issue.originalSource}`)}\n`);
    }
  }
}

function writeError(message: string): void {
  process.stderr.write(`${chalk.red(message)}\n`);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
