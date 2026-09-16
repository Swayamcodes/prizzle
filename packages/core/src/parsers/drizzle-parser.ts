import ts from 'typescript';

import type { ConversionWarning, Field, Relation, Schema, Table } from '../types/schema.js';

type Database = Schema['database'];

interface ParsedTable {
  variableName: string;
  table: Table;
  foreignKeys: Map<string, ForeignKey>;
}

interface ForeignKey {
  tableVariable: string;
  fieldName: string;
}

interface RelationDeclaration {
  tableVariable: string;
  callback: ts.ArrowFunction | ts.FunctionExpression;
}

const TABLE_FUNCTIONS: ReadonlyMap<string, Database> = new Map([
  ['pgTable', 'postgresql'],
  ['mysqlTable', 'mysql'],
  ['sqliteTable', 'sqlite'],
]);

const KNOWN_COLUMN_METHODS: ReadonlySet<string> = new Set([
  'primaryKey',
  'notNull',
  'unique',
  'default',
  'defaultNow',
  'references',
  '$type',
  'autoincrement',
  '$onUpdateFn',
]);

/**
 * Parses the conventional Drizzle TypeScript schema declarations into Prizzle's
 * framework-independent schema. TypeScript's parser is used so comments,
 * multiline calls, and nested callbacks retain their actual syntactic shape.
 */
export async function parseDrizzleSchema(schemaString: string): Promise<Schema> {
  const sourceFile = await Promise.resolve(ts.createSourceFile(
    'schema.ts',
    schemaString,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  ));
  const diagnostics = ts.transpileModule(schemaString, {
    compilerOptions: { target: ts.ScriptTarget.Latest },
    reportDiagnostics: true,
  }).diagnostics ?? [];
  const diagnostic = diagnostics.find((candidate) => candidate.category === ts.DiagnosticCategory.Error);
  if (diagnostic !== undefined) {
    throw new Error(`Drizzle schema could not be parsed: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
  }

  const warnings: ConversionWarning[] = [];
  const parsedTables: ParsedTable[] = [];
  const relationDeclarations: RelationDeclaration[] = [];
  const dialects = new Set<Database>();

  ts.forEachChild(sourceFile, (node) => {
    if (!ts.isVariableStatement(node) || !hasExportModifier(node)) return;

    for (const declaration of node.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) continue;
      const tableCall = tableFunctionCall(declaration.initializer);
      if (tableCall !== undefined) {
        dialects.add(tableCall.database);
        parsedTables.push(parseTable(declaration.name.text, tableCall.call, tableCall.database, sourceFile, warnings));
        continue;
      }

      const relationCall = relationsCall(declaration.initializer);
      if (relationCall !== undefined) {
        relationDeclarations.push(relationCall);
      }
    }
  });

  if (parsedTables.length === 0) {
    throw new Error('Drizzle schema must export at least one pgTable, mysqlTable, or sqliteTable declaration.');
  }
  if (dialects.size !== 1) {
    throw new Error('Drizzle schema mixes database dialects. Use only one of pgTable, mysqlTable, or sqliteTable per schema.');
  }

  const tablesByVariable = new Map(parsedTables.map((parsed) => [parsed.variableName, parsed]));
  for (const declaration of relationDeclarations) {
    applyRelations(declaration, tablesByVariable);
  }

  const parsedSchema: Schema = {
    database: firstSetValue(dialects),
    tables: parsedTables.map((parsed) => parsed.table),
  };
  if (warnings.length > 0) parsedSchema.warnings = warnings;
  return parsedSchema;
}

function parseTable(
  variableName: string,
  call: ts.CallExpression,
  _database: Database,
  sourceFile: ts.SourceFile,
  warnings: ConversionWarning[],
): ParsedTable {
  const nameArgument = call.arguments[0];
  const columnsArgument = call.arguments[1];
  if (!isStringLiteral(nameArgument) || !isObjectLiteralArgument(columnsArgument)) {
    throw new Error(
      `Drizzle table '${variableName}' must call its table function with a string table name and an object literal of columns.`,
    );
  }

  const table: Table = { name: nameArgument.text, fields: [], relations: [] };
  const foreignKeys = new Map<string, ForeignKey>();
  for (const property of columnsArgument.properties) {
    if (!ts.isPropertyAssignment(property)) {
      throw new Error(`Drizzle table '${table.name}' contains a column that is not a property assignment.`);
    }
    const fieldName = propertyName(property.name);
    if (fieldName === undefined) {
      throw new Error(`Drizzle table '${table.name}' contains a column with an unsupported property name.`);
    }
    const column = parseColumn(property.initializer, table.name, fieldName, sourceFile, warnings);
    table.fields.push(column.field);
    if (column.foreignKey !== undefined) foreignKeys.set(fieldName, column.foreignKey);
  }

  for (const argument of call.arguments.slice(2)) {
    collectUnsupportedTableConstructs(argument, table.name, sourceFile, warnings);
  }
  return { variableName, table, foreignKeys };
}

function parseColumn(
  initializer: ts.Expression,
  tableName: string,
  fieldName: string,
  sourceFile: ts.SourceFile,
  warnings: ConversionWarning[],
): { field: Field; foreignKey?: ForeignKey } {
  const calls = callChain(initializer);
  const builder = calls.at(-1);
  if (builder === undefined || !ts.isIdentifier(builder.expression)) {
    throw new Error(`Column '${tableName}.${fieldName}' must start with a Drizzle column builder call.`);
  }

  const builderName = builder.expression.text;
  const field: Field = {
    name: fieldName,
    type: drizzleType(builderName),
    isRequired: false,
    isUnique: false,
    isPrimaryKey: false,
    isAutoIncrement: isAutoIncrementBuilder(builderName),
  };
  let foreignKey: ForeignKey | undefined;

  for (const call of calls) {
    const methodName = calledPropertyName(call);
    if (methodName === undefined) continue;
    if (methodName === 'primaryKey') field.isPrimaryKey = true;
    if (methodName === 'notNull') field.isRequired = true;
    if (methodName === 'unique') field.isUnique = true;
    if (methodName === 'autoincrement') field.isAutoIncrement = true;
    if (methodName === '$onUpdateFn') field.isUpdatedAt = true;
    if (methodName === 'defaultNow') field.defaultValue = { name: 'now', args: [] };
    if (methodName === 'default' && call.arguments[0] !== undefined) {
      field.defaultValue = valueFromExpression(call.arguments[0], sourceFile);
    }
    if (methodName === 'references') {
      const reference = referenceFromCall(call);
      if (reference !== undefined) foreignKey = reference;
    }
    if (methodName === '$type') {
      warn(warnings, tableName, 'Custom Drizzle .$type<T>() declarations are not supported.', call, sourceFile);
    }
    if (!KNOWN_COLUMN_METHODS.has(methodName)) {
      warn(warnings, tableName, `Column '${fieldName}' uses unsupported Drizzle method '.${methodName}()'.`, call, sourceFile);
    }
  }
  if (field.isPrimaryKey) field.isRequired = true;
  return foreignKey === undefined ? { field } : { field, foreignKey };
}

/**
 * Method chains are nested AST calls: `integer().notNull()` is a CallExpression
 * whose callee contains the prior CallExpression. Walking inward therefore
 * yields every constraint without relying on source-text patterns.
 */
function callChain(expression: ts.Expression): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  let current: ts.Expression = expression;
  while (ts.isCallExpression(current)) {
    calls.push(current);
    if (!ts.isPropertyAccessExpression(current.expression)) break;
    current = current.expression.expression;
  }
  return calls;
}

function applyRelations(
  declaration: RelationDeclaration,
  tablesByVariable: ReadonlyMap<string, ParsedTable>,
): void {
  const owner = tablesByVariable.get(declaration.tableVariable);
  if (owner === undefined) return;
  const body = declaration.callback.body;
  if (ts.isBlock(body)) return;
  const relationBody = unwrapParens(body);
  if (!ts.isObjectLiteralExpression(relationBody)) return;

  for (const property of relationBody.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isCallExpression(property.initializer)) continue;
    const relationName = propertyName(property.name);
    if (relationName === undefined) continue;
    const helper = identifierCallName(property.initializer);
    const targetArgument = property.initializer.arguments[0];
    if (targetArgument === undefined || (helper !== 'one' && helper !== 'many') || !ts.isIdentifier(targetArgument)) continue;
    const target = tablesByVariable.get(targetArgument.text);
    if (target === undefined) continue;

    const relation = helper === 'one'
      ? oneRelation(owner, target, property.initializer)
      : manyRelation(owner, target, relationName);
    if (relation !== undefined) owner.table.relations.push(relation);
  }
}

function unwrapParens(node: ts.Expression): ts.Expression {
  let current = node;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

/**
 * Drizzle's `relations(table, ({ one, many }) => ({ ... }))` callback names
 * navigation fields, but actual joins live on scalar `.references(() => x.id)`
 * chains. Resolve those scalar references first; the callback only declares
 * which table relationship should be exposed.
 */
function oneRelation(owner: ParsedTable, target: ParsedTable, call: ts.CallExpression): Relation | undefined {
  const configuredField = configuredFieldName(call);
  const foreignKey = configuredField === undefined ? undefined : owner.foreignKeys.get(configuredField);
  const matching = configuredField !== undefined && foreignKey?.tableVariable === target.variableName
    ? { fieldName: configuredField, foreignKey }
    : firstForeignKeyTo(owner, target.variableName);
  if (matching === undefined) return undefined;
  const field = owner.table.fields.find((candidate) => candidate.name === matching.fieldName);
  return {
    type: field?.isUnique === true ? 'one-to-one' : 'one-to-many',
    fromField: matching.fieldName,
    toTable: target.table.name,
    toField: matching.foreignKey.fieldName,
  };
}

function manyRelation(owner: ParsedTable, target: ParsedTable, relationName: string): Relation | undefined {
  const matching = firstForeignKeyTo(target, owner.variableName);
  if (matching === undefined) return undefined;
  return {
    type: 'one-to-many',
    fromField: relationName,
    toTable: target.table.name,
    toField: matching.fieldName,
  };
}

function firstForeignKeyTo(table: ParsedTable, targetVariable: string): { fieldName: string; foreignKey: ForeignKey } | undefined {
  for (const [fieldName, foreignKey] of table.foreignKeys) {
    if (foreignKey.tableVariable === targetVariable) return { fieldName, foreignKey };
  }
  return undefined;
}

function configuredFieldName(call: ts.CallExpression): string | undefined {
  const config = call.arguments[1];
  if (config === undefined || !ts.isObjectLiteralExpression(config)) return undefined;
  const fields = config.properties.find(
    (property): property is ts.PropertyAssignment => ts.isPropertyAssignment(property) && propertyName(property.name) === 'fields',
  );
  if (fields === undefined || !ts.isArrayLiteralExpression(fields.initializer)) return undefined;
  const field = fields.initializer.elements[0];
  return field !== undefined && ts.isPropertyAccessExpression(field) ? field.name.text : undefined;
}

function tableFunctionCall(initializer: ts.Expression): { call: ts.CallExpression; database: Database } | undefined {
  if (!ts.isCallExpression(initializer) || !ts.isIdentifier(initializer.expression)) return undefined;
  const database = TABLE_FUNCTIONS.get(initializer.expression.text);
  return database === undefined ? undefined : { call: initializer, database };
}

function relationsCall(initializer: ts.Expression): RelationDeclaration | undefined {
  if (!ts.isCallExpression(initializer) || identifierCallName(initializer) !== 'relations') return undefined;
  const table = initializer.arguments[0];
  const callback = initializer.arguments[1];
  if (
    table === undefined ||
    callback === undefined ||
    !ts.isIdentifier(table) ||
    !(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
  ) return undefined;
  return { tableVariable: table.text, callback };
}

function referenceFromCall(call: ts.CallExpression): ForeignKey | undefined {
  const callback = call.arguments[0];
  if (callback === undefined || !(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) return undefined;
  const body = callback.body;
  if (!ts.isPropertyAccessExpression(body) || !ts.isIdentifier(body.expression)) return undefined;
  return { tableVariable: body.expression.text, fieldName: body.name.text };
}

function collectUnsupportedTableConstructs(
  node: ts.Node,
  tableName: string,
  sourceFile: ts.SourceFile,
  warnings: ConversionWarning[],
): void {
  ts.forEachChild(node, (child) => {
    if (ts.isCallExpression(child)) {
      const name = identifierCallName(child);
      if (name === 'index' || name === 'uniqueIndex') {
        warn(warnings, tableName, 'Drizzle indexes and named indexes are not supported.', child, sourceFile);
      }
      if (name === 'primaryKey' && hasColumnsOption(child)) {
        warn(warnings, tableName, 'Composite primary keys cannot be represented by single-field primary key metadata.', child, sourceFile);
      }
      if (name === 'foreignKey' && hasColumnsOption(child)) {
        warn(
          warnings,
          tableName,
          'Composite/table-level foreign keys cannot be represented by single-field relation metadata.',
          child,
          sourceFile,
        );
      }
    }
    collectUnsupportedTableConstructs(child, tableName, sourceFile, warnings);
  });
}

function hasColumnsOption(call: ts.CallExpression): boolean {
  const argument = call.arguments[0];
  return argument !== undefined && ts.isObjectLiteralExpression(argument) && argument.properties.some(
    (property) => ts.isPropertyAssignment(property) && propertyName(property.name) === 'columns',
  );
}

function drizzleType(builderName: string): string {
  if (['serial', 'smallserial', 'bigserial', 'integer', 'smallint', 'bigint', 'int'].includes(builderName)) return 'Int';
  if (['varchar', 'char', 'text', 'uuid', 'citext'].includes(builderName)) return 'String';
  if (builderName === 'boolean') return 'Boolean';
  if (['timestamp', 'date', 'datetime'].includes(builderName)) return 'DateTime';
  if (['real', 'doublePrecision', 'double', 'float', 'decimal', 'numeric'].includes(builderName)) return 'Float';
  if (['json', 'jsonb'].includes(builderName)) return 'Json';
  return 'String';
}

function isAutoIncrementBuilder(builderName: string): boolean {
  return ['serial', 'smallserial', 'bigserial'].includes(builderName);
}

function valueFromExpression(expression: ts.Expression, sourceFile: ts.SourceFile): unknown {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  if (ts.isNumericLiteral(expression)) return Number(expression.text);
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (expression.kind === ts.SyntaxKind.NullKeyword) return null;
  return snippet(expression, sourceFile);
}

function warn(warnings: ConversionWarning[], table: string, issue: string, node: ts.Node, sourceFile: ts.SourceFile): void {
  warnings.push({ table, issue, originalSource: snippet(node, sourceFile) });
}

function snippet(node: ts.Node, sourceFile: ts.SourceFile): string {
  return sourceFile.text.slice(node.pos, node.end).trim();
}

function hasExportModifier(node: ts.VariableStatement): boolean {
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function propertyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) ? name.text : undefined;
}

function calledPropertyName(call: ts.CallExpression): string | undefined {
  return ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : undefined;
}

function identifierCallName(call: ts.CallExpression): string | undefined {
  return ts.isIdentifier(call.expression) ? call.expression.text : undefined;
}

function isStringLiteral(node: ts.Node | undefined): node is ts.StringLiteral {
  return node !== undefined && ts.isStringLiteral(node);
}

function isObjectLiteralArgument(node: ts.Expression | undefined): node is ts.ObjectLiteralExpression {
  return node !== undefined && ts.isObjectLiteralExpression(node);
}

function firstSetValue<T>(values: ReadonlySet<T>): T {
  const value = values.values().next().value;
  if (value === undefined) throw new Error('Drizzle schema did not identify a database dialect.');
  return value;
}
