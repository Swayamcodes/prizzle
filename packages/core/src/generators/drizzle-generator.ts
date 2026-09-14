import prettier from 'prettier';

import type { ConversionWarning, Field, Relation, Schema, Table } from '../types/schema.js';

interface DialectConfig {
  tableFunction: string;
  importPath: string;
}

interface GeneratedColumn {
  source: string;
  imports: readonly string[];
  ormImports: readonly string[];
}

const DIALECTS: Readonly<Record<Schema['database'], DialectConfig>> = {
  postgresql: { tableFunction: 'pgTable', importPath: 'drizzle-orm/pg-core' },
  mysql: { tableFunction: 'mysqlTable', importPath: 'drizzle-orm/mysql-core' },
  sqlite: { tableFunction: 'sqliteTable', importPath: 'drizzle-orm/sqlite-core' },
};

/** Generates a formatted Drizzle schema from Prizzle's framework-independent representation. */
export async function generateDrizzleSchema(schema: Schema): Promise<string> {
  const dialect = DIALECTS[schema.database];
  const tableVariables = tableVariableNames(schema.tables);
  const warningsByTable = warningsForTables([
    ...(schema.warnings ?? []),
    ...manyToManyWarnings(schema.tables),
  ]);
  const columnImports = new Set<string>([dialect.tableFunction]);
  const ormImports = new Set<string>();
  const sections: string[] = [];

  for (const table of schema.tables) {
    const tableSource = generateTable(
      table,
      schema.database,
      tableVariables,
      warningsByTable.get(table.name) ?? [],
      columnImports,
      ormImports,
    );
    sections.push(tableSource);
  }

  const relationTables = schema.tables.filter((table) => table.relations.some((relation) => relation.type !== 'many-to-many'));
  if (relationTables.length > 0) {
    ormImports.add('relations');
    const relationBlocks = relationTables.map((table) => generateRelations(table, tableVariables));
    sections.push(relationBlocks.join('\n\n'));
  }

  const imports = [
    `import { ${[...columnImports].sort().join(', ')} } from '${dialect.importPath}';`,
    ...(ormImports.size > 0 ? [`import { ${[...ormImports].sort().join(', ')} } from 'drizzle-orm';`] : []),
  ].join('\n');
  return prettier.format([imports, ...sections].join('\n\n'), { parser: 'typescript' });
}

function generateTable(
  table: Table,
  database: Schema['database'],
  tableVariables: ReadonlyMap<string, string>,
  warnings: readonly ConversionWarning[],
  columnImports: Set<string>,
  ormImports: Set<string>,
): string {
  const variableName = requiredTableVariable(table.name, tableVariables);
  const referencesByField = owningRelations(table);
  const warningComments = warnings.map(formatWarning).join('\n');
  const columns = table.fields.map((field) => {
    const generated = generateColumn(field, database, referencesByField.get(field.name), tableVariables);
    for (const imported of generated.imports) columnImports.add(imported);
    for (const imported of generated.ormImports) ormImports.add(imported);
    return `${formatPropertyKey(field.name)}: ${generated.source}`;
  });
  const declaration = `export const ${variableName} = ${DIALECTS[database].tableFunction}(${quote(table.name)}, {\n${columns.map((column) => `  ${column},`).join('\n')}\n});`;
  return warningComments === '' ? declaration : `${warningComments}\n${declaration}`;
}

function generateColumn(
  field: Field,
  database: Schema['database'],
  relation: Relation | undefined,
  tableVariables: ReadonlyMap<string, string>,
): GeneratedColumn {
  const generated = columnBuilder(field, database);
  const chain: string[] = [];
  const ormImports: string[] = [];
  const sqliteAutoIncrement = database === 'sqlite' && field.type === 'Int' && field.isAutoIncrement;

  if (field.isRequired) chain.push('.notNull()');
  if (field.isUnique) chain.push('.unique()');
  if (field.isPrimaryKey && !sqliteAutoIncrement) chain.push('.primaryKey()');
  if (field.defaultValue !== undefined && !isAutoIncrementMarker(field.defaultValue)) {
    if (isFunctionCallMarker(field.defaultValue)) {
      ormImports.push('sql');
      chain.push(`.default(sql\`${formatSqlFunctionCall(field.defaultValue)}\`)`);
    } else {
      chain.push(`.default(${formatDefault(field.defaultValue)})`);
    }
  }
  if (relation !== undefined) {
    const targetVariable = requiredTableVariable(relation.toTable, tableVariables);
    const onDelete = relation.onDelete === undefined ? '' : `, { onDelete: '${drizzleOnDelete(relation.onDelete)}' }`;
    chain.push(`.references(() => ${targetVariable}.${formatPropertyKey(relation.toField)}${onDelete})`);
  }
  return { source: `${generated.source}${chain.join('')}`, imports: generated.imports, ormImports };
}

function columnBuilder(field: Field, database: Schema['database']): GeneratedColumn {
  const name = quote(field.name);
  if (field.type === 'Int') {
    if (field.isAutoIncrement && database === 'postgresql') return { source: `serial(${name})`, imports: ['serial'], ormImports: [] };
    if (field.isAutoIncrement && database === 'mysql') return { source: `int(${name}).autoincrement()`, imports: ['int'], ormImports: [] };
    if (database === 'mysql') return { source: `int(${name})`, imports: ['int'], ormImports: [] };
    if (database === 'sqlite') {
      const suffix = field.isAutoIncrement ? '.primaryKey({ autoIncrement: true })' : '';
      return { source: `integer(${name}, { mode: 'number' })${suffix}`, imports: ['integer'], ormImports: [] };
    }
    return { source: `integer(${name})`, imports: ['integer'], ormImports: [] };
  }
  if (field.type === 'String') {
    if (database === 'mysql' && (field.isUnique || field.isPrimaryKey)) {
      // MySQL requires a key length for TEXT/BLOB keys; 191 follows convention while staying under utf8mb4 index limits.
      return { source: `varchar(${name}, { length: 191 })`, imports: ['varchar'], ormImports: [] };
    }
    return { source: `text(${name})`, imports: ['text'], ormImports: [] };
  }
  if (field.type === 'Boolean') {
    return database === 'sqlite'
      ? { source: `integer(${name}, { mode: 'boolean' })`, imports: ['integer'], ormImports: [] }
      : { source: `boolean(${name})`, imports: ['boolean'], ormImports: [] };
  }
  if (field.type === 'DateTime') {
    if (database === 'postgresql') return { source: `timestamp(${name})`, imports: ['timestamp'], ormImports: [] };
    if (database === 'mysql') return { source: `datetime(${name})`, imports: ['datetime'], ormImports: [] };
    return { source: `integer(${name}, { mode: 'timestamp' })`, imports: ['integer'], ormImports: [] };
  }
  if (field.type === 'Float') {
    if (database === 'postgresql') return { source: `doublePrecision(${name})`, imports: ['doublePrecision'], ormImports: [] };
    if (database === 'mysql') return { source: `double(${name})`, imports: ['double'], ormImports: [] };
    return { source: `real(${name})`, imports: ['real'], ormImports: [] };
  }
  if (field.type === 'Json') {
    if (database === 'postgresql') return { source: `jsonb(${name})`, imports: ['jsonb'], ormImports: [] };
    if (database === 'mysql') return { source: `json(${name})`, imports: ['json'], ormImports: [] };
    return { source: `text(${name}, { mode: 'json' })`, imports: ['text'], ormImports: [] };
  }
  return { source: `text(${name})`, imports: ['text'], ormImports: [] };
}

/**
 * A relation whose fromField names a scalar field is treated as owning because
 * it can be emitted as that field's foreign key. This is a representation
 * heuristic: the shared schema does not otherwise preserve ownership metadata.
 */
function owningRelations(table: Table): ReadonlyMap<string, Relation> {
  const fields = new Set(table.fields.map((field) => field.name));
  const relations = new Map<string, Relation>();
  for (const relation of table.relations) {
    if (relation.type !== 'many-to-many' && fields.has(relation.fromField) && !relations.has(relation.fromField)) {
      relations.set(relation.fromField, relation);
    }
  }
  return relations;
}

function generateRelations(table: Table, tableVariables: ReadonlyMap<string, string>): string {
  const variableName = requiredTableVariable(table.name, tableVariables);
  const fieldNames = new Set(table.fields.map((field) => field.name));
  const properties = table.relations.filter((relation) => relation.type !== 'many-to-many').map((relation) => {
    const owning = fieldNames.has(relation.fromField);
    const propertyName = owning ? navigationName(relation.toTable) : relation.fromField;
    const targetVariable = requiredTableVariable(relation.toTable, tableVariables);
    if (!owning) return `${formatPropertyKey(propertyName)}: many(${targetVariable})`;
    return `${formatPropertyKey(propertyName)}: one(${targetVariable}, { fields: [${variableName}.${formatPropertyKey(relation.fromField)}], references: [${targetVariable}.${formatPropertyKey(relation.toField)}] })`;
  });
  return `export const ${variableName}Relations = relations(${variableName}, ({ one, many }) => ({\n${properties.map((property) => `  ${property},`).join('\n')}\n}));`;
}

function manyToManyWarnings(tables: readonly Table[]): ConversionWarning[] {
  return tables.flatMap((table) => table.relations
    .filter((relation) => relation.type === 'many-to-many')
    .map((relation) => ({
      table: table.name,
      issue: `Many-to-many relation to '${relation.toTable}' requires an explicit join table, which is not yet generated automatically — define it manually in Drizzle.`,
    })));
}

function tableVariableNames(tables: readonly Table[]): ReadonlyMap<string, string> {
  const variables = new Map<string, string>();
  const used = new Set<string>();
  for (const table of tables) {
    const base = identifierFromName(table.name);
    let variable = base;
    let suffix = 2;
    while (used.has(variable)) {
      variable = `${base}${String(suffix)}`;
      suffix += 1;
    }
    used.add(variable);
    variables.set(table.name, variable);
  }
  return variables;
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

function navigationName(tableName: string): string {
  const name = identifierFromName(tableName);
  return name.endsWith('s') && name.length > 1 ? name.slice(0, -1) : name;
}

function identifierFromName(name: string): string {
  const words = name.split(/[^A-Za-z0-9_$]+|(?<=[a-z])(?=[A-Z])/).filter((word) => word.length > 0);
  const identifier = words.map((word, index) => index === 0 ? word.toLowerCase() : capitalize(word)).join('');
  const fallback = identifier === '' ? 'table' : identifier;
  return /^[A-Za-z_$]/.test(fallback) ? fallback : `table${fallback}`;
}

function capitalize(value: string): string {
  return `${value[0]?.toUpperCase() ?? ''}${value.slice(1).toLowerCase()}`;
}

function requiredTableVariable(tableName: string, variables: ReadonlyMap<string, string>): string {
  const variable = variables.get(tableName);
  if (variable === undefined) throw new Error(`Relation target table '${tableName}' is not present in the schema.`);
  return variable;
}

function formatPropertyKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : quote(name);
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function formatDefault(value: unknown): string {
  return typeof value === 'string' ? quote(value) : JSON.stringify(value);
}

function isAutoIncrementMarker(value: unknown): boolean {
  return isFunctionCallMarker(value) && value.name.toLowerCase() === 'autoincrement';
}

function isFunctionCallMarker(value: unknown): value is { name: string; args: readonly unknown[] } {
  return isRecord(value) && typeof value.name === 'string' && Array.isArray(value.args);
}

function formatSqlFunctionCall(marker: { name: string; args: readonly unknown[] }): string {
  return `${marker.name}(${marker.args.map((argument) => formatSqlArgument(argument)).join(', ')})`;
}

function formatSqlArgument(value: unknown): string {
  if (isFunctionCallMarker(value)) return formatSqlFunctionCall(value);
  if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`;
  return JSON.stringify(value);
}

function drizzleOnDelete(value: NonNullable<Relation['onDelete']>): string {
  if (value === 'Cascade') return 'cascade';
  if (value === 'SetNull') return 'set null';
  return 'restrict';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
