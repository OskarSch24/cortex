import { useDismissiblePopup } from '../hooks/useDismissiblePopup.js';
import { modelOption } from '../../../core/src/models/catalog.js';
import type { Effort } from '../../../core/src/types.js';
import { useEffect, useLayoutEffect, useRef, useState, useId } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
// Deep import: the core barrel pulls node built-ins the browser bundle can't take.
import { SLASH_COMMANDS, matchSlashCommand, type SlashCommand, type SlashAction } from '../../../core/src/commands/slashCommands.js';
import type { AccountStatusDto } from '../../src/panel/protocol.js';
import { IconSend, IconStop } from './icons.js';
import { composeMessage, isLongPaste } from './paste.js';
import { BrandMark } from './brandIcons.js';
import { Glyph } from './CortexIcons.js';
import type { ImageOptions } from '../../src/panel/imageOptions.js';
import { DEFAULT_IMAGE_OPTIONS, ImageModeChip, ImageModelPicker, ImageOptionsBar, defaultImageProvider, imageProviders, type ImageProviderId } from './ImageControls.js';
import { activeToken, submitsInput } from './composerInput.js';
import { computeSuggestions, uniqueCommands, type Suggestion } from './composerSuggestions.js';
import { templateCategoryForAction, type ArtifactTemplateCategory } from './templateCommands.js';
import { appSetting } from '../settings/store.js';
import { AddMenu } from './composer/AddMenu.js';
import { readAsAttachment, VIDEO_FILE } from './composer/attachments.js';
import { ModeMenu } from './composer/ModeMenu.js';
import { ModelPicker, type PinnedTarget } from './composer/ModelPicker.js';
import { PastedBlock } from './composer/PastedBlock.js';

export type { PinnedTarget };

/** Letzte Wahl im Bildmodus — gilt für die nächste Aufgabe mit, solange die Seite offen ist. */
let lastImage: { options: ImageOptions; provider?: ImageProviderId } = { options: DEFAULT_IMAGE_OPTIONS };

export interface ImageSend { options: ImageOptions; provider: ImageProviderId }

const MAX_TEXTAREA_HEIGHT = 180;

export function Composer({
  accounts,
  tags,
  customCommands = [],
  connectors = [],
  running,
  permissionMode,
  askPermission,
  attachments,
  attachmentPreviews = {},
  onSend,
  onCancel,
  onModeChange,
  onPickAttachments,
  onAddFolder,
  onConnectors,
  onTemplates,
  onLocation,
  onVoiceSettings,
  onCommand,
  unavailableCommands = {},
  pinnedChat = false,
  commandRequest,
  onTemplatePreview,
  project,
  onRemoveAttachment,
  pinnedTarget,
  pinnedStandard,
  onPinnedTarget,
  promptSeed,
  imageSeed,
  onImageOrder,
  onImageProviderChange,
  imageWorkspace = false,
}: {
  promptSeed?: { text: string; key: number; mode?: 'chat' };
  /** „Variante erstellen“ an einer Bildkarte: Bildmodus mit diesen Feldern öffnen. */
  imageSeed?: { options: ImageOptions; provider?: string; key: number };
  /** ⇅ im Bildmodell: neue Kontofolge eines Anbieters. */
  onImageOrder?: (provider: string, accounts: string[]) => void;
  onImageProviderChange?: (provider: ImageProviderId | undefined) => void;
  imageWorkspace?: boolean;
  accounts: AccountStatusDto[];
  tags: string[];
  customCommands?: SlashCommand[];
  connectors?: string[];
  running: boolean;
  permissionMode: string;
  askPermission: boolean;
  attachments: string[];
  attachmentPreviews?: Record<string, string>;
  onSend: (text: string, effort?: Effort, image?: ImageSend) => void;
  onCancel: () => void;
  onModeChange: (modes: {
    permissionMode?: string;
    routingMode?: 'auto' | 'manual';
    /** Whether to stop and ask — orthogonal to the permission level. */
    ask?: boolean;
  }) => void;
  onPickAttachments: () => void;
  onAddFolder?: () => void;
  onConnectors?: (draft: string) => void;
  onTemplates?: () => void;
  /** Öffnet die Standort-Kachel über dem Eingabefeld. */
  onLocation?: () => void;
  /** Spracheinrichtung öffnen; der Entwurf wird beim Seitenwechsel bewahrt. */
  onVoiceSettings?: (draft: string) => void;
  onCommand?: (action: SlashAction, draft: string) => void;
  unavailableCommands?: Partial<Record<SlashAction, string>>;
  pinnedChat?: boolean;
  commandRequest?: { action: SlashAction; key: number };
  onTemplatePreview?: (category: ArtifactTemplateCategory | undefined) => void;
  /** Die Projektwahl, solange der Chat noch nicht begonnen hat: ein Chip neben dem Plus. */
  project?: ComponentChildren;
  onRemoveAttachment: (path: string) => void;
  pinnedTarget?: PinnedTarget;
  /** Nichts gewählt — `pinnedTarget` ist die Vorgabe. */
  pinnedStandard?: boolean;
  onPinnedTarget: (target: PinnedTarget | undefined) => void;
}) {
  const allCommands = uniqueCommands([...customCommands, ...SLASH_COMMANDS]);
  const [modelOpenRequest, setModelOpenRequest] = useState(0);
  // Accounts that can actually be given a task — a reviewer is connected but
  // never routed to, so it must not make the composer look ready when it is not.
  const routable = accounts.filter((a) => !a.reviewOnly && a.available && a.authState !== 'expired');
  const [text, setText] = useState('');
  const [imageMode, setImageMode] = useState(false);
  const [imageOptions, setImageOptions] = useState<ImageOptions>(lastImage.options);
  const [imageProvider, setImageProvider] = useState<ImageProviderId | undefined>(lastImage.provider);
  // Ein gemerkter Anbieter ohne nutzbares Konto zählt nicht als Wahl.
  const shownImageProvider = imageProvider && imageProviders(accounts).includes(imageProvider)
    ? imageProvider
    : defaultImageProvider(accounts, pinnedTarget?.provider);
  useLayoutEffect(() => { onImageProviderChange?.(shownImageProvider); }, [shownImageProvider]);
  const updateImageOptions = (next: ImageOptions) => { setImageOptions(next); lastImage = { ...lastImage, options: next }; };
  const pickImageProvider = (next: ImageProviderId) => { setImageProvider(next); lastImage = { ...lastImage, provider: next }; };
  const enterImageMode = (on = true) => {
    if (on && !shownImageProvider) return;
    setImageMode(on);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };
  const [pastes, setPastes] = useState<Array<{ id: number; text: string }>>([]);
  const [removedPastes, setRemovedPastes] = useState<Array<{ id: number; text: string; index: number }>>([]);
  const promptHistory = useRef<string[]>([]);
  const historyCursor = useRef(-1);
  const historyDraft = useRef('');
  const [efforts, setEfforts] = useState<Record<string, Effort>>({});
  const selectedModel = pinnedTarget ? modelOption(pinnedTarget.provider, pinnedTarget.model) : undefined;
  const effortKey = `${pinnedTarget?.provider}/${selectedModel?.id}`;
  const levels = selectedModel?.efforts ?? [];
  const selectedEffort = levels.includes(efforts[effortKey]!) ? efforts[effortKey] : selectedModel?.defaultEffort;

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const suggestionId = useId();
  const suggestionsRef = useDismissiblePopup<HTMLDivElement>(suggestions.length > 0, () => setSuggestions([]));
  const [activeIndex, setActiveIndex] = useState(0);
  const [suggestionChosen, setSuggestionChosen] = useState(false);
  const tokenRef = useRef<{ start: number; token: string }>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (promptSeed) {
      setText(promptSeed.text);
      if (promptSeed.mode === 'chat') enterImageMode(false);
      textareaRef.current?.focus();
    }
  }, [promptSeed?.key]);

  // Artifact commands reveal their real templates as soon as they are typed.
  // Resolve through the same registry so a user-defined /docs still wins.
  const previewCategory = templateCategoryForAction(matchSlashCommand(text, customCommands)?.cmd.action);
  useLayoutEffect(() => {
    onTemplatePreview?.(previewCategory);
  }, [previewCategory, onTemplatePreview]);

  useLayoutEffect(() => {
    if (!imageSeed) return;
    updateImageOptions(imageSeed.options);
    if (imageSeed.provider === 'codex' || imageSeed.provider === 'grok') pickImageProvider(imageSeed.provider);
    enterImageMode(true);
  }, [imageSeed?.key]);

  const previousLength = useRef(0);
  const autogrow = (widthChanged = false) => {
    const el = textareaRef.current;
    if (!el) return;
    const scrollTop = el.scrollTop;
    if (widthChanged || !(el.offsetHeight >= MAX_TEXTAREA_HEIGHT && el.scrollHeight > MAX_TEXTAREA_HEIGHT && el.value.length >= previousLength.current)) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
      el.scrollTop = scrollTop;
    }
    previousLength.current = el.value.length;
  };

  useLayoutEffect(autogrow, [text]);

  // Dock/sidebar changes can reflow an unchanged draft. Re-measure its height
  // on width changes too, without reflowing for each height/scroll update.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    let width = el.clientWidth;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => autogrow(true));
    });
    observer.observe(el);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);

  useLayoutEffect(() => {
    const popup = suggestionsRef.current;
    const composer = textareaRef.current?.parentElement;
    if (!popup || !composer) return;
    const measure = () => popup.style.setProperty('--cx-suggest-space', `${Math.max(72, composer.getBoundingClientRect().top - 64)}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(composer);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [suggestions.length > 0]);

  useLayoutEffect(() => {
    suggestionsRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, suggestions]);

  const refreshSuggestions = (value: string, caret: number) => {
    const token = activeToken(value, caret);
    tokenRef.current = token;
    const preview = templateCategoryForAction(matchSlashCommand(value, customCommands)?.cmd.action);
    const items = token && !preview ? computeSuggestions(token.token, accounts, tags, allCommands, connectors, { ...unavailableCommands, ...(!shownImageProvider ? { createImage: 'Verbinde zuerst ein Konto für die Bilderstellung' } : {}) }, pinnedChat) : [];
    setSuggestions(items);
    setActiveIndex(Math.max(0, items.findIndex(item => !item.disabled)));
    setSuggestionChosen(false);
  };
  const insertSlash = () => {
    const el = textareaRef.current;
    if (!el) return;
    const next = `/${text ? ` ${text}` : ''}`;
    setText(next);
    el.focus();
    requestAnimationFrame(() => {
      el.setSelectionRange(1, 1);
      refreshSuggestions(next, 1);
    });
  };

  const activateCommand = (command: SlashCommand, draft: string) => {
    if (!command.action || unavailableCommands[command.action]) return;
    if (command.action === 'createImage' && !shownImageProvider) return;
    setText(draft);
    setSuggestions([]);
    if (templateCategoryForAction(command.action) || command.action === 'openTemplates') enterImageMode(false);
    if (command.action === 'openModel') {
      enterImageMode(false);
      setModelOpenRequest(value => value + 1);
      onCommand?.(command.action, draft);
    } else if (command.action === 'createImage') {
      enterImageMode(true);
      onCommand?.(command.action, draft);
    } else if (onCommand) {
      onCommand(command.action, composeMessage(draft, pastes.map(paste => paste.text)));
    } else {
      onSend(`/${command.name}`);
    }
  };

  useEffect(() => {
    const command = commandRequest && SLASH_COMMANDS.find(command => command.action === commandRequest.action);
    if (command) activateCommand(command, text);
  }, [commandRequest?.key]);

  const accept = (suggestion: Suggestion) => {
    const el = textareaRef.current;
    const token = el && activeToken(text, el.selectionStart ?? text.length);
    if (!el || !token || suggestion.disabled) return;
    const caret = el.selectionStart ?? text.length;
    const end = caret + (text.slice(caret).match(/^[\p{L}\p{N}\p{M}_:./-]*/u)?.[0].length ?? 0);
    if (suggestion.command?.kind === 'action') {
      activateCommand(suggestion.command, (text.slice(0, token.start) + text.slice(end)).replace(/^[ \t]/, ''));
      return;
    }
    const next = text.slice(0, token.start) + suggestion.insert + ' ' + text.slice(end);
    setText(next);
    setSuggestions([]);
    requestAnimationFrame(() => {
      const pos = token.start + suggestion.insert.length + 1;
      el.setSelectionRange(pos, pos);
      el.focus();
      autogrow();
    });
  };

  const submit = () => {
    const command = matchSlashCommand(text, customCommands)?.cmd;
    if (command?.kind === 'action') {
      activateCommand(command, matchSlashCommand(text, customCommands)?.args ?? '');
      return;
    }
    const message = composeMessage(text, pastes.map((p) => p.text));
    if (imageMode) {
      if (!message || !shownImageProvider) return;
      onSend(message, undefined, { options: imageOptions, provider: shownImageProvider });
    } else {
      if (!message || routable.length === 0) return;
      onSend(message, selectedEffort);
    }
    promptHistory.current = [message, ...promptHistory.current.filter(p => p !== message)].slice(0, 50);
    historyCursor.current = -1;
    setRemovedPastes([]);
    setText('');
    setPastes([]);
    setSuggestions([]);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) el.style.height = 'auto';
    });
  };

  const typedCommand = matchSlashCommand(text, customCommands)?.cmd;
  const localAction = typedCommand?.kind === 'action' && !!typedCommand.action && !unavailableCommands[typedCommand.action]
    && (typedCommand.action !== 'createImage' || !!shownImageProvider);
  const canSend = typedCommand?.kind === 'action' ? localAction : ((!!text.trim() || pastes.length > 0) && (imageMode ? !!shownImageProvider : routable.length > 0));

  return (
    <div class={`composer ${running ? 'running' : ''} ${imageMode ? 'is-image' : ''}`}>
      {suggestions.length > 0 && (
        <div ref={suggestionsRef} class={`suggest-popup ${tokenRef.current?.token.startsWith('/') ? 'is-commands' : ''}`}>
          <div class="suggest-options" id={suggestionId} role="listbox" aria-label={tokenRef.current?.token.startsWith('/') ? 'Slash-Befehle' : 'Vorschläge'}>
          {suggestions.map((s, i) => (
            <div
              key={s.insert}
              id={`${suggestionId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              aria-disabled={!!s.disabled}
              title={s.disabled ?? s.command?.usage ?? s.insert}
              class={`suggest-row ${i === activeIndex ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                accept(s);
              }}
              onMouseEnter={() => { if (!s.disabled) { setActiveIndex(i); setSuggestionChosen(true); } }}
            >
              {s.provider && (
                <span class="suggest-brand">
                  <BrandMark provider={s.provider} size={11} />
                </span>
              )}
              {!s.provider && <span class="suggest-icon"><Glyph name={s.icon ?? 'chat'} size={16} /></span>}
              <span class="suggest-label">{s.label}</span>
              {s.detail && <span class="suggest-detail">{s.detail}</span>}
            </div>
          ))}
          </div>
          <div class="suggest-hint">↑↓ auswählen · Tab übernehmen · Esc schließen</div>
        </div>
      )}
      {/*
        Above the prompt, one per line, in the order you attached them: these
        are part of the message you are about to send, so they read as a list
        of things being sent rather than as chips hanging off the bottom.
      */}
      {attachments.length > 0 && (
        <ul class="attachment-strip">
          {attachments.map((path) => {
            const name = path.split('/').pop() ?? path;
            const dir = path.slice(0, Math.max(0, path.length - name.length - 1));
            return (
              <li key={path} class={`attachment-row ${attachmentPreviews[path] ? 'has-preview' : ''} ${VIDEO_FILE.test(path) ? 'is-video' : ''}`} title={path}>
                {attachmentPreviews[path] ? <img src={attachmentPreviews[path]} alt={name} /> : <><span class="attachment-name">{name}</span>
                {dir && <span class="attachment-dir">{dir}</span>}</>}
                <button
                  class="attachment-x"
                  title="Remove"
                  aria-label={`Remove ${name}`}
                  onClick={() => onRemoveAttachment(path)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {pastes.length > 0 && (
        <div class="cx-pastes">
          {pastes.map((p) => (
            <PastedBlock
              key={p.id}
              text={p.text}
              onChange={(next) => setPastes((all) => all.map((q) => (q.id === p.id ? { ...q, text: next } : q)))}
              onRemove={() => { setRemovedPastes(all => [...all, { ...p, index: pastes.findIndex(q => q.id === p.id) }]); setPastes(all => all.filter(q => q.id !== p.id)); }}
            />
          ))}
        </div>
      )}
      {removedPastes.length > 0 && <div class="cx-paste-undo" role="status">Text entfernt. <button type="button" onClick={() => {
        const removed = removedPastes[removedPastes.length - 1]!;
        setPastes(all => { const next = [...all]; next.splice(Math.min(removed.index, next.length), 0, removed); return next; });
        setRemovedPastes(all => all.slice(0, -1));
      }}>Rückgängig</button></div>}
      <textarea
        ref={textareaRef}
        aria-label="Nachricht"
        aria-autocomplete="list"
        aria-expanded={suggestions.length > 0}
        aria-controls={suggestions.length > 0 ? suggestionId : undefined}
        aria-activedescendant={suggestions.length > 0 ? `${suggestionId}-${activeIndex}` : undefined}
        onDragOver={(e) => { if (!Array.from(e.dataTransfer?.types ?? []).includes('Files') && e.dataTransfer?.types.includes('text/plain')) e.preventDefault(); }}
        onDrop={(e) => {
          if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) return;
          const dropped = e.dataTransfer?.getData('text/plain') || e.dataTransfer?.getData('text/uri-list');
          if (!dropped) return;
          e.preventDefault();
          const el = e.currentTarget, start = el.selectionStart, end = el.selectionEnd;
          setText(text.slice(0, start) + dropped + text.slice(end));
          requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + dropped.length, start + dropped.length); });
        }}
        value={text}
        onPaste={(e) => {
          // Ein Bild in der Zwischenablage (⌘⇧⌃4, „Kopieren“ aus der
          // Screenshot-Vorschau) wird zum Anhang — der Host legt es als Datei ab.
          const images = Array.from(e.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'));
          if (images.length) {
            e.preventDefault();
            for (const file of images) readAsAttachment(file);
            return;
          }
          const pasted = e.clipboardData?.getData('text/plain') ?? '';
          if (!isLongPaste(pasted)) return;
          e.preventDefault();
          setPastes((all) => [...all, { id: Date.now() + all.length, text: pasted }]);
        }}
        placeholder={
          imageWorkspace && shownImageProvider ? 'Leg einfach los' : imageMode
            ? shownImageProvider
              ? 'Beschreibe das Bild …'
              : 'Verbinde ein ChatGPT- oder Grok-Konto, um Bilder zu erstellen …'
            : routable.length === 0
            ? accounts.length === 0
              ? 'Verbinde ein KI-Abo, um loszulegen …'
              : 'Verbinde ein Konto, das Aufgaben ausführen kann …'
            : running
              ? 'Noch etwas? Nachricht für danach …'
              : 'Leg einfach los'
        }
        rows={1}
        onSelect={e => refreshSuggestions(e.currentTarget.value, e.currentTarget.selectionStart)}
        onInput={(e) => {
          const el = e.target as HTMLTextAreaElement;
          setText(el.value);
          historyCursor.current = -1;
          refreshSuggestions(el.value, el.selectionStart ?? el.value.length);
          autogrow();
        }}
        onKeyDown={(e) => {
          if (e.isComposing || e.keyCode === 229) return;
          // ⌘I schaltet den Bildmodus um.
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
            e.preventDefault();
            enterImageMode(!imageMode);
            return;
          }
          // Esc ohne offene Vorschläge verlässt den Bildmodus, solange nichts läuft.
          if (e.key === 'Escape' && imageMode && suggestions.length === 0 && !running) {
            e.preventDefault();
            enterImageMode(false);
            return;
          }
          // ⌘U hängt Dateien an, ohne den Umweg über das Menü.
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'u') {
            e.preventDefault();
            onPickAttachments();
            return;
          }
          if (suggestions.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              const next = suggestions.findIndex((_, index) => !suggestions[(activeIndex + 1 + index) % suggestions.length]!.disabled);
              if (next >= 0) setActiveIndex((activeIndex + 1 + next) % suggestions.length);
              setSuggestionChosen(true);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              const next = suggestions.findIndex((_, index) => !suggestions[(activeIndex - 1 - index + suggestions.length * 2) % suggestions.length]!.disabled);
              if (next >= 0) setActiveIndex((activeIndex - 1 - next + suggestions.length * 2) % suggestions.length);
              setSuggestionChosen(true);
              return;
            }
            if ((e.key === 'Tab' && !e.shiftKey) || (e.key === 'Enter' && (suggestionChosen || tokenRef.current?.token.startsWith('/')) && !e.shiftKey && !e.metaKey && !e.ctrlKey)) {
              e.preventDefault();
              accept(suggestions[activeIndex]!);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setSuggestions([]);
              return;
            }
          }
          // Einstellungen › Composer: mit „⌘ Enter“ bleibt die Eingabetaste der Zeilenumbruch.
          if (!e.metaKey && !e.ctrlKey && !e.shiftKey && pastes.length === 0 && attachments.length === 0 && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            const el = e.currentTarget;
            const direction = e.key === 'ArrowUp' ? 1 : -1;
            if (historyCursor.current >= 0 || !text) {
              const next = Math.max(-1, Math.min(promptHistory.current.length - 1, historyCursor.current + direction));
              if (next !== historyCursor.current) {
                e.preventDefault();
                if (historyCursor.current < 0) historyDraft.current = text;
                historyCursor.current = next;
                setText(next < 0 ? historyDraft.current : promptHistory.current[next]!);
                requestAnimationFrame(() => el.setSelectionRange(direction > 0 ? 0 : el.value.length, direction > 0 ? 0 : el.value.length));
                return;
              }
            }
          }
          if (submitsInput(e, appSetting<string>('composer.senden', 'enter'))) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape' && running) {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <div class="composer-bar">
        <AddMenu
          onAttachments={onPickAttachments}
          onFolder={onAddFolder}
          onImage={shownImageProvider ? () => enterImageMode(true) : undefined}
          onSlash={insertSlash}
          onConnectors={onConnectors ? () => onConnectors(composeMessage(text, pastes.map(paste => paste.text))) : undefined}
          onTemplates={onTemplates}
          onLocation={onLocation}
        />
        {!imageMode && project}
        {imageMode && <ImageModeChip onExit={() => enterImageMode(false)} />}
        {imageMode && <ImageOptionsBar options={imageOptions} onChange={updateImageOptions} />}
        {!imageMode && <ModeMenu
          permissionMode={permissionMode}
          askPermission={askPermission}
          onModeChange={onModeChange}
        />}
        <span class="bar-gap" />
        {imageMode && <ImageModelPicker accounts={accounts} provider={shownImageProvider} onPick={pickImageProvider} onOrder={(p, labels) => onImageOrder?.(p, labels)} />}
        {!imageMode && <ModelPicker
          openRequest={modelOpenRequest}
          accounts={accounts}
          pinned={pinnedTarget}
          standard={pinnedStandard}
          onPick={onPinnedTarget}
          levels={levels}
          selectedEffort={selectedEffort}
          defaultEffort={selectedModel?.defaultEffort}
          onEffort={(effort) => setEfforts((previous) => ({ ...previous, [effortKey]: effort }))}
        />}
        {onVoiceSettings && <button
          type="button"
          class="icon-btn dictation-btn"
          title="Diktat einrichten"
          aria-label="Diktat einrichten"
          onClick={() => onVoiceSettings(composeMessage(text, pastes.map(p => p.text)))}
        ><Glyph name="mic" size={18} /></button>}
        {running && (
          <button class="run-btn stop" title="Stop (Esc)" onClick={onCancel}>
            <IconStop size={16} />
          </button>
        )}
        {!running && !text.trim() && pastes.length === 0 && attachments.length === 0 && onVoiceSettings ? <button
          type="button"
          class="run-btn voice"
          title="Spracheinstellungen öffnen"
          aria-label="Spracheinstellungen öffnen"
          onClick={() => onVoiceSettings(composeMessage(text, pastes.map(p => p.text)))}
        ><Glyph name="voice" size={18} /></button> : (!running || text.trim()) && (
          <button
            class="run-btn send"
            title={localAction ? typedCommand?.label : !text.trim() && pastes.length === 0 ? 'Bitte eine Nachricht eingeben' : (imageMode ? !shownImageProvider : routable.length === 0) ? 'Bitte ein verfügbares Konto verbinden' : running ? 'In Warteschlange' : 'Senden'}
            aria-label={running ? 'In Warteschlange' : 'Senden'}
            aria-disabled={!canSend}
            disabled={!canSend}
            onClick={submit}
          >
            <IconSend size={20} />
          </button>
        )}
      </div>
    </div>
  );
}
