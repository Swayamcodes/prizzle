'use client';

interface ValidationIssue {
  table: string;
  issue: string;
}

interface ConversionWarning extends ValidationIssue {
  originalSource?: string;
}

interface WarningDetailsProps {
  conversionWarnings: readonly ConversionWarning[];
  validationErrors: readonly ValidationIssue[];
  validationWarnings: readonly ValidationIssue[];
  isExpanded: boolean;
  onCopy: () => void;
  onToggle: () => void;
}

interface IssueGroup {
  issues: readonly ConversionWarning[];
  title: string;
}

export function WarningDetails({
  conversionWarnings,
  validationErrors,
  validationWarnings,
  isExpanded,
  onCopy,
  onToggle,
}: WarningDetailsProps): React.JSX.Element | null {
  const groups: readonly IssueGroup[] = [
    { title: 'Conversion warnings', issues: conversionWarnings },
    { title: 'Validation errors', issues: validationErrors },
    { title: 'Validation warnings', issues: validationWarnings },
  ].filter((group) => group.issues.length > 0);

  const issueCount = groups.reduce((total, group) => total + group.issues.length, 0);
  if (issueCount === 0) return null;

  return (
    <section className="warning-details" aria-labelledby="review-items-title">
      <div className="warning-summary">
        <button
          type="button"
          className="disclosure-button"
          aria-expanded={isExpanded}
          aria-controls="review-items"
          onClick={onToggle}
        >
          <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
          <span id="review-items-title">
            {issueCount} item{issueCount === 1 ? '' : 's'} need review
          </span>
        </button>
        <button type="button" className="quiet-button" onClick={onCopy}>
          copy warnings
        </button>
      </div>
      {isExpanded && (
        <div id="review-items" className="warning-groups">
          {groups.map((group) => (
            <section
              key={group.title}
              className="warning-group"
              aria-labelledby={`${group.title.replaceAll(' ', '-').toLowerCase()}-title`}
            >
              <h3 id={`${group.title.replaceAll(' ', '-').toLowerCase()}-title`}>{group.title}</h3>
              <ul>
                {group.issues.map((issue, index) => (
                  <li key={`${group.title}-${issue.table}-${issue.issue}-${String(index)}`}>
                    <p>
                      <strong>{issue.table}:</strong> {issue.issue}
                    </p>
                    {issue.originalSource !== undefined && <pre>{issue.originalSource}</pre>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
