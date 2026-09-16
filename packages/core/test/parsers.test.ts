import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import { parseDrizzleSchema } from '../src/parsers/drizzle-parser.js';
import { parsePrismaSchema } from '../src/parsers/prisma-parser.js';
import type { Schema, Table } from '../src/types/schema.js';

function fixture(name: string): Promise<string> {
  return readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

function table(schema: Schema, name: string): Table {
  const found = schema.tables.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`Expected table '${name}'.`);
  return found;
}

describe('Prisma parser', () => {
  let schema: Schema;

  beforeAll(async () => {
    schema = await parsePrismaSchema(await fixture('prisma-features.prisma'));
  });

  it('maps an owning one-to-many relation and its inverse property', () => {
    expect(table(schema, 'Post').relations).toContainEqual({
      type: 'one-to-many',
      fromField: 'authorId',
      toTable: 'User',
      toField: 'id',
      onDelete: 'Cascade',
    });
    expect(table(schema, 'User').relations).toContainEqual({
      type: 'one-to-many',
      fromField: 'posts',
      toTable: 'Post',
      toField: 'authorId',
      onDelete: 'Cascade',
    });
  });

  it('maps both directions of a self-relation', () => {
    expect(table(schema, 'User').relations).toContainEqual({
      type: 'one-to-many',
      fromField: 'managerId',
      toTable: 'User',
      toField: 'id',
      onDelete: 'SetNull',
    });
    expect(table(schema, 'User').relations).toContainEqual({
      type: 'one-to-many',
      fromField: 'reports',
      toTable: 'User',
      toField: 'managerId',
      onDelete: 'SetNull',
    });
  });

  it('preserves implicit many-to-many relation shapes', () => {
    expect(table(schema, 'User').relations).toContainEqual({
      type: 'many-to-many',
      fromField: 'id',
      toTable: 'Group',
      toField: 'id',
    });
    expect(table(schema, 'Group').relations).toContainEqual({
      type: 'many-to-many',
      fromField: 'id',
      toTable: 'User',
      toField: 'id',
    });
  });

  it('warns about composite keys and omits composite foreign-key relations', () => {
    const warnings = schema.warnings ?? [];
    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'Parent', issue: expect.stringContaining('Composite primary key') }),
      expect.objectContaining({ table: 'Child', issue: expect.stringContaining('Composite foreign key') }),
    ]));
    expect(table(schema, 'Parent').fields.some((field) => field.isPrimaryKey)).toBe(false);
    expect(table(schema, 'Child').relations).toHaveLength(0);
  });

  it('warns distinctly for block indexes and preserves unsupported field types', () => {
    const warnings = schema.warnings ?? [];
    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ issue: expect.stringContaining('Index (search, email)') }),
      expect.objectContaining({ issue: expect.stringContaining('Compound unique constraint (email, search)') }),
      expect.objectContaining({ issue: expect.stringContaining('Full-text index (search)') }),
    ]));
    expect(table(schema, 'User').fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'role', type: 'Role' }),
      expect.objectContaining({ name: 'amount', type: 'Decimal' }),
    ]));
  });

  it('captures @updatedAt while accepting datasource url and directUrl declarations', () => {
    expect(table(schema, 'User').fields).toContainEqual(expect.objectContaining({ name: 'updatedAt', isUpdatedAt: true }));
    expect(schema.database).toBe('mysql');
  });
});

describe('Drizzle parser', () => {
  let schema: Schema;

  beforeAll(async () => {
    schema = await parseDrizzleSchema(await fixture('drizzle-features.ts'));
  });

  it('maps an owning one-to-many relation and inverse relation property', () => {
    expect(table(schema, 'posts').relations).toContainEqual({
      type: 'one-to-many',
      fromField: 'authorId',
      toTable: 'users',
      toField: 'id',
    });
    expect(table(schema, 'users').relations).toContainEqual({
      type: 'one-to-many',
      fromField: 'posts',
      toTable: 'posts',
      toField: 'authorId',
    });
  });

  it('maps both directions of a self-relation', () => {
    expect(table(schema, 'users').relations).toContainEqual({
      type: 'one-to-many',
      fromField: 'managerId',
      toTable: 'users',
      toField: 'id',
    });
    expect(table(schema, 'users').relations).toContainEqual({
      type: 'one-to-many',
      fromField: 'reports',
      toTable: 'users',
      toField: 'managerId',
    });
  });

  it('does not infer a relation from a bare many() declaration without a join-table foreign key', () => {
    expect(table(schema, 'users').relations.filter((relation) => relation.toTable === 'groups')).toEqual([]);
    expect(table(schema, 'groups').relations.filter((relation) => relation.toTable === 'users')).toEqual([]);
  });

  it('maps an explicit many-to-many join table as two ordinary one-to-many relations', async () => {
    const joinTableSchema = await parseDrizzleSchema(`
      export const posts = pgTable('posts', { id: integer('id').primaryKey() });
      export const tags = pgTable('tags', { id: integer('id').primaryKey() });
      export const postsToTags = pgTable('posts_to_tags', {
        postId: integer('post_id').notNull().references(() => posts.id),
        tagId: integer('tag_id').notNull().references(() => tags.id),
      });

      export const postsToTagsRelations = relations(postsToTags, ({ one }) => ({
        post: one(posts, { fields: [postsToTags.postId], references: [posts.id] }),
        tag: one(tags, { fields: [postsToTags.tagId], references: [tags.id] }),
      }));
    `);

    expect(table(joinTableSchema, 'posts_to_tags').relations).toEqual(expect.arrayContaining([
      {
        type: 'one-to-many',
        fromField: 'postId',
        toTable: 'posts',
        toField: 'id',
      },
      {
        type: 'one-to-many',
        fromField: 'tagId',
        toTable: 'tags',
        toField: 'id',
      },
    ]));
  });

  it('warns for composite primary keys, captures $onUpdateFn, and warns on unknown methods with source', () => {
    const warnings = schema.warnings ?? [];
    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'composite', issue: expect.stringContaining('Composite primary keys') }),
      expect.objectContaining({ table: 'users', issue: expect.stringContaining('customThing'), originalSource: expect.stringContaining('customThing') }),
    ]));
    expect(table(schema, 'composite').fields.some((field) => field.isPrimaryKey)).toBe(false);
    expect(table(schema, 'users').fields).toContainEqual(expect.objectContaining({ name: 'updatedAt', isUpdatedAt: true }));
    expect(warnings.some((warning) => warning.issue.includes('$onUpdateFn'))).toBe(false);
  });

  it('warns for table-level composite foreign keys with their source', async () => {
    const compositeForeignKeySchema = await parseDrizzleSchema(`
      export const parents = pgTable('parents', {
        left: integer('left'),
        right: integer('right'),
      });

      export const children = pgTable('children', {
        parentLeft: integer('parent_left'),
        parentRight: integer('parent_right'),
      }, (table) => [
        foreignKey({
          columns: [table.parentLeft, table.parentRight],
          foreignColumns: [parents.left, parents.right],
        }),
      ]);
    `);

    expect(compositeForeignKeySchema.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'children',
        issue: expect.stringContaining('Composite/table-level foreign keys'),
        originalSource: expect.stringContaining('foreignKey({'),
      }),
    ]));
  });
});
