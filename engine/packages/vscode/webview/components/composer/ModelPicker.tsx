import { useDismissiblePopup } from '../../hooks/useDismissiblePopup.js';
import { modelOption, EFFORT_LABELS } from '../../../../core/src/models/catalog.js';
import type { Effort } from '../../../../core/src/types.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { AccountStatusDto } from '../../../src/panel/protocol.js';
import { IconChevron } from '../icons.js';
import { BrandMark } from '../brandIcons.js';
import { Glyph } from '../CortexIcons.js';

export type PinnedTarget = { provider: string; account: string; model?: string };

const SHORT_PROVIDER: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  copilot: 'Copilot',
  grok: 'Grok',
  openrouter: 'OpenRouter',
};

function prettyPinned(target: PinnedTarget, accounts: AccountStatusDto[]): string {
  const account = accounts.find((a) => a.provider === target.provider && a.label === target.account);
  if (!target.model) return 'Modell wählen';
  return modelOption(target.provider, target.model)?.label
    ?? account?.models.find((m) => m.id === target.model)?.label
    ?? target.model;
}

function quotaLabel(account: AccountStatusDto): string | undefined {
  if (account.authState === 'expired') return 'Erneut anmelden';
  if (!account.available && account.resetAt) {
    const t = new Date(account.resetAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `limited · ${t}`;
  }
  if (!account.usage?.length) return account.available ? undefined : 'limited';
  const worst = account.usage.reduce((a, b) => (a.utilizationPct >= b.utilizationPct ? a : b));
  return `${Math.round(worst.utilizationPct)}% ${worst.label}`;
}

/**
 * The three switches behind one word.
 *
 * They are three separate axes and the menu has to say so. Asking before each
 * step was listed as a fourth permission level, which made it look like an
 * alternative to Plan/Edit/Full — it is not: it sits on top of whichever level
 * is set, and choosing it used to hide which one that was. It is a toggle now,
 * and it says when it does nothing: Full skips approvals by definition, so
 * there is nothing left to ask about.
 */
export function ModelPicker({
  accounts,
  pinned,
  standard,
  onPick,
  levels,
  selectedEffort,
  defaultEffort,
  onEffort,
  openRequest,
}: {
  accounts: AccountStatusDto[];
  pinned?: PinnedTarget;
  /** Nichts gewählt: `pinned` ist nur die Vorgabe. */
  standard?: boolean;
  onPick: (target: PinnedTarget | undefined) => void;
  levels: Effort[];
  selectedEffort?: Effort;
  /** Die Vorgabe des Modells — dahin führt ↺ zurück. */
  defaultEffort?: Effort;
  onEffort: (effort: Effort) => void;
  openRequest?: number;
}) {
  const [open, setOpen] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  useEffect(() => { if (openRequest) { setOpen(true); setModelsOpen(true); } }, [openRequest]);
  const [dragging, setDragging] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number>();
  const [activeWindow, setActiveWindow] = useState(true);
  useEffect(() => {
    const update = () => setActiveWindow(!document.hidden && document.hasFocus());
    const blur = () => setActiveWindow(false);
    update();
    window.addEventListener('focus', update); window.addEventListener('blur', blur); document.addEventListener('visibilitychange', update);
    return () => { window.removeEventListener('focus', update); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', update); };
  }, []);
  const popupRef = useRef<HTMLDivElement>(null);
  // Wer zwischen Regler und Menü wechselt, behält den Fokus im Popover: sonst
  // fiele er auf die Seite zurück, und Esc und Pfeiltasten gingen ins Leere.
  useLayoutEffect(() => {
    if (!open) return;
    const root = popupRef.current;
    const target = modelsOpen
      ? root?.querySelector<HTMLElement>('.cx-rz-row[aria-checked="true"]') ?? root?.querySelector<HTMLElement>('.cx-rz-row')
      : root?.querySelector<HTMLElement>('.cx-rz-title');
    if (root?.contains(document.activeElement) || document.activeElement === document.body || !document.activeElement) target?.focus({ preventScroll: !modelsOpen });
    if (modelsOpen) target?.scrollIntoView({ block: 'nearest' });
  }, [open, modelsOpen]);
  const menuShown = useRef(false);
  menuShown.current = modelsOpen;
  const pickerRef = useDismissiblePopup<HTMLDivElement>(open, (reason) => {
    // Esc im Modellmenü führt zurück zum Regler, wie bei Codex; erst das nächste schließt.
    if (reason === 'escape' && menuShown.current) { setModelsOpen(false); return; }
    setOpen(false);
    setModelsOpen(false);
  });
  // OpenRouter wird nie automatisch gewählt, im Menü aber von Hand.
  const routable = accounts.filter((a) => !a.reviewOnly || a.provider === 'openrouter');
  const label = pinned ? prettyPinned(pinned, accounts) : 'Standard';
  const brand = pinned?.provider;
  const effortIndex = selectedEffort ? Math.max(0, levels.indexOf(selectedEffort)) : 0;
  const hasSlider = levels.length > 1 && !!selectedEffort;
  const ultra = selectedEffort === 'ultra';
  // Knopf und Punkte sitzen 13 px vor den Enden der Spur — so wie bei Codex.
  const stop = (index: number) => `calc(13px + ${levels.length > 1 ? index / (levels.length - 1) : 0} * (100% - 26px))`;

  const modelList = (
    <div class="cx-rz-menu" role="menu" aria-label="Modell auswählen">
      <div class="cx-rz-menu-title">Modell auswählen</div>
      <button
        type="button"
        class="cx-rz-row cx-rz-row-std"
        role="menuitemradio"
        aria-checked={standard || !pinned}
        onClick={() => { onPick(undefined); setModelsOpen(false); }}
      >
        <span class="cx-rz-row-text">Standard<small>Empfohlene Modellauswahl</small></span>
        {(standard || !pinned) && <Glyph name="check" size={14} />}
      </button>
      {routable.map((account) => {
        const models = account.models.length > 0 ? account.models : [{ id: '', label: 'Standardmodell' }];
        const quota = quotaLabel(account);
        const usable = account.available && account.authState !== 'expired';
        return (
          <div key={account.id} class="cx-rz-group" role="group" aria-label={`${SHORT_PROVIDER[account.provider] ?? account.provider} · ${account.label}`}>
            <div class="cx-rz-group-label">
              <BrandMark provider={account.provider} size={11} />
              <span>{SHORT_PROVIDER[account.provider] ?? account.provider} · {account.label}</span>
              {quota ? <span class="cx-rz-quota">{quota}</span> : account.provider === 'openrouter' && <span class="cx-rz-quota" title="Antwortet ohne Werkzeuge und ändert keine Dateien">nur Antworten</span>}
            </div>
            {models.map((model) => {
              const target: PinnedTarget = { provider: account.provider, account: account.label, model: model.id || undefined };
              const on =
                !standard &&
                pinned?.provider === target.provider &&
                pinned.account === target.account &&
                (modelOption(pinned.provider, pinned.model)?.id ?? pinned.model ?? '') === (target.model ?? '');
              return (
                <button
                  key={`${account.id}:${model.id || 'default'}`}
                  type="button"
                  class={`cx-rz-row ${usable ? '' : 'dim'}`}
                  role="menuitemradio"
                  aria-checked={on}
                  disabled={!usable}
                  onClick={() => { onPick(target); setModelsOpen(false); }}
                >
                  <span class="cx-rz-row-text">{model.label}</span>
                  {on && <Glyph name="check" size={14} />}
                </button>
              );
            })}
          </div>
        );
      })}
      {routable.length === 0 && <div class="cx-rz-empty">Verbinde ein Konto, um seine Modelle auszuwählen.</div>}
    </div>
  );

  return (
    <div ref={pickerRef} class="mode-menu model-picker">
      <button
        class={`mode-btn model-btn ${open ? 'open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Modell und Reasoning"
        onClick={() => {
          setOpen((v) => !v);
          setModelsOpen(false);
        }}
      >
        {brand && (
          <span class="model-brand">
            {brand === 'codex'
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.4 1.8a1.3 1.3 0 0 0-2.2-.7L3.3 11.6a1.6 1.6 0 0 0 1.3 2.6h5l-1 7a1.3 1.3 0 0 0 2.2.9l9.7-11.7a1.6 1.6 0 0 0-1.2-2.6h-6.6Z" /></svg>
              : <BrandMark provider={brand} size={14} />}
          </span>
        )}
        <span class="model-label">{pinned ? label : 'Modell wählen'}</span>
        {selectedEffort && <span class={`model-effort ${ultra ? 'ultra' : ''}`}>{EFFORT_LABELS[selectedEffort]}</span>}
        <IconChevron size={11} />
      </button>
      {open && (
        <div
          ref={popupRef}
          class={`menu-popup reasoning-popup cx-rz ${modelsOpen ? 'is-menu' : ''}`}
          role="dialog"
          aria-label="Modell und Reasoning"
        >
          {modelsOpen ? modelList : (
            <>
              <div class="cx-rz-head">
                <button
                  type="button"
                  class={`cx-rz-title ${ultra ? 'ultra' : ''}`}
                  aria-haspopup="menu"
                  title="Modell wechseln"
                  onClick={() => setModelsOpen(true)}
                >
                  <span class="cx-rz-effort">
                    {selectedEffort ? EFFORT_LABELS[selectedEffort] : label}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                  </span>
                  {selectedEffort && <span class="cx-rz-model">{label}</span>}
                </button>
                {hasSlider && defaultEffort && (
                  <button
                    type="button"
                    class="cx-rz-reset"
                    title={`Zurück auf ${EFFORT_LABELS[defaultEffort]}`}
                    aria-label="Reasoning zurücksetzen"
                    disabled={selectedEffort === defaultEffort}
                    onClick={() => onEffort(defaultEffort)}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                  </button>
                )}
              </div>
              {hasSlider && (
                <div class={`cx-rz-slider ${dragging ? 'is-drag' : ''} ${ultra ? 'ultra' : ''}`}>
                  <div class="cx-rz-track" aria-hidden="true">
                    <span class="cx-rz-fill" style={{ width: `calc(${stop(effortIndex)} + 14px)` }} />
                    {ultra && <span class={`cx-rz-stars ${activeWindow ? '' : 'paused'}`} />}
                  </div>
                  {levels.map((level, index) => (
                    <span
                      key={level}
                      class={`cx-rz-dot ${index <= effortIndex ? 'on' : ''} ${index === hoverIndex && index !== effortIndex ? 'hover' : ''}`}
                      style={{ left: stop(index) }}
                      aria-hidden="true"
                    />
                  ))}
                  <span class="cx-rz-knob" style={{ left: stop(effortIndex) }} aria-hidden="true" />
                  <input
                    type="range"
                    aria-label="Reasoning"
                    aria-valuetext={EFFORT_LABELS[selectedEffort!]}
                    min={0}
                    max={levels.length - 1}
                    step={1}
                    value={effortIndex}
                    title={hoverIndex !== undefined ? EFFORT_LABELS[levels[hoverIndex]!] : undefined}
                    onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); }}
                    onPointerUp={() => setDragging(false)}
                    onPointerCancel={() => setDragging(false)}
                    onLostPointerCapture={() => setDragging(false)}
                    // Das Feld liegt über den Punkten; welcher Punkt gemeint ist, rechnet es selbst aus.
                    onPointerMove={(e) => {
                      const box = e.currentTarget.getBoundingClientRect();
                      const share = (e.clientX - box.left - 13) / Math.max(1, box.width - 26);
                      setHoverIndex(Math.max(0, Math.min(levels.length - 1, Math.round(share * (levels.length - 1)))));
                    }}
                    onPointerLeave={() => setHoverIndex(undefined)}
                    onInput={(e) => onEffort(levels[Number(e.currentTarget.value)]!)}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
