import { describe, expect, it } from 'vitest';

import { generateDrizzleSchema } from '../src/generators/drizzle-generator.js';
import { generatePrismaSchema } from '../src/generators/prisma-generator.js';
import type { Field, Schema } from '../src/types/schema.js';

function field(name: string, type: string, overrides: Partial<Field> = {}): Field {
  return {
    name,
    type,
    isRequired: true,
    isUnique: false,
    isPrimaryKey: false,
    isAutoIncrement: false,
    ...overrides,
  };
}

function schema(tables: Schema['tables'], database: Schema['database'] = 'postgresql'): Schema {
  return { database, tables };
}

describe('schema generators', () => {
  it('generates relation defaults and target-specific onDelete casing', async () => {
    const input = schema([
      { name: 'users', fields: [field('id', 'Int', { isPrimaryKey: true })], relations: [] },
      {
        name: 'posts',
        fields: [field('id', 'Int', { isPrimaryKey: true }), field('authorId', 'Int')],
        relations: [{ type: 'one-to-many', fromField: 'authorId', toTable: 'users', toField: 'id', onDelete: 'Cascade' }],
      },
    ]);

    const drizzle = await generateDrizzleSchema(input);
    const prisma = await generatePrismaSchema(input);

    expect(drizzle.code).toMatch(/authorId: integer\("authorId"\)[\s\S]*\.references\(\(\) => users\.id, \{ onDelete: "cascade" \}\)/);
    expect(prisma.code).toContain('@relation(fields: [authorId], references: [id], onDelete: Cascade)');
  });

  it('returns parse-time and generation-time many-to-many warnings while omitting the relation output', async () => {
    const input: Schema = {
      ...schema([
        { name: 'users', fields: [field('id', 'Int', { isPrimaryKey: true })], relations: [{ type: 'many-to-many', fromField: 'id', toTable: 'groups', toField: 'id' }] },
        { name: 'groups', fields: [field('id', 'Int', { isPrimaryKey: true })], relations: [{ type: 'many-to-many', fromField: 'id', toTable: 'users', toField: 'id' }] },
      ]),
      warnings: [{ table: 'users', issue: 'Parse-time warning.' }],
    };

    const drizzle = await generateDrizzleSchema(input);
    const prisma = await generatePrismaSchema(input);

    for (const generated of [drizzle, prisma]) {
      expect(generated.warnings).toEqual(expect.arrayContaining([
        expect.objectContaining({ issue: 'Parse-time warning.' }),
        expect.objectContaining({ issue: expect.stringContaining('Many-to-many relation') }),
      ]));
      expect(generated.code).not.toContain('groups:');
    }
  });

  it('falls back for enum and Decimal fields with warnings', async () => {
    const input = schema([{ name: 'records', fields: [field('role', 'Role'), field('amount', 'Decimal')], relations: [] }]);
    const drizzle = await generateDrizzleSchema(input);
    const prisma = await generatePrismaSchema(input);

    expect(drizzle.code).toContain('role: text("role")');
    expect(prisma.code).toContain('role String');
    for (const generated of [drizzle, prisma]) {
      expect(generated.warnings).toEqual(expect.arrayContaining([
        expect.objectContaining({ issue: expect.stringContaining("'role'") }),
        expect.objectContaining({ issue: expect.stringContaining("'Role'") }),
        expect.objectContaining({ issue: expect.stringContaining("'Decimal'") }),
      ]));
    }
  });

  it('omits UUID and CUID defaults for Drizzle, while Prisma renders them literally', async () => {
    const input = schema([{
      name: 'records',
      fields: [
        field('uuidId', 'String', { defaultValue: { name: 'uuid', args: [4] } }),
        field('cuidId', 'String', { defaultValue: { name: 'cuid', args: [1] } }),
      ],
      relations: [],
    }]);
    const drizzle = await generateDrizzleSchema(input);
    const prisma = await generatePrismaSchema(input);

    expect(drizzle.code).not.toContain('sql`uuid');
    expect(drizzle.code).not.toContain('sql`cuid');
    expect(drizzle.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ issue: expect.stringContaining("'uuid'") }),
      expect.objectContaining({ issue: expect.stringContaining("'cuid'") }),
    ]));
    expect(prisma.code).toContain('@default(uuid(4))');
    expect(prisma.code).toContain('@default(cuid(1))');
  });

  it('renders now defaults for both targets', async () => {
    const input = schema([{
      name: 'records',
      fields: [field('createdAt', 'DateTime', { defaultValue: { name: 'now', args: [] } })],
      relations: [],
    }]);
    const drizzle = await generateDrizzleSchema(input);
    const prisma = await generatePrismaSchema(input);

    expect(drizzle.code).toContain('sql`now()`');
    expect(prisma.code).toContain('@default(now())');
  });

  it('uses one for inverse one-to-one Drizzle relations', async () => {
    const input = schema([
      { name: 'users', fields: [field('id', 'Int', { isPrimaryKey: true })], relations: [{ type: 'one-to-one', fromField: 'profile', toTable: 'profiles', toField: 'userId' }] },
      { name: 'profiles', fields: [field('userId', 'Int', { isUnique: true })], relations: [{ type: 'one-to-one', fromField: 'userId', toTable: 'users', toField: 'id' }] },
    ]);
    const drizzle = await generateDrizzleSchema(input);

    expect(drizzle.code).toContain('profile: one(profiles)');
    expect(drizzle.code).not.toContain('profile: many(profiles)');
  });

  it('uses varchar(191) for keyed MySQL Strings and preserves PascalCase identifiers', async () => {
    const mysql = schema([{
      name: 'UsersToGroups',
      fields: [field('id', 'String', { isPrimaryKey: true }), field('email', 'String', { isUnique: true }), field('label', 'String')],
      relations: [],
    }], 'mysql');
    const drizzle = await generateDrizzleSchema(mysql);
    const prisma = await generatePrismaSchema(mysql);

    expect(drizzle.code).toContain('id: varchar("id", { length: 191 })');
    expect(drizzle.code).toContain('email: varchar("email", { length: 191 })');
    expect(drizzle.code).toContain('label: text("label")');
    expect(drizzle.code).toContain('usersToGroups');
    expect(drizzle.code).not.toContain('userstogroups');
    expect(prisma.code).toContain('model UsersToGroups');
    expect(prisma.code).not.toContain('model Userstogroups');
  });
});
