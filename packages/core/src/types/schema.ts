export interface Schema {
  database: 'postgresql' | 'mysql' | 'sqlite';
  tables: Table[];
  warnings?: ConversionWarning[];
}

export interface ConversionWarning {
  table: string;
  issue: string;
  originalSource?: string;
}

export interface Table {
  name: string;
  fields: Field[];
  relations: Relation[];
}

export interface Field {
  name: string;
  type: string;
  isRequired: boolean;
  isUnique: boolean;
  isPrimaryKey: boolean;
  isAutoIncrement: boolean;
  defaultValue?: unknown;
  dbType?: string;
}

export interface Relation {
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  fromField: string;
  toTable: string;
  toField: string;
  onDelete?: 'Cascade' | 'SetNull' | 'Restrict';
}
