'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { UndoToast } from './UndoToast';
import { WarningDetails } from './WarningDetails';

const MonacoEditor = dynamic(() => import('@monaco-editor/react').then((module) => module.Editor), {
  ssr: false,
  loading: () => <div className="editor-loading">Loading editor…</div>,
});

type SchemaFormat = 'prisma' | 'drizzle';
type Freshness = 'empty' | 'fresh' | 'stale';

let hasConfiguredMonaco = false;

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
  validation: { errors: ValidationIssue[]; warnings: ValidationIssue[] };
}
interface UndoSnapshot {
  actionError: string | null;
  error: string | null;
  freshness: Freshness;
  result: ConversionResult | null;
  sourceFormat: SchemaFormat;
  sourceSchema: string;
  targetFormat: SchemaFormat;
}
interface SchemaEditorPaneProps {
  canClear?: boolean;
  canCopy?: boolean;
  canDownload?: boolean;
  children: React.ReactNode;
  copied?: boolean;
  filename: string;
  isExpanded?: boolean;
  isOutput?: boolean;
  onClear?: () => void;
  onCopy?: () => void;
  onDownload?: () => void;
  onLoadExample?: () => void;
  onToggleExpanded?: () => void;
  status: string;
  title: string;
}
interface MonacoApi {
  editor: { defineTheme: (themeName: string, themeData: object) => void };
  languages: {
    register: (language: { id: string }) => void;
    setMonarchTokensProvider: (languageId: string, provider: object) => void;
  };
}

export function ConverterPanel(): React.JSX.Element {
  const [sourceFormat, setSourceFormat] = useState<SchemaFormat>('prisma');
  const [targetFormat, setTargetFormat] = useState<SchemaFormat>('drizzle');
  const [sourceSchema, setSourceSchema] = useState('');
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [freshness, setFreshness] = useState<Freshness>('empty');
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [isWarningDetailsExpanded, setIsWarningDetailsExpanded] = useState(false);
  const [isSourceExpanded, setIsSourceExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null);
  const [liveMessage, setLiveMessage] = useState('');
  const activeRequest = useRef(0);
  const abortController = useRef<AbortController | null>(null);
  const sourceEditor = useRef<{ focus: () => void } | null>(null);

  const reviewItemCount =
    result === null
      ? 0
      : result.conversionWarnings.length +
        result.validation.errors.length +
        result.validation.warnings.length;
  const hasSource = sourceSchema.trim() !== '';
  const canExport = result !== null && freshness === 'fresh' && !isConverting && error === null;
  const outputStatus = statusLabel(error, freshness, isConverting, result, reviewItemCount);

  const cancelActiveRequest = (): void => {
    activeRequest.current += 1;
    abortController.current?.abort();
    abortController.current = null;
    setIsConverting(false);
  };

  const handleConvert = async (): Promise<void> => {
    if (!hasSource || sourceFormat === targetFormat || isConverting) return;
    const requestId = activeRequest.current + 1;
    activeRequest.current = requestId;
    abortController.current?.abort();
    const controller = new AbortController();
    abortController.current = controller;
    setIsConverting(true);
    setError(null);
    setActionError(null);
    setLiveMessage('Converting schema.');
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
        setLiveMessage('Conversion failed.');
        return;
      }
      if (!isConversionResult(body)) {
        setError('The conversion service returned an unexpected response.');
        setLiveMessage('Conversion failed.');
        return;
      }
      const itemCount =
        body.conversionWarnings.length +
        body.validation.errors.length +
        body.validation.warnings.length;
      setResult(body);
      setFreshness('fresh');
      setIsWarningDetailsExpanded(itemCount > 0);
      setLiveMessage(
        itemCount > 0
          ? `Conversion complete with ${String(itemCount)} warnings.`
          : 'Conversion complete.',
      );
    } catch (requestError: unknown) {
      if (requestId !== activeRequest.current || isAbortError(requestError)) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to reach the conversion service.',
      );
      setLiveMessage('Conversion failed.');
    } finally {
      if (requestId === activeRequest.current) {
        abortController.current = null;
        setIsConverting(false);
      }
    }
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void handleConvert();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return (): void => {
      window.removeEventListener('keydown', handleShortcut);
    };
  });

  const resetOutput = (): void => {
    setResult(null);
    setFreshness('empty');
    setError(null);
    setActionError(null);
    setIsWarningDetailsExpanded(false);
  };
  const swapFormats = (): void => {
    cancelActiveRequest();
    resetOutput();
    setSourceFormat(targetFormat);
    setTargetFormat(sourceFormat);
    setLiveMessage('Conversion direction swapped.');
  };
  const loadExample = (): void => {
    cancelActiveRequest();
    setSourceSchema(EXAMPLE_SCHEMAS[sourceFormat]);
    resetOutput();
    setLiveMessage(`${sourceFormat === 'prisma' ? 'Prisma' : 'Drizzle'} example loaded.`);
  };
  const changeSourceSchema = (value: string | undefined): void => {
    if (abortController.current !== null) cancelActiveRequest();
    setSourceSchema(value ?? '');
    setActionError(null);
    setError(null);
    if (result !== null) setFreshness('stale');
  };
  const clearSource = (): void => {
    setUndoSnapshot({
      actionError,
      error,
      freshness,
      result,
      sourceFormat,
      sourceSchema,
      targetFormat,
    });
    cancelActiveRequest();
    setSourceSchema('');
    resetOutput();
    setIsSourceExpanded(false);
    setLiveMessage('Schema cleared. Undo is available.');
    window.setTimeout(() => {
      sourceEditor.current?.focus();
    }, 0);
  };
  const undoClear = (): void => {
    if (undoSnapshot === null) return;
    cancelActiveRequest();
    setSourceFormat(undoSnapshot.sourceFormat);
    setTargetFormat(undoSnapshot.targetFormat);
    setSourceSchema(undoSnapshot.sourceSchema);
    setResult(undoSnapshot.result);
    setFreshness(undoSnapshot.freshness);
    setError(undoSnapshot.error);
    setActionError(undoSnapshot.actionError);
    setUndoSnapshot(null);
    setLiveMessage('Schema restored.');
    window.setTimeout(() => {
      sourceEditor.current?.focus();
    }, 0);
  };
  const copyOutput = async (): Promise<void> => {
    if (!canExport) return;
    try {
      await navigator.clipboard.writeText(result.output);
      setActionError(null);
      setIsCopied(true);
      window.setTimeout(() => {
        setIsCopied(false);
      }, 2_000);
      setLiveMessage('Converted schema copied.');
    } catch {
      setActionError(
        'Unable to copy the converted schema. Select the output and copy it manually.',
      );
    }
  };
  const downloadOutput = (): void => {
    if (!canExport) return;
    const blob = new Blob([result.output], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = targetFormat === 'prisma' ? 'schema.prisma' : 'schema.ts';
    link.click();
    URL.revokeObjectURL(url);
    setLiveMessage(`Downloaded ${link.download}.`);
  };
  const copyWarnings = async (): Promise<void> => {
    if (result === null) return;
    try {
      await navigator.clipboard.writeText(formatIssues(result));
      setActionError(null);
      setLiveMessage('Warnings copied.');
    } catch {
      setActionError('Unable to copy warnings. Select the review details and copy them manually.');
    }
  };

  return (
    <section className="converter-workspace workspace-enter" aria-label="Schema converter">
      <form
        className="command-bar"
        onSubmit={(event) => {
          event.preventDefault();
          void handleConvert();
        }}
      >
        <div className="format-controls">
          <span className="format-label">{formatLabel(sourceFormat)}</span>
          <span className="direction-arrow" aria-hidden="true">
            →
          </span>
          <span className="format-label">{formatLabel(targetFormat)}</span>
          <button
            type="button"
            className="swap-button"
            onClick={swapFormats}
            aria-label="Swap source and target formats"
          >
            <SwapIcon />
            <span>swap</span>
          </button>
        </div>
        <button type="submit" className="convert-button" disabled={!hasSource || isConverting}>
          {isConverting ? <SpinnerIcon /> : <ArrowIcon />}
          <span>{isConverting ? 'converting' : 'convert'}</span>
          <kbd>⌘/Ctrl + Enter</kbd>
        </button>
      </form>
      <div className="editor-grid">
        <SchemaEditorPane
          filename={filenameFor(sourceFormat)}
          status="Source schema"
          title="Source schema"
          canClear={hasSource}
          isExpanded={isSourceExpanded}
          onClear={clearSource}
          onLoadExample={loadExample}
          onToggleExpanded={() => {
            setIsSourceExpanded((expanded) => !expanded);
          }}
        >
          <div className="editor-stack">
            <MonacoEditor
              height={isSourceExpanded ? 'min(72vh, 44rem)' : 'min(52vh, 32rem)'}
              language={editorLanguage(sourceFormat)}
              value={sourceSchema}
              onChange={changeSourceSchema}
              onMount={(editor) => {
                sourceEditor.current = editor;
              }}
              beforeMount={configureMonacoTheme}
              theme="prizzle-dark"
              options={{
                ariaLabel: 'Source schema editor',
                fontFamily: 'var(--font-code)',
                fontSize: 14,
                lineHeight: 22,
                minimap: { enabled: false },
                placeholder: sourcePlaceholder(sourceFormat),
                wordWrap: 'on',
              }}
            />
          </div>
        </SchemaEditorPane>
        <div className="output-column">
          <SchemaEditorPane
            filename={filenameFor(targetFormat)}
            status={outputStatus}
            title="Converted schema"
            isOutput
            canCopy={canExport}
            canDownload={canExport}
            copied={isCopied}
            onCopy={() => {
              void copyOutput();
            }}
            onDownload={downloadOutput}
          >
            {result === null ? (
              <div className="output-placeholder" aria-label="Converted schema output">
                <CodeIcon />
                <p>
                  {error === null
                    ? 'Converted schema will appear here.'
                    : 'Resolve the conversion error and try again.'}
                </p>
              </div>
            ) : (
              <div
                className={
                  freshness === 'stale' || error !== null ? 'editor-stale' : 'editor-stack'
                }
              >
                <MonacoEditor
                  height="min(52vh, 32rem)"
                  language={editorLanguage(targetFormat)}
                  value={result.output}
                  beforeMount={configureMonacoTheme}
                  theme="prizzle-dark"
                  options={{
                    ariaLabel: 'Converted schema editor',
                    fontFamily: 'var(--font-code)',
                    fontSize: 14,
                    lineHeight: 22,
                    minimap: { enabled: false },
                    readOnly: true,
                    wordWrap: 'on',
                  }}
                />
              </div>
            )}
          </SchemaEditorPane>
          {result !== null && (
            <WarningDetails
              conversionWarnings={result.conversionWarnings}
              validationErrors={result.validation.errors}
              validationWarnings={result.validation.warnings}
              isExpanded={isWarningDetailsExpanded}
              onCopy={() => {
                void copyWarnings();
              }}
              onToggle={() => {
                setIsWarningDetailsExpanded((expanded) => !expanded);
              }}
            />
          )}
        </div>
      </div>
      {error !== null && (
        <p role="alert" className="action-alert">
          {error}
        </p>
      )}
      {actionError !== null && (
        <p role="alert" className="action-alert">
          {actionError}
        </p>
      )}
      <div role="status" aria-atomic="true" className="sr-only">
        {liveMessage}
      </div>
      {undoSnapshot !== null && (
        <UndoToast
          onUndo={undoClear}
          onDismiss={() => {
            setUndoSnapshot(null);
          }}
        />
      )}
    </section>
  );
}

function SchemaEditorPane({
  canClear = false,
  canCopy = false,
  canDownload = false,
  children,
  copied = false,
  filename,
  isExpanded = false,
  isOutput = false,
  onClear,
  onCopy,
  onDownload,
  onLoadExample,
  onToggleExpanded,
  status,
  title,
}: SchemaEditorPaneProps): React.JSX.Element {
  const titleId = `${title.replaceAll(' ', '-').toLowerCase()}-title`;
  return (
    <section
      className={`schema-window${isOutput ? ' schema-window-output' : ''}`}
      aria-labelledby={titleId}
    >
      <header className="window-titlebar">
        <span className="window-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <div className="window-title">
          <h2 id={titleId} translate="no">
            {filename}
          </h2>
          <span>{status}</span>
        </div>
        <div className="window-actions">
          {!isOutput && (
            <button type="button" className="quiet-button" onClick={onLoadExample}>
              load example
            </button>
          )}
          {!isOutput && canClear && (
            <button type="button" className="quiet-button" onClick={onClear}>
              clear
            </button>
          )}
          {!isOutput && onToggleExpanded !== undefined && (
            <button
              type="button"
              className="quiet-button mobile-expand"
              aria-expanded={isExpanded}
              onClick={onToggleExpanded}
            >
              {isExpanded ? 'collapse' : 'expand'}
            </button>
          )}
          {isOutput && (
            <button
              type="button"
              className="icon-action"
              aria-label="Copy converted schema"
              title="Copy"
              disabled={!canCopy}
              onClick={onCopy}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
              <span className="sr-only">{copied ? 'Copied' : 'Copy'}</span>
            </button>
          )}
          {isOutput && (
            <button
              type="button"
              className="icon-action"
              aria-label="Download converted schema"
              title="Download"
              disabled={!canDownload}
              onClick={onDownload}
            >
              <DownloadIcon />
              <span className="sr-only">Download</span>
            </button>
          )}
        </div>
      </header>
      <div className="window-content">{children}</div>
    </section>
  );
}

function statusLabel(
  error: string | null,
  freshness: Freshness,
  isConverting: boolean,
  result: ConversionResult | null,
  reviewItemCount: number,
): string {
  if (error !== null) return 'Error';
  if (isConverting) return 'Converting';
  if (result === null) return 'Ready';
  if (freshness === 'stale') return 'Source changed — convert again';
  return reviewItemCount > 0 ? `Converted with ${String(reviewItemCount)} warnings` : 'Converted';
}
function filenameFor(format: SchemaFormat): string {
  return format === 'prisma' ? 'schema.prisma' : 'schema.ts';
}
function formatLabel(format: SchemaFormat): string {
  return format === 'prisma' ? 'Prisma' : 'Drizzle';
}
function sourcePlaceholder(format: SchemaFormat): string {
  return `// Paste your ${formatLabel(format)} schema here or load an example to get started.`;
}
function editorLanguage(format: SchemaFormat): 'prizzle-prisma' | 'typescript' {
  return format === 'prisma' ? 'prizzle-prisma' : 'typescript';
}
function configureMonacoTheme(monaco: MonacoApi): void {
  if (!hasConfiguredMonaco) {
    monaco.languages.register({ id: 'prizzle-prisma' });
    monaco.languages.setMonarchTokensProvider('prizzle-prisma', {
      keywords: ['datasource', 'generator', 'model', 'enum', 'type', 'provider', 'url'],
      types: [
        'String',
        'Int',
        'Boolean',
        'DateTime',
        'Float',
        'Json',
        'Decimal',
        'Bytes',
        'BigInt',
      ],
      tokenizer: {
        root: [
          [/\/\/.*$/, 'comment'],
          [/@[a-zA-Z_][\w]*/, 'annotation'],
          [
            /[a-zA-Z_][\w]*/,
            { cases: { '@keywords': 'keyword', '@types': 'type', '@default': 'identifier' } },
          ],
          [/"(?:[^"\\]|\\.)*"/, 'string'],
          [/\b\d+(?:\.\d+)?\b/, 'number'],
          [/[{}()[\],.=?:]/, 'delimiter'],
        ],
      },
    });
    hasConfiguredMonaco = true;
  }
  monaco.editor.defineTheme('prizzle-dark', {
    base: 'vs-dark',
    inherit: true,
    colors: {
      'editor.background': '#15171c',
      'editor.foreground': '#e9edf5',
      'editor.lineHighlightBackground': '#ffffff0d',
      'editor.placeholder.foreground': '#98a1b3',
      'editor.selectionBackground': '#6ea8fe4d',
    },
    rules: [
      { token: 'comment', foreground: '98a1b3' },
      { token: 'keyword', foreground: 'd2b7ff' },
      { token: 'annotation', foreground: '7fb7ff' },
      { token: 'string', foreground: '9cddb0' },
      { token: 'number', foreground: 'f0c778' },
      { token: 'type', foreground: '9fc4ff' },
      { token: 'delimiter', foreground: 'c5ccd8' },
    ],
  });
}
function formatIssues(result: ConversionResult): string {
  return [
    ...result.conversionWarnings.map(
      (issue) =>
        `Conversion warning — ${issue.table}: ${issue.issue}${issue.originalSource === undefined ? '' : `\n${issue.originalSource}`}`,
    ),
    ...result.validation.errors.map((issue) => `Validation error — ${issue.table}: ${issue.issue}`),
    ...result.validation.warnings.map(
      (issue) => `Validation warning — ${issue.table}: ${issue.issue}`,
    ),
  ].join('\n\n');
}
function responseErrorMessage(body: unknown): string {
  if (isRecord(body) && typeof body.error === 'string') return body.error;
  return 'Conversion failed.';
}
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
function isConversionResult(value: unknown): value is ConversionResult {
  return (
    isRecord(value) &&
    typeof value.output === 'string' &&
    Array.isArray(value.conversionWarnings) &&
    isRecord(value.validation) &&
    Array.isArray(value.validation.errors) &&
    Array.isArray(value.validation.warnings)
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function SwapIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 7h11m0 0-3-3m3 3-3 3M17 17H6m0 0 3 3m-3-3 3-3" />
    </svg>
  );
}
function ArrowIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 12h14m-5-5 5 5-5 5" />
    </svg>
  );
}
function SpinnerIcon(): React.JSX.Element {
  return (
    <svg className="spinner" aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}
function CopyIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="8" y="8" width="10" height="11" rx="1" />
      <path d="M16 8V5H6v11h2" />
    </svg>
  );
}
function CheckIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}
function DownloadIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" />
    </svg>
  );
}
function CodeIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m8 8-4 4 4 4m8-8 4 4-4 4m-3-10-2 12" />
    </svg>
  );
}
