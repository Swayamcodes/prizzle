import { describe, expect, it } from 'vitest';

import { validateSchema } from '../src/validators/schema-validator.js';
import type { Field, Schema } from '../src/types/schema.js';

function field(name: string): Field {
  return {
    name,
    type: 'Int',
    isRequired: true,
    isUnique: false,
    isPrimaryKey: false,
    isAutoIncrement: false,
  };
}

function schema(tables: Schema['tables']): Schema {
  return { database: 'postgresql', tables };
}

describe('schema validator', () => {
  it('reports one duplicate-table error for each duplicate occurrence', () => {
    const result = validateSchema(schema([
      { name: 'users', fields: [], relations: [] },
      { name: 'users', fields: [], relations: [] },
    ]));

    expect(result.errors).toHaveLength(2);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'users', issue: expect.stringContaining('Duplicate table name') }),
    ]));
  });

  it('reports duplicate field names within a table', () => {
    const result = validateSchema(schema([{ name: 'users', fields: [field('id'), field('id')], relations: [] }]));

    expect(result.errors).toHaveLength(2);
    expect(result.errors.every((issue) => issue.issue.includes('Duplicate field name'))).toBe(true);
  });

  it('reports dangling relation targets', () => {
    const result = validateSchema(schema([{
      name: 'users',
      fields: [field('groupId')],
      relations: [{ type: 'one-to-many', fromField: 'groupId', toTable: 'groups', toField: 'id' }],
    }]));

    expect(result.errors).toContainEqual(expect.objectContaining({ table: 'users', issue: expect.stringContaining("unknown table 'groups'") }));
  });

  it('warns about zero-field tables', () => {
    const result = validateSchema(schema([{ name: 'empty', fields: [], relations: [] }]));

    expect(result.warnings).toContainEqual(expect.objectContaining({ table: 'empty', issue: 'Table has no fields.' }));
  });

  it('returns no issues for a structurally sound schema', () => {
    const result = validateSchema(schema([
      { name: 'users', fields: [field('id')], relations: [] },
      {
        name: 'posts',
        fields: [field('id'), field('authorId')],
        relations: [{ type: 'one-to-many', fromField: 'authorId', toTable: 'users', toField: 'id' }],
      },
    ]));

    expect(result).toEqual({ errors: [], warnings: [] });
  });
});
