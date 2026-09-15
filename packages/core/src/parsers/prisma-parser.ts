import { createRequire } from 'node:module';
import type * as PrismaInternals from '@prisma/internals';

const require = createRequire(import.meta.url);
const { getDMMF } = require('@prisma/internals') as typeof PrismaInternals;

import type { ConversionWarning, Field, Relation, Schema, Table } from '../types/schema.js';

type Database = Schema['database'];
type RelationType = Relation['type'];
type ReferentialAction = NonNullable<Relation['onDelete']>;

interface DmmfField {
  name: string;
  kind: string;
  type: string;
  isRequired: boolean;
  isList: boolean;
  isUnique: boolean;
  isId: boolean;
  isUpdatedAt: boolean;
  default?: unknown;
  nativeType?: readonly [string, readonly unknown[]] | null;
  relationName?: string | null;
  relationFromFields?: readonly string[];
  relationToFields?: readonly string[];
  relationOnDelete?: string | null;
}

interface DmmfModel {
  name: string;
  fields: readonly DmmfField[];
  primaryKey?: {
    fields: readonly string[];
  } | null;
}

interface DmmfDatamodel {
  models: readonly DmmfModel[];
  types?: readonly unknown[];
}

interface DmmfDocument {
  datamodel: DmmfDatamodel;
}

/**
 * Parses a Prisma schema into the framework-independent representation used by
 * Prizzle. Prisma's DMMF deliberately excludes datasource configuration, so the
 * provider is read from the original schema while DMMF remains the authority for
 * model, field, and relation metadata.
 */
export async function parsePrismaSchema(schemaString: string): Promise<Schema> {
  const database = parseDatabaseProvider(schemaString);
  const dmmf = asDmmfDocument(
    await getDMMF({ datamodel: sanitizeSchemaForDmmf(schemaString, database) }),
  );

  if ((dmmf.datamodel.types?.length ?? 0) > 0) {
    throw new Error('Composite types are not supported by the Prisma schema parser.');
  }

  const warnings: ConversionWarning[] = [];
  const tables = dmmf.datamodel.models.map((model) => {
    warnings.push(...blockIndexWarnings(schemaString, model.name));
    const compositePrimaryKey = model.primaryKey?.fields;
    if (compositePrimaryKey === undefined || compositePrimaryKey.length < 2) {
      return mapModel(model, dmmf.datamodel.models, false, warnings, schemaString);
    }

    warnings.push({
      table: model.name,
      issue: `Composite primary key (${compositePrimaryKey.join(', ')}) cannot be represented by single-field primary key metadata.`,
      originalSource: findCompositePrimaryKeySource(schemaString, model.name, compositePrimaryKey),
    });

    return mapModel(model, dmmf.datamodel.models, true, warnings, schemaString);
  });

  const parsedSchema: Schema = {
    database,
    tables,
  };
  if (warnings.length > 0) {
    parsedSchema.warnings = warnings;
  }

  return parsedSchema;
}

function asDmmfDocument(value: unknown): DmmfDocument {
  if (!isRecord(value) || !isRecord(value.datamodel) || !Array.isArray(value.datamodel.models)) {
    throw new Error('Prisma returned DMMF in an unexpected format.');
  }

  return value as unknown as DmmfDocument;
}

function mapModel(
  model: DmmfModel,
  models: readonly DmmfModel[],
  hasCompositePrimaryKey: boolean,
  warnings: ConversionWarning[],
  schemaString: string,
): Table {
  return {
    name: model.name,
    fields: model.fields
      .filter((field) => field.kind !== 'object')
      .map((field) => mapField(field, hasCompositePrimaryKey)),
    relations: model.fields
      .filter((field) => field.kind === 'object')
      .flatMap((field) => {
        const relation = mapRelation(model, field, models, warnings, schemaString);
        return relation === undefined ? [] : [relation];
      }),
  };
}

function mapField(field: DmmfField, hasCompositePrimaryKey: boolean): Field {
  const mapped: Field = {
    name: field.name,
    type: field.type,
    isRequired: field.isRequired,
    isUnique: field.isUnique,
    isPrimaryKey: !hasCompositePrimaryKey && field.isId,
    isAutoIncrement: hasAutoIncrementDefault(field.default),
  };

  if (field.default !== undefined) {
    mapped.defaultValue = field.default;
  }
  if (field.isUpdatedAt) {
    mapped.isUpdatedAt = true;
  }

  const dbType = field.nativeType?.[0];
  if (dbType !== undefined) {
    mapped.dbType = dbType;
  }

  return mapped;
}

/**
 * DMMF emits an object field on each side of a Prisma relation. On the owning
 * side, relationFromFields is the local FK and relationToFields is the referenced
 * field. The inverse side has neither, so its counterpart supplies the target FK.
 * Keeping both object fields preserves relation navigation, including self-links.
 */
function mapRelation(
  model: DmmfModel,
  field: DmmfField,
  models: readonly DmmfModel[],
  warnings: ConversionWarning[],
  schemaString: string,
): Relation | undefined {
  const target = findModel(models, field.type);
  const counterpart = findCounterpart(model, field, target);
  if (hasCompositeJoinFields(field) || hasCompositeJoinFields(counterpart)) {
    if (hasCompositeJoinFields(field)) {
      const fromFields = field.relationFromFields ?? [];
      const toFields = field.relationToFields ?? [];
      warnings.push({
        table: model.name,
        issue: `Composite foreign key '${model.name}.${field.name}' (fields: [${fromFields.join(', ')}], references: [${toFields.join(', ')}]) cannot be represented by single-field relation metadata.`,
        originalSource: findCompositeForeignKeySource(schemaString, model.name, field.name, fromFields, toFields),
      });
    }
    return undefined;
  }
  const ownsRelation = (field.relationFromFields?.length ?? 0) > 0;
  const type = relationType(field, counterpart);
  const fromField = ownsRelation
    ? field.relationFromFields?.[0]
    : type === 'many-to-many'
      ? primaryKeyName(model)
      : field.name;
  const toField = ownsRelation
    ? field.relationToFields?.[0]
    : type === 'many-to-many'
      ? primaryKeyName(target)
      : (counterpart?.relationFromFields?.[0] ?? primaryKeyName(target));

  if (fromField === undefined || toField === undefined) {
    throw new Error(
      `Relation '${model.name}.${field.name}' cannot be represented because it has no scalar join field.`,
    );
  }

  const mapped: Relation = {
    type,
    fromField,
    toTable: target.name,
    toField,
  };
  const onDelete = referentialAction(field.relationOnDelete ?? counterpart?.relationOnDelete);
  if (onDelete !== undefined) {
    mapped.onDelete = onDelete;
  }

  return mapped;
}

function hasCompositeJoinFields(field: DmmfField | undefined): boolean {
  return (field?.relationFromFields?.length ?? 0) > 1 || (field?.relationToFields?.length ?? 0) > 1;
}

function findModel(models: readonly DmmfModel[], name: string): DmmfModel {
  const model = models.find((candidate) => candidate.name === name);
  if (model === undefined) {
    throw new Error(`Relation target model '${name}' was not present in Prisma DMMF.`);
  }
  return model;
}

function findCounterpart(
  model: DmmfModel,
  field: DmmfField,
  target: DmmfModel,
): DmmfField | undefined {
  return target.fields.find(
    (candidate) =>
      candidate.kind === 'object' &&
      candidate.type === model.name &&
      candidate.name !== field.name &&
      candidate.relationName === field.relationName,
  );
}

/**
 * A list on both DMMF object fields is Prisma's implicit many-to-many form. Any
 * remaining list relation is one-to-many; otherwise the relation is one-to-one.
 */
function relationType(field: DmmfField, counterpart: DmmfField | undefined): RelationType {
  if (field.isList && counterpart?.isList) {
    return 'many-to-many';
  }

  return field.isList || counterpart?.isList ? 'one-to-many' : 'one-to-one';
}

function primaryKeyName(model: DmmfModel): string | undefined {
  return model.fields.find((field) => field.isId)?.name;
}

function referentialAction(value: string | null | undefined): ReferentialAction | undefined {
  return value === 'Cascade' || value === 'SetNull' || value === 'Restrict' ? value : undefined;
}

function hasAutoIncrementDefault(defaultValue: unknown): boolean {
  return (
    isRecord(defaultValue) &&
    typeof defaultValue.name === 'string' &&
    defaultValue.name.toLowerCase() === 'autoincrement'
  );
}

function parseDatabaseProvider(schema: string): Database {
  const datasource = findNamedBlock(stripComments(schema), 'datasource');
  if (datasource === undefined) {
    throw new Error('Prisma schema must define a datasource with a supported provider.');
  }

  const provider = /^\s*provider\s*=\s*(["'])([^"']+)\1\s*$/m.exec(datasource)?.[2];
  if (provider === undefined) {
    throw new Error('Prisma datasource must define provider as a string literal.');
  }
  if (provider === 'postgresql' || provider === 'mysql' || provider === 'sqlite') {
    return provider;
  }

  throw new Error(
    `Unsupported Prisma datasource provider '${provider}'. Only postgresql, mysql, and sqlite are supported.`,
  );
}

/**
 * Prisma v7 moved datasource URLs to prisma.config.ts, so DMMF rejects v6-style
 * schema connection settings even though Prizzle does not need them.
 */
function sanitizeSchemaForDmmf(schema: string, provider: Database): string {
  const uncommentedSchema = stripComments(schema);
  const datasource = findNamedBlock(uncommentedSchema, 'datasource');
  if (datasource === undefined) {
    return uncommentedSchema;
  }

  const datasourceStart = uncommentedSchema.search(/\bdatasource\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/);
  const openingBrace = uncommentedSchema.indexOf('{', datasourceStart);
  const datasourceEnd = openingBrace + 1 + datasource.length;

  return `${uncommentedSchema.slice(0, openingBrace + 1)}\n  provider = "${provider}"\n${uncommentedSchema.slice(datasourceEnd)}`;
}

function findCompositePrimaryKeySource(
  schema: string,
  modelName: string,
  fields: readonly string[],
): string {
  const model = findNamedBlock(stripComments(schema), 'model', modelName);
  const source = model?.match(/@@id\s*\(\s*\[[^\]]+\][^)]*\)/)?.[0];

  return source?.trim() ?? `@@id([${fields.join(', ')}])`;
}

function blockIndexWarnings(schema: string, modelName: string): ConversionWarning[] {
  const model = findNamedBlock(stripComments(schema), 'model', modelName);
  if (model === undefined) return [];

  const warnings: ConversionWarning[] = [];
  const declarations = model.matchAll(/@@(index|unique|fulltext)\s*\(\s*\[[^\]]+\][^)]*\)/g);
  for (const declaration of declarations) {
    const type = declaration[1];
    const source = declaration[0];
    if ((type !== 'index' && type !== 'unique' && type !== 'fulltext') || source === undefined) continue;

    const fields = blockAttributeFields(source);
    const construct = type === 'index'
      ? 'Index'
      : type === 'unique'
        ? 'Compound unique constraint'
        : 'Full-text index';
    warnings.push({
      table: modelName,
      issue: `${construct} (${fields.join(', ')}) cannot be represented by the current schema metadata.`,
      originalSource: blockAttributeSource(source, type, fields),
    });
  }

  return warnings;
}

function blockAttributeFields(source: string): string[] {
  const fieldList = source.match(/\[([^\]]+)\]/)?.[1];
  return fieldList === undefined ? [] : fieldList.split(',').map((field) => field.trim());
}

function blockAttributeSource(source: string | undefined, type: 'index' | 'unique' | 'fulltext', fields: readonly string[]): string {
  return source?.trim() ?? `@@${type}([${fields.join(', ')}])`;
}

function findCompositeForeignKeySource(
  schema: string,
  modelName: string,
  fieldName: string,
  fromFields: readonly string[],
  toFields: readonly string[],
): string {
  const model = findNamedBlock(stripComments(schema), 'model', modelName);
  const fieldPattern = escapeRegularExpression(fieldName);
  const source = model?.match(new RegExp(`\\b${fieldPattern}\\b[\\s\\S]*?@relation\\s*\\([^)]*\\)`))?.[0];

  return source?.trim() ?? `@relation(fields: [${fromFields.join(', ')}], references: [${toFields.join(', ')}])`;
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findNamedBlock(schema: string, keyword: string, name?: string): string | undefined {
  const blockName = name === undefined ? '[A-Za-z_][A-Za-z0-9_]*' : name;
  const start = new RegExp(`\\b${keyword}\\s+${blockName}\\s*\\{`, 'g').exec(schema);
  if (start === null) {
    return undefined;
  }

  const openingBrace = schema.indexOf('{', start.index);
  let depth = 1;
  let quote: string | undefined;
  let escaped = false;
  for (let index = openingBrace + 1; index < schema.length; index += 1) {
    const character = schema[index];
    if (character === undefined) continue;
    if (quote !== undefined) {
      if (character === quote && !escaped) quote = undefined;
      escaped = character === '\\' && !escaped;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    if (depth === 0) return schema.slice(openingBrace + 1, index);
  }

  throw new Error(`Prisma ${keyword} block is not closed.`);
}

function stripComments(schema: string): string {
  let result = '';
  let quote: string | undefined;

  for (let index = 0; index < schema.length; index += 1) {
    const character = schema[index];
    const next = schema[index + 1];
    if (character === undefined) continue;

    if (quote !== undefined) {
      result += character;
      if (character === quote && schema[index - 1] !== '\\') quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      result += character;
      continue;
    }
    if (character === '/' && next === '/') {
      while (index < schema.length && schema[index] !== '\n') index += 1;
      result += '\n';
      continue;
    }
    if (character === '/' && next === '*') {
      index += 2;
      while (index < schema.length && !(schema[index] === '*' && schema[index + 1] === '/')) {
        if (schema[index] === '\n') result += '\n';
        index += 1;
      }
      index += 1;
      continue;
    }
    result += character;
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
