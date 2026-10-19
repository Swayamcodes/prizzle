'use client';

import { useEffect, useRef, useState } from 'react';

interface UndoToastProps {
  onDismiss: () => void;
  onUndo: () => void;
}

const TOAST_DURATION = 8_000;

export function UndoToast({ onDismiss, onUndo }: UndoToastProps): React.JSX.Element {
  const timeoutId = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remaining = useRef(TOAST_DURATION);
  const startedAt = useRef(Date.now());
  const onDismissRef = useRef(onDismiss);
  const isFocusWithin = useRef(false);
  const isPointerWithin = useRef(false);
  const isDismissingRef = useRef(false);
  const exitTimeoutId = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDismissing, setIsDismissing] = useState(false);

  onDismissRef.current = onDismiss;

  const clearTimer = (): void => {
    if (timeoutId.current !== null) {
      clearTimeout(timeoutId.current);
      timeoutId.current = null;
    }
  };

  const clearExitTimer = (): void => {
    if (exitTimeoutId.current !== null) {
      clearTimeout(exitTimeoutId.current);
      exitTimeoutId.current = null;
    }
  };

  const dismiss = (): void => {
    if (isDismissingRef.current) return;
    isDismissingRef.current = true;
    clearTimer();
    setIsDismissing(true);
    exitTimeoutId.current = setTimeout(() => {
      onDismissRef.current();
    }, 150);
  };

  const startTimer = (): void => {
    clearTimer();
    startedAt.current = Date.now();
    timeoutId.current = setTimeout(dismiss, remaining.current);
  };

  const pauseTimer = (): void => {
    if (timeoutId.current === null) return;
    remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    clearTimer();
  };

  const resumeTimer = (): void => {
    if (!isDismissingRef.current && !isFocusWithin.current && !isPointerWithin.current) startTimer();
  };

  useEffect(() => {
    startTimer();
    return (): void => {
      clearTimer();
      clearExitTimer();
    };
  }, []);

  return (
    <aside
      className={`undo-toast${isDismissing ? ' is-dismissing' : ''}`}
      onPointerEnter={() => {
        isPointerWithin.current = true;
        pauseTimer();
      }}
      onPointerLeave={() => {
        isPointerWithin.current = false;
        resumeTimer();
      }}
      onFocus={() => {
        isFocusWithin.current = true;
        pauseTimer();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          isFocusWithin.current = false;
          resumeTimer();
        }
      }}
      aria-label="Clear schema undo"
    >
      <span>Schema cleared.</span>
      <button type="button" onClick={onUndo}>
        Undo
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Dismiss undo message"
        onClick={dismiss}
      >
        ×
      </button>
    </aside>
  );
}
