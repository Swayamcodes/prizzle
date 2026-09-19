'use client';

import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';

const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then((module) => module.Editor),
  { ssr: false, loading: () => <div className="p-4 text-sm text-slate-500">Loading editor…</div> },
);

type SchemaFormat = 'prisma' | 'drizzle';

const EXAMPLE_SCHEMAS: Readonly<Record<SchemaFormat, string>> = {
  prisma: `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  posts Post[]
}

model Post {
  id       Int  @id @default(autoincrement())
  authorId Int
  author   User @relation(fields: [authorId], references: [id], onDelete: Cascade)
}`,
  drizzle: `import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: integer('id').primaryKey(),
  email: text('email').notNull().unique(),
});

export const posts = pgTable('posts', {
  id: integer('id').primaryKey(),
  authorId: integer('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
});

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
}));`,
};

interface ValidationIssue {
  table: string;
  issue: string;
}

interface ConversionWarning extends ValidationIssue {
  originalSource?: string;
}

interface ConversionResult {
  output: string;
  conversionWarnings: ConversionWarning[];
  validation: {
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
  };
}

interface IssueSectionProps {
  title: string;
  issues: readonly ConversionWarning[];
  tone: 'error' | 'warning';
}

export function ConverterPanel(): React.JSX.Element {
  const [sourceFormat, setSourceFormat] = useState<SchemaFormat>('prisma');
  const [targetFormat, setTargetFormat] = useState<SchemaFormat>('drizzle');
  const [sourceSchema, setSourceSchema] = useState('');
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const activeRequest = useRef(0);
  const abortController = useRef<AbortController | null>(null);

  const cancelActiveRequest = (): void => {
    activeRequest.current += 1;
    abortController.current?.abort();
    abortController.current = null;
    setIsConverting(false);
  };

  const handleConvert = async (): Promise<void> => {
    if (sourceFormat === targetFormat) return;

    if (sourceSchema.trim() === '') {
      setResult(null);
      setError('Paste a schema to convert, or load the example to get started.');
      return;
    }

    const requestId = activeRequest.current + 1;
    activeRequest.current = requestId;
    abortController.current?.abort();
    const controller = new AbortController();
    abortController.current = controller;

    setIsConverting(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceFormat, targetFormat, schema: sourceSchema }),
        signal: controller.signal,
      });
      const body: unknown = await response.json().catch(() => null);

      if (requestId !== activeRequest.current) return;
      if (!response.ok) {
        setError(responseErrorMessage(body));
        return;
      }
      if (!isConversionResult(body)) {
        setError('The conversion service returned an unexpected response.');
        return;
      }
      setResult(body);
    } catch (requestError: unknown) {
      if (requestId !== activeRequest.current || isAbortError(requestError)) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to reach the conversion service.',
      );
    } finally {
      if (requestId === activeRequest.current) {
        abortController.current = null;
        setIsConverting(false);
      }
    }
  };

  const selectSourceFormat = (format: SchemaFormat): void => {
    cancelActiveRequest();
    setResult(null);
    setError(null);
    setSourceFormat(format);
    if (format === targetFormat) setTargetFormat(otherFormat(format));
  };

  const selectTargetFormat = (format: SchemaFormat): void => {
    cancelActiveRequest();
    setResult(null);
    setError(null);
    setTargetFormat(format);
    if (format === sourceFormat) setSourceFormat(otherFormat(format));
  };

  const loadExample = (): void => {
    cancelActiveRequest();
    setSourceSchema(EXAMPLE_SCHEMAS[sourceFormat]);
    setResult(null);
    setError(null);
  };

  const changeSourceSchema = (value: string | undefined): void => {
    if (abortController.current !== null) cancelActiveRequest();
    setSourceSchema(value ?? '');
  };

  const issues = result === null ? [] : [
    ...result.conversionWarnings,
    ...result.validation.errors,
    ...result.validation.warnings,
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Source format
          <select
            value={sourceFormat}
            onChange={(event) => { selectSourceFormat(selectFormat(event.target.value)); }}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-slate-900"
          >
            <option value="prisma">Prisma</option>
            <option value="drizzle">Drizzle</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Target format
          <select
            value={targetFormat}
            onChange={(event) => { selectTargetFormat(selectFormat(event.target.value)); }}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-slate-900"
          >
            <option value="prisma">Prisma</option>
            <option value="drizzle">Drizzle</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => { void handleConvert(); }}
          disabled={isConverting || sourceFormat === targetFormat}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isConverting ? 'Converting…' : 'Convert'}
        </button>
        <button
          type="button"
          onClick={loadExample}
          className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800"
        >
          Load {sourceFormat === 'prisma' ? 'Prisma' : 'Drizzle'} example
        </button>
      </div>

      {error !== null && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <EditorPane title="Source schema">
          <MonacoEditor
            height="480px"
            language={editorLanguage(sourceFormat)}
            value={sourceSchema}
            onChange={changeSourceSchema}
            options={{ minimap: { enabled: false }, wordWrap: 'on' }}
          />
        </EditorPane>
        <EditorPane title="Converted schema">
          <MonacoEditor
            height="480px"
            language={editorLanguage(targetFormat)}
            value={result?.output ?? ''}
            options={{ minimap: { enabled: false }, readOnly: true, wordWrap: 'on' }}
          />
        </EditorPane>
      </div>

      {sourceSchema.trim() === '' && error === null && (
        <p className="text-sm text-slate-600">
          Paste a schema above, or load the example to get started.
        </p>
      )}

      {issues.length > 0 && result !== null && (
        <div className="grid gap-4 lg:grid-cols-3">
          <IssueSection title="Conversion warnings" issues={result.conversionWarnings} tone="warning" />
          <IssueSection title="Validation errors" issues={result.validation.errors} tone="error" />
          <IssueSection title="Validation warnings" issues={result.validation.warnings} tone="warning" />
        </div>
      )}
    </section>
  );
}

function EditorPane({ children, title }: { children: React.ReactNode; title: string }): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">{title}</h2>
      {children}
    </div>
  );
}

function IssueSection({ issues, title, tone }: IssueSectionProps): React.JSX.Element | null {
  if (issues.length === 0) return null;

  const styles = tone === 'error'
    ? 'border-red-200 bg-red-50 text-red-950'
    : 'border-amber-200 bg-amber-50 text-amber-950';
  return (
    <section className={`rounded-lg border p-4 ${styles}`}>
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="mt-2 space-y-3 text-sm">
        {issues.map((issue, index) => (
          <li key={`${issue.table}-${issue.issue}-${String(index)}`}>
            <p><span className="font-semibold">{issue.table}:</span> {issue.issue}</p>
            {issue.originalSource !== undefined && (
              <pre className="mt-1 overflow-x-auto rounded bg-black/5 p-2 text-xs">{issue.originalSource}</pre>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function otherFormat(format: SchemaFormat): SchemaFormat {
  return format === 'prisma' ? 'drizzle' : 'prisma';
}

function selectFormat(value: string): SchemaFormat {
  return value === 'prisma' ? 'prisma' : 'drizzle';
}

function editorLanguage(format: SchemaFormat): 'plaintext' | 'typescript' {
  // Monaco has no official Prisma language definition, so plaintext avoids implying unsupported syntax highlighting.
  return format === 'prisma' ? 'plaintext' : 'typescript';
}

function responseErrorMessage(body: unknown): string {
  if (isRecord(body) && typeof body.error === 'string') return body.error;
  return 'Conversion failed.';
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isConversionResult(value: unknown): value is ConversionResult {
  return isRecord(value)
    && typeof value.output === 'string'
    && Array.isArray(value.conversionWarnings)
    && isRecord(value.validation)
    && Array.isArray(value.validation.errors)
    && Array.isArray(value.validation.warnings);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
