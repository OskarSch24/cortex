import type { Segment, TranscriptItem } from '../../../src/panel/transcript.js';
import { Markdown, type LinkHandler } from '../Markdown.js';
import type { WidgetHost } from '../widgets/Widget.js';
import type { FileDiffDto } from '../../../src/panel/protocol.js';
import {
  ActivityGroup, TurnChanges, WebPreviewCard, WorkedFor, splitTurn, localUrls, turnFiles, type ChatActions,
} from '../chat.js';
import { assistantText } from '../../../src/panel/transcript.js';
import { AgentLanes } from '../AgentLanes.js';
import { ImageCard, type ImageAction } from '../ImageCard.js';
import type { GeneratedImage } from '../../../src/panel/transcript.js';
import type { ImageOptions } from '../../../src/panel/imageOptions.js';
import { useState } from 'preact/hooks';
import { RunState } from './RunState.js';

export interface TurnHandlers {
  /** Was der Host gerade vor dem Lauf tut; siehe activity.ts. */
  activity?: string;
  onRate?: (messageId: string, poor: boolean) => void;
  actions: ChatActions;
  onLink?: LinkHandler;
  diffs: FileDiffDto[];
  onReview?: () => void;
  onRevert?: (messageId: string, paths: string[]) => void;
  onOpenUrlIn?: (url: string, app: 'cortex' | 'chrome' | 'safari' | 'default' | 'copy') => void;
  onOpenCode?: (code: string, lang?: string) => void;
  onImageAction?: ImageActionHandler;
  widgets?: WidgetHost;
}

export type ImageActionHandler = (
  action: ImageAction,
  image: GeneratedImage,
  all: GeneratedImage[],
  options?: ImageOptions,
  target?: { provider: string; account: string },
) => void;

/**
 * Eine Antwort im Aufbau der Codex-App.
 *
 * Solange sie läuft, steht alles im Text, wie es geschieht: Absätze und
 * dazwischen die grauen Tätigkeitszeilen. Ist sie fertig, faltet sich die
 * Arbeit hinter „… lang gearbeitet ›“; stehen bleiben die Schlussantwort und
 * darunter die Karten — Webvorschau, geänderte Dateien.
 */
export function AssistantTurn({ item, items, running, startedAt, handlers, children }: {
  item: Extract<TranscriptItem, { kind: 'assistant' }>;
  items: TranscriptItem[];
  running?: boolean;
  startedAt: number;
  handlers: TurnHandlers;
  children?: preact.ComponentChildren;
}) {
  const [open, setOpen] = useState(false);
  const live = !item.done;
  const indexed = item.segments.map((seg, j) => [seg, j] as [Segment, number]);
  const { work, final } = live ? { work: indexed, final: [] as Array<[Segment, number]> } : splitTurn(item.segments);
  const lastText = item.segments.reduce((found, s, j) => (s.kind === 'text' ? j : found), -1);
  const segment = (seg: Segment, j: number) => {
    if (seg.kind === 'text') {
      return (
        <div key={j} class="cx-c-prose">
          <Markdown text={seg.text} onOpenCode={handlers.onOpenCode} onLink={handlers.onLink} widgets={handlers.widgets && { ...handlers.widgets, stateKey: `${item.messageId}/${j}` }} live={live} />
          {live && j === lastText && <span class="type-cursor" />}
        </div>
      );
    }
    if (seg.kind === 'tools') return <ActivityGroup key={j} steps={seg.steps} actions={handlers.actions} />;
    return <AgentLanes key={j} lanes={seg.lanes} live={live} />;
  };
  const answer = assistantText(item);
  const urls = item.done ? localUrls(answer) : [];
  const files = item.done ? turnFiles(item.segments) : [];
  const imagePending = live && running && indexed.some(([seg]) => seg.kind === 'tools' && seg.steps.some(step => /image[_-]?(gen|edit|generation)|bild.*(erstell|bearbeit)/i.test(step.name)));
  return (
    <div class={`tl tl-assistant cx-c-turn ${live ? 'tl-live' : ''}`}>
      {!live && work.length > 0 && (
        <>
          <WorkedFor ms={item.durationMs} open={open} onToggle={() => setOpen((v) => !v)} />
          <div class="cx-c-rule" />
          {open && <div class="cx-c-work">{work.map(([seg, j]) => segment(seg, j))}</div>}
        </>
      )}
      {(live ? work : final).map(([seg, j]) => segment(seg, j))}
      {live && running && startedAt > 0 && <RunState items={items} segments={item.segments} activity={handlers.activity} />}
      {item.stopped && <div class="assistant-stopped">⊘ {item.stoppedReason ?? 'stopped'}</div>}
      {!!item.images?.length && handlers.onImageAction && (
        <ImageCard
          images={item.images}
          options={item.imageOptions}
          provider={item.target?.provider}
          ratedPoor={item.ratedPoor}
          onRate={() => handlers.onRate?.(item.messageId, !item.ratedPoor)}
          onAction={(action, image, all) => handlers.onImageAction!(action, image, all, item.imageOptions, item.target ? { provider: item.target.provider, account: item.target.account } : undefined)}
        />
      )}
      {imagePending && !item.images?.length && <div class="cx-image-pending" role="status" aria-label="Bild wird erstellt"><span /></div>}
      {!item.images?.length && handlers.onOpenUrlIn && urls.map(url => <WebPreviewCard key={url} url={url} onOpenIn={(app) => handlers.onOpenUrlIn!(url, app)} />)}
      {files.length > 0 && handlers.onReview && (
        <TurnChanges
          files={files}
          diffs={handlers.diffs}
          reverted={item.reverted}
          revertReason={!item.canRevert ? item.revertReason ?? 'Kein gespeicherter Stand verfügbar. Rückgängig ist nur für gespeicherte Aufträge in Git-Projekten möglich.' : undefined}
          onReview={handlers.onReview}
          onRevert={() => handlers.onRevert?.(item.messageId, files.map((f) => f.path))}
          onOpenPath={(path) => handlers.actions.onOpenPath?.(path)}
        />
      )}
      {children}
    </div>
  );
}
