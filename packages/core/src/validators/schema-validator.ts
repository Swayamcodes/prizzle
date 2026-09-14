import type { Schema, ValidationIssue } from '../types/schema.js';

/**
 * Performs a structural sanity pass over an already-parsed Schema. This does not
 * re-validate the syntax or semantics of the original source schema.
 */
export function validateSchema(schema: Schema): { errors: ValidationIssue[]; warnings: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const tableNames = occurrenceCounts(schema.tables.map((table) => table.name));

  for (const table of schema.tables) {
    if ((tableNames.get(table.name) ?? 0) > 1) {
      errors.push({ table: table.name, issue: `Duplicate table name '${table.name}'.` });
    }
    if (table.fields.length === 0) {
      warnings.push({ table: table.name, issue: 'Table has no fields.' });
    }

    const fieldNames = occurrenceCounts(table.fields.map((field) => field.name));
    for (const field of table.fields) {
      if ((fieldNames.get(field.name) ?? 0) > 1) {
        errors.push({ table: table.name, issue: `Duplicate field name '${field.name}'.` });
      }
    }
    for (const relation of table.relations) {
      if (!tableNames.has(relation.toTable)) {
        errors.push({ table: table.name, issue: `Relation references unknown table '${relation.toTable}'.` });
      }
    }
  }

  return { errors, warnings };
}

function occurrenceCounts(values: readonly string[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}
