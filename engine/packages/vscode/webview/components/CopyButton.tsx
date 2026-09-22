import { useEffect, useState } from 'preact/hooks';

/**
 * Copying is the most common thing anyone does with an answer, and dragging a
 * selection across a stream that is still moving is miserable. The button
 * confirms in place — a toast for something this small would be worse than
 * silence, and silence would leave you wondering whether it worked.
 */

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older webviews reject the async API even with a real click behind it.
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

function CopyGlyph({ done }: { done: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {done ? (
        <path d="m5 12.5 4.5 4.5L19 7" />
      ) : (
        <>
          <rect x="9" y="9" width="11" height="11" rx="2.5" />
          <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-7A2.5 2.5 0 0 0 3 5.5v7A2.5 2.5 0 0 0 5.5 15" />
        </>
      )}
    </svg>
  );
}

export function CopyButton({
  text,
  label = 'Copy',
  className = '',
  icon = false,
}: {
  text: string;
  label?: string;
  className?: string;
  /** Draw the glyph alone — for a footer where the word would be the loudest thing. */
  icon?: boolean;
}) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 1400);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = async (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    setState((await copyText(text)) ? 'done' : 'failed');
  };

  if (icon) {
    return (
      <button
        type="button"
        class={`copy-btn icon ${state} ${className}`}
        title={state === 'done' ? 'Kopiert' : state === 'failed' ? 'Mit ⌘C kopieren' : label}
        aria-label={label}
        onClick={copy}
      >
        <CopyGlyph done={state === 'done'} />
      </button>
    );
  }

  return (
    <button
      type="button"
      class={`copy-btn ${state} ${className}`}
      title={label}
      aria-label={label}
      onClick={copy}
    >
      {state === 'done' ? '✓ copied' : state === 'failed' ? 'press ⌘C' : label}
    </button>
  );
}
