import type { ConversionWarning, Field, Relation, Schema, Table } from '../types/schema.js';

/** Generates a Prisma v7 schema from Prizzle's framework-independent representation. */
export async function generatePrismaSchema(schema: Schema): Promise<string> {
  const modelNames = modelNamesForTables(schema.tables);
  const warningsByTable = warningsForTables([
    ...(schema.warnings ?? []),
    ...manyToManyWarnings(schema.tables),
  ]);
  const models = schema.tables.map((table) => generateModel(
    table,
    modelNames,
    warningsByTable.get(table.name) ?? [],
  ));
  const source = `${datasourceBlock(schema.database)}\n\n${clientGeneratorBlock()}\n\n${models.join('\n\n')}`;

  // No Prisma-aware Prettier plugin is installed, so the generator preserves its
  // own stable indentation while retaining the asynchronous generator contract.
  return await Promise.resolve(source);
}

function datasourceBlock(database: Schema['database']): string {
  return `datasource db {\n  provider = ${quote(database)}\n  // Placeholder URL; Prizzle did not infer a real database connection value.\n  url      = env("DATABASE_URL")\n}`;
}

function clientGeneratorBlock(): string {
  return 'generator client {\n  provider = "prisma-client-js"\n}';
}

function generateModel(
  table: Table,
  modelNames: ReadonlyMap<string, string>,
  warnings: readonly ConversionWarning[],
): string {
  const modelName = requiredModelName(table.name, modelNames);
  const owning = owningRelations(table);
  const scalarFields = table.fields.map((field) => generateScalarField(field));
  const relationFields = table.relations
    .filter((relation) => relation.type !== 'many-to-many')
    .map((relation) => generateRelationField(table, relation, owning, modelNames));
  const warningsSource = warnings.map(formatWarning).join('\n');
  const fields = disambiguateRelationFieldNames([...scalarFields, ...relationFields], scalarFields.length);
  const declaration = `model ${modelName} {\n${fields.map((field) => `  ${field}`).join('\n')}\n}`;
  return warningsSource === '' ? declaration : `${warningsSource}\n${declaration}`;
}

/**
 * This is only a safety net for duplicate generated navigation names. Proper
 * disambiguation needs original relation field names and Prisma's named
 * @relation syntax, neither of which the current Schema representation carries.
 */
function disambiguateRelationFieldNames(fields: readonly string[], scalarFieldCount: number): string[] {
  const used = new Set<string>();
  return fields.map((field, index) => {
    const identifier = leadingIdentifier(field);
    if (index < scalarFieldCount || !used.has(identifier)) {
      used.add(identifier);
      return field;
    }

    let suffix = 2;
    let disambiguated = `${identifier}${String(suffix)}`;
    while (used.has(disambiguated)) {
      suffix += 1;
      disambiguated = `${identifier}${String(suffix)}`;
    }
    used.add(disambiguated);
    return `${disambiguated}${field.slice(identifier.length)}`;
  });
}

function leadingIdentifier(field: string): string {
  const separator = field.indexOf(' ');
  return separator === -1 ? field : field.slice(0, separator);
}

function generateScalarField(field: Field): string {
  const attributes: string[] = [];
  if (field.isPrimaryKey) attributes.push('@id');
  if (field.isAutoIncrement) attributes.push('@default(autoincrement())');
  if (field.isUnique) attributes.push('@unique');
  if (field.defaultValue !== undefined && !field.isAutoIncrement && !isAutoIncrementMarker(field.defaultValue)) {
    attributes.push(`@default(${formatDefault(field.defaultValue)})`);
  }
  const type = `${prismaType(field)}${field.isRequired ? '' : '?'}`;
  return [prismaIdentifier(field.name), type, ...attributes].join(' ');
}

/**
 * A relation whose fromField names a scalar field is treated as owning because
 * the shared schema has no separate ownership flag. This heuristic is shared
 * with Drizzle generation and cannot represent an implicit many-to-many join.
 */
function owningRelations(table: Table): ReadonlyMap<string, Relation> {
  const fieldNames = new Set(table.fields.map((field) => field.name));
  const owning = new Map<string, Relation>();
  for (const relation of table.relations) {
    if (relation.type !== 'many-to-many' && fieldNames.has(relation.fromField) && !owning.has(relation.fromField)) {
      owning.set(relation.fromField, relation);
    }
  }
  return owning;
}

function generateRelationField(
  table: Table,
  relation: Relation,
  owning: ReadonlyMap<string, Relation>,
  modelNames: ReadonlyMap<string, string>,
): string {
  const targetModel = requiredModelName(relation.toTable, modelNames);
  const isOwning = owning.get(relation.fromField) === relation;
  if (!isOwning) {
    const relationType = relation.type === 'one-to-many' ? `${targetModel}[]` : `${targetModel}?`;
    return `${prismaIdentifier(relation.fromField)} ${relationType}`;
  }

  const fieldName = navigationName(relation.toTable);
  const scalarField = table.fields.find((field) => field.name === relation.fromField);
  const optional = scalarField?.isRequired === false ? '?' : '';
  const onDelete = relation.onDelete === undefined ? '' : `, onDelete: ${relation.onDelete}`;
  return `${prismaIdentifier(fieldName)} ${targetModel}${optional} @relation(fields: [${prismaIdentifier(relation.fromField)}], references: [${prismaIdentifier(relation.toField)}]${onDelete})`;
}

function prismaType(field: Field): string {
  if (field.type === 'Int') return 'Int';
  if (field.type === 'String') return 'String';
  if (field.type === 'Boolean') return 'Boolean';
  if (field.type === 'DateTime') return 'DateTime';
  if (field.type === 'Float') return 'Float';
  if (field.type === 'Json') return 'Json';
  return 'String';
}

function manyToManyWarnings(tables: readonly Table[]): ConversionWarning[] {
  return tables.flatMap((table) => table.relations
    .filter((relation) => relation.type === 'many-to-many')
    .map((relation) => ({
      table: table.name,
      issue: `Many-to-many relation to '${relation.toTable}' requires an explicit join table, which is not yet generated automatically — define it manually in Prisma.`,
    })));
}

function warningsForTables(warnings: readonly ConversionWarning[]): ReadonlyMap<string, readonly ConversionWarning[]> {
  const byTable = new Map<string, ConversionWarning[]>();
  for (const warning of warnings) {
    const current = byTable.get(warning.table) ?? [];
    current.push(warning);
    byTable.set(warning.table, current);
  }
  return byTable;
}

function formatWarning(warning: ConversionWarning): string {
  const source = warning.originalSource ?? '(not available)';
  return `// ⚠️ Prizzle could not convert: ${warning.issue}\n// Original source: ${source}`;
}

function modelNamesForTables(tables: readonly Table[]): ReadonlyMap<string, string> {
  const modelNames = new Map<string, string>();
  const used = new Set<string>();
  for (const table of tables) {
    const base = pascalIdentifier(table.name);
    let modelName = base;
    let suffix = 2;
    while (used.has(modelName)) {
      modelName = `${base}${String(suffix)}`;
      suffix += 1;
    }
    used.add(modelName);
    modelNames.set(table.name, modelName);
  }
  return modelNames;
}

function requiredModelName(tableName: string, modelNames: ReadonlyMap<string, string>): string {
  const modelName = modelNames.get(tableName);
  if (modelName === undefined) throw new Error(`Relation target table '${tableName}' is not present in the schema.`);
  return modelName;
}

function navigationName(tableName: string): string {
  const name = camelIdentifier(tableName);
  return name.endsWith('s') && name.length > 1 ? name.slice(0, -1) : name;
}

function prismaIdentifier(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : camelIdentifier(name);
}

function pascalIdentifier(name: string): string {
  const camel = camelIdentifier(name);
  return `${camel[0]?.toUpperCase() ?? ''}${camel.slice(1)}`;
}

function camelIdentifier(name: string): string {
  const words = name.split(/[^A-Za-z0-9_]+|_|(?<=[a-z])(?=[A-Z])/).filter((word) => word.length > 0);
  const identifier = words.map((word, index) => {
    const lower = word.toLowerCase();
    return index === 0 ? lower : `${lower[0]?.toUpperCase() ?? ''}${lower.slice(1)}`;
  }).join('');
  const fallback = identifier === '' ? 'field' : identifier;
  return /^[A-Za-z_]/.test(fallback) ? fallback : `field${fallback}`;
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function formatDefault(value: unknown): string {
  if (isFunctionCallMarker(value)) {
    return `${value.name}(${value.args.map((argument) => formatDefault(argument)).join(', ')})`;
  }
  return typeof value === 'string' ? quote(value) : JSON.stringify(value);
}

function isAutoIncrementMarker(value: unknown): boolean {
  return isFunctionCallMarker(value) && value.name.toLowerCase() === 'autoincrement';
}

function isFunctionCallMarker(value: unknown): value is { name: string; args: readonly unknown[] } {
  return isRecord(value) && typeof value.name === 'string' && Array.isArray(value.args);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
