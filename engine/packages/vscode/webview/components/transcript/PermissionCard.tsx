import type { TranscriptItem } from '../../../src/panel/transcript.js';
import type { PermissionDecision } from '../../../../core/src/adapters/permission.js';
import { BRAND_COLOR } from '../brandIcons.js';
import { useState } from 'preact/hooks';

const KIND_GLYPH: Record<string, string> = {
  command: '❯',
  edit: '✎',
  read: '◇',
  network: '↓',
  other: '·',
};

/**
 * The model is stopped until this is answered, so it reads as a question with
 * buttons rather than a notice. "Always" is offered per kind of action, not
 * blanket — allowing `git status` should never allow `rm`.
 */
export function PermissionCard({
  item,
  onDecide,
}: {
  item: Extract<TranscriptItem, { kind: 'permission' }>;
  onDecide?: (id: string, decision: PermissionDecision) => void;
}) {
  const { request } = item;
  const [denialReason, setDenialReason] = useState('');
  if (item.answered) {
    return (
      <div class={`tl tl-permission permission-block answered ${item.allowed ? 'allowed' : 'denied'}`}>
        <span class="permission-mark">{item.allowed ? '✓' : '✕'}</span>
        <span class="permission-title">{request.title}</span>
        <span class="permission-verdict">{item.allowed ? 'allowed' : 'denied'}</span>
      </div>
    );
  }
  return (
    // The model is blocked on this, so it must be announced, not just drawn.
    <div
      class="tl tl-permission pending permission-block"
      role="alertdialog"
      aria-label={request.title}
    >
      <div class="permission-head">
        <span class={`permission-kind ${request.kind}`}>{KIND_GLYPH[request.kind] ?? '·'}</span>
        <span class="permission-title">{request.title}</span>
        {item.target && (
          <span class="permission-by" style={{ color: BRAND_COLOR[item.target.provider] }}>
            {item.target.provider}:{item.target.account}
          </span>
        )}
      </div>
      {request.detail && <pre class="permission-detail">{request.detail}</pre>}
      <div class="permission-actions">
        <button class="perm-btn allow" onClick={() => onDecide?.(request.id, { outcome: 'allow' })}>
          Allow
        </button>
        <button
          class="perm-btn always"
          title="Erlaubt nur diese konkrete Aktion mit denselben Parametern für diesen Chat"
          onClick={() => onDecide?.(request.id, { outcome: 'allow-always' })}
        >
          Always
        </button>
        <input aria-label="Grund der Ablehnung (optional)" placeholder="Grund (optional)" value={denialReason} onInput={e => setDenialReason(e.currentTarget.value)} />
        <button class="perm-btn deny" onClick={() => onDecide?.(request.id, { outcome: 'deny', reason: denialReason.trim() || undefined })}>
          Deny
        </button>
      </div>
    </div>
  );
}
