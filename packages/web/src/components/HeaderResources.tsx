'use client';

import { useState } from 'react';

const CLI_COMMAND = 'npm install -g prizzle-cli';

export function HeaderResources(): React.JSX.Element {
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copyCommand = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(CLI_COMMAND);
      setError(null);
      setIsCopied(true);
      window.setTimeout(() => {
        setIsCopied(false);
      }, 2_000);
    } catch {
      setError('Unable to copy the CLI command.');
    }
  };

  return (
    <section className="cli-resource" aria-label="Use the CLI">
      <p className="cli-label">use the cli</p>
      <div className="cli-command">
        <code>{CLI_COMMAND}</code>
        <button
          type="button"
          className="quiet-icon"
          aria-label="Copy CLI command"
          onClick={() => {
            void copyCommand();
          }}
        >
          {isCopied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
      <span className="sr-only" role="status" aria-atomic="true">
        {isCopied ? 'CLI command copied.' : ''}
      </span>
      {error !== null && <p role="alert" className="cli-copy-error">{error}</p>}
    </section>
  );
}

export function HeaderLinks(): React.JSX.Element {
  return (
    <nav className="header-links" aria-label="Prizzle links">
      <a href="https://github.com/Swayamcodes/prizzle" target="_blank" rel="noreferrer">
        github
      </a>
      <a href="https://www.npmjs.com/package/prizzle-cli" target="_blank" rel="noreferrer">
        npm
      </a>
    </nav>
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
