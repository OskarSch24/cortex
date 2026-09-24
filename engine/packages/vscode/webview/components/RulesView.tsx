import { useEffect, useRef, useState } from 'preact/hooks';
import type { Rule, RulesFile, RuleTarget } from '../../../core/src/rules/schema.js';
import type { AccountStatusDto } from '../../src/panel/protocol.js';
import { vscode } from '../vscodeApi.js';
import { RuleEditor } from './RuleEditor.js';
import { TargetChainEditor } from './TargetChainEditor.js';
import { BrandMark } from './brandIcons.js';
import { IconDown, IconPlus, IconRoute, IconUp } from './icons.js';

/** The default chain is a row in the same list, so it is picked the same way. */
const DEFAULT_KEY = '\u0000default';
const NEW_KEY = '\u0000new';

/** What this rule is waiting for, in the width of a list row. */
function matchSummary(rule: Rule): string {
  const m = rule.match;
  const parts: string[] = [];
  if (m.keywords?.length) parts.push(`${m.keywords.length} keyword${m.keywords.length > 1 ? 's' : ''}`);
  if (m.globs?.length) parts.push(`${m.globs.length} glob${m.globs.length > 1 ? 's' : ''}`);
  if (m.languages?.length) parts.push(m.languages.join('/'));
  if (m.tags?.length) parts.push(m.tags.map((t) => `#${t}`).join(' '));
  if (m.maxPromptChars) parts.push(`≤${m.maxPromptChars} chars`);
  return parts.length > 0 ? parts.join(' · ') : 'matches everything';
}

/** Who a rule leans on, as marks rather than a line of text. */
function ChainMarks({ chain, barred }: { chain: Array<{ provider: string }>; barred?: boolean }) {
  const seen = [...new Set(chain.map((t) => t.provider))].slice(0, 4);
  return (
    <span class={`row-marks ${barred ? 'barred' : ''}`}>
      {seen.map((p) => (
        <BrandMark key={p} provider={p} size={12} />
      ))}
    </span>
  );
}

/**
 * Routing rules, read and written in one place: the ordered list on the left is
 * the order the router tries them in, and everything on the right is the rule
 * that row stands for. The JSON file is still the source of truth — it is one
 * button away, and edits made there show up here immediately.
 */
export function RulesView({
  rules,
  accounts,
  path,
  exists,
  error,
}: {
  rules: RulesFile;
  accounts: AccountStatusDto[];
  path: string;
  exists: boolean;
  error?: string;
}) {
  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const [listWidth, setListWidth] = useState(260);
  const dragging = useRef(false);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (dragging.current) setListWidth(Math.min(440, Math.max(200, e.clientX)));
    };
    const up = () => {
      dragging.current = false;
      document.body.classList.remove('resizing');
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []);

  const list = rules.rules;
  const nothingConfigured = list.length === 0 && rules.defaultChain.length === 0;
  // A file that did not parse is shown here as empty, because that is what
  // routing fell back to — but it is not empty on disk. Nothing that writes is
  // offered until it parses again, or the save would discard what is still in it.
  const readOnly = error !== undefined;
  // A rule deleted underneath us must not leave the pane pointing at nothing —
  // it falls back to the first rule, then to the default chain, and only an
  // empty file gets no pane at all.
  const selected =
    selectedKey === NEW_KEY || selectedKey === DEFAULT_KEY
      ? selectedKey
      : (list.find((r) => r.id === selectedKey)?.id ??
        list[0]?.id ??
        (nothingConfigured ? undefined : DEFAULT_KEY));

  const selectedRule = list.find((r) => r.id === selected);
  const selectedIndex = list.findIndex((r) => r.id === selected);

  const reorder = (index: number, delta: number) => {
    const order = list.map((r) => r.id);
    const [id] = order.splice(index, 1);
    order.splice(index + delta, 0, id!);
    vscode.postMessage({ kind: 'reorderRules', order });
  };

  return (
    <div class="accounts-split">
      <div class="accounts-list rules-list" style={{ width: `${listWidth}px` }}>
        <div class="accounts-list-head">
          <IconRoute size={13} />
          <span class="accounts-list-title">Rules</span>
          <span class="accounts-count">{list.length}</span>
          <div class="header-gap" />
          <button
            class="icon-btn"
            title={readOnly ? 'Fix the rules file first' : 'New rule'}
            disabled={readOnly}
            onClick={() => setSelectedKey(NEW_KEY)}
          >
            <IconPlus />
          </button>
        </div>

        {list.length > 0 && <div class="list-note">tried top to bottom · first match wins</div>}

        {list.map((rule, i) => (
          <div
            key={rule.id}
            class={`accounts-row rules-row ${selected === rule.id ? 'active' : ''}`}
            onClick={() => setSelectedKey(rule.id)}
          >
            <span class="rules-order">{i + 1}</span>
            <span class="rules-row-main">
              <span class="rules-row-id" title={rule.description || rule.id}>
                {rule.id}
              </span>
              <span class="rules-row-sub">{matchSummary(rule)}</span>
            </span>
            {rule.target.length > 0 ? (
              <ChainMarks chain={rule.target} />
            ) : (
              <ChainMarks chain={rule.exclude ?? []} barred />
            )}
            <span class="rules-row-move">
              <button
                class="icon-btn chain-btn"
                title="Try this rule earlier"
                disabled={readOnly || i === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  reorder(i, -1);
                }}
              >
                <IconUp size={11} />
              </button>
              <button
                class="icon-btn chain-btn"
                title="Try this rule later"
                disabled={readOnly || i === list.length - 1}
                onClick={(e) => {
                  e.stopPropagation();
                  reorder(i, 1);
                }}
              >
                <IconDown size={11} />
              </button>
            </span>
          </div>
        ))}

        {selected === NEW_KEY && (
          <div class="accounts-row rules-row active">
            <span class="rules-order">{list.length + 1}</span>
            <span class="rules-row-main">
              <span class="rules-row-id">new rule</span>
              <span class="rules-row-sub">unsaved</span>
            </span>
          </div>
        )}

        <div class="list-note spaced">when no rule matches</div>
        <div
          class={`accounts-row rules-row ${selected === DEFAULT_KEY ? 'active' : ''}`}
          onClick={() => setSelectedKey(DEFAULT_KEY)}
        >
          <span class="rules-order fallback">↓</span>
          <span class="rules-row-main">
            <span class="rules-row-id">default chain</span>
            <span class="rules-row-sub">
              {rules.defaultChain.length > 0
                ? `${rules.defaultChain.length} target${rules.defaultChain.length > 1 ? 's' : ''}`
                : 'priority order'}
            </span>
          </span>
          <ChainMarks chain={rules.defaultChain} />
        </div>

        <div class="rules-foot">
          {!exists && (
            <div class="rules-missing">No rules file yet — every task follows priority order.</div>
          )}
          <div class="rules-file">
            <span class="rules-path" title={path}>
              {path.replace(/^.*\/(?=[^/]*\/[^/]*$)/, '')}
            </span>
            <button class="ghost-btn" onClick={() => vscode.postMessage({ kind: 'editRules' })}>
              {exists ? 'JSON' : 'Create'}
            </button>
          </div>
        </div>
      </div>

      <div
        class="splitter"
        onMouseDown={() => {
          dragging.current = true;
          document.body.classList.add('resizing');
        }}
      />

      <div class="rules-detail-holder">
        {readOnly ? (
          <div class="accounts-empty rules-empty">
            <div class="msg-error rules-error">
              <span class="msg-error-text">
                This rules file does not parse, so routing is back on priority order until it does:{' '}
                {error}
              </span>
            </div>
            <div class="accounts-empty-line">
              The list on the left reads empty because that is what routing fell back to — your
              rules are still in the file. Editing here is off until it parses, so a save cannot
              overwrite them.
            </div>
            <div class="empty-actions">
              <button class="run-btn send" onClick={() => vscode.postMessage({ kind: 'editRules' })}>
                Open rules.json
              </button>
            </div>
          </div>
        ) : nothingConfigured && selected !== NEW_KEY && selected !== DEFAULT_KEY ? (
          <div class="accounts-empty rules-empty">
            <IconRoute size={28} />
            <div class="accounts-empty-title">No rules yet</div>
            <div class="accounts-empty-line">
              Without rules every task goes to your accounts in priority order. A rule pins the work
              you care about — tests, migrations, anything tagged — to the account that should get
              it, with a failover chain behind it.
            </div>
            <div class="empty-actions">
              <button class="run-btn send" onClick={() => setSelectedKey(NEW_KEY)}>
                <IconPlus size={12} /> New rule
              </button>
              <button class="ghost-btn" onClick={() => vscode.postMessage({ kind: 'editRules' })}>
                Start from the template
              </button>
            </div>
          </div>
        ) : selected === DEFAULT_KEY ? (
          <DefaultChainPane
            // Keyed on the chain as it stands in the file, for the same reason
            // the rule pane is: an edit made in the JSON reloads this form
            // instead of leaving a stale draft open on top of it.
            key={JSON.stringify(rules.defaultChain)}
            chain={rules.defaultChain}
            accounts={accounts}
          />
        ) : selected === NEW_KEY ? (
          <RuleEditor
            key="new"
            accounts={accounts}
            takenIds={list.map((r) => r.id)}
            onSaved={(id) => setSelectedKey(id)}
            onDiscard={() => setSelectedKey(undefined)}
          />
        ) : (
          selectedRule && (
            <RuleEditor
              // Keyed on the rule as it stands in the file: an edit made in the
              // JSON reloads this pane instead of leaving a stale form open.
              key={`${selectedRule.id}:${JSON.stringify(selectedRule)}`}
              rule={selectedRule}
              index={selectedIndex}
              accounts={accounts}
              takenIds={list.filter((r) => r.id !== selectedRule.id).map((r) => r.id)}
              onSaved={(id) => setSelectedKey(id)}
              onDiscard={() => setSelectedKey(undefined)}
            />
          )
        )}
      </div>
    </div>
  );
}

/** The tail of every failover, and what runs when nothing matched at all. */
function DefaultChainPane({
  chain,
  accounts,
}: {
  chain: RuleTarget[];
  accounts: AccountStatusDto[];
}) {
  const [draft, setDraft] = useState<RuleTarget[]>(chain);
  const dirty = JSON.stringify(draft) !== JSON.stringify(chain);

  return (
    <div class="rule-detail">
      <div class="detail-header">
        <span class="brand-badge big">
          <IconRoute size={22} />
        </span>
        <div class="detail-title">
          <div class="detail-name">default chain</div>
          <div class="detail-sub">
            <span class="accounts-hint">
              Where anything no rule claimed goes — and where every rule's own chain ends up when it
              runs out.
            </span>
          </div>
        </div>
      </div>

      <div class="detail-section wide">
        <div class="detail-section-title">
          Route to <span class="section-note">first one that can take it wins</span>
        </div>
        <TargetChainEditor
          chain={draft}
          accounts={accounts}
          onChange={setDraft}
          emptyHint="Empty — tasks fall through to your accounts in priority order."
        />
      </div>

      <div class="detail-footer">
        <span class="accounts-hint">
          An <code>@mention</code> in the prompt still beats all of this.
        </span>
        <div class="header-gap" />
        {dirty && (
          <button class="ghost-btn" onClick={() => setDraft(chain)}>
            Revert
          </button>
        )}
        <button
          class="run-btn send"
          disabled={!dirty}
          onClick={() => vscode.postMessage({ kind: 'saveDefaultChain', chain: draft })}
        >
          Save chain
        </button>
      </div>
    </div>
  );
}
