/**
 * Ein `cortex-widget`-Block im Verlauf.
 *
 * Solange der Block noch einläuft, steht an seiner Stelle eine ruhige leere
 * Karte — kein halbes JSON, das bei jedem Token neu umbricht. Ist er fertig und
 * lesbar, steht das Widget da; ist er es nicht, bleibt er ein Codeblock mit dem
 * Grund, damit nichts still verschwindet.
 */
import type { ComponentChildren, FunctionComponent } from 'preact';
import { Component } from 'preact';
import { parseWidget, widgetProgress, type WidgetSpec } from './spec.js';
import type { WidgetHost } from './parts.js';
import { Calendar, Converter, Departures, Parcel, Route, Ticker, Timer, Todo, Weather, Worldclock } from './alltag.js';
import {
  AgentRun, AgentSwarm, AudioTakes, Decision, Deploy, DesignDiff, GameTheory, GraphNode, Jobs, Kpis, Palette, PlaceNaming,
  QueryResult, Quiz, Quota, ScrapeRun, Server, TestResult, Timeline, Verification, Workflow,
} from './arbeit.js';

export type { WidgetHost } from './parts.js';

/** Je Typ seine Karte. Ein neuer Typ in WidgetSpec übersetzt erst, wenn er hier steht. */
const RENDERERS: { [T in WidgetSpec['type']]: FunctionComponent<{ w: Extract<WidgetSpec, { type: T }>; host: WidgetHost }> } = {
  weather: Weather,
  timer: Timer,
  departures: Departures,
  converter: Converter,
  parcel: Parcel,
  todo: Todo,
  route: Route,
  calendar: Calendar,
  ticker: Ticker,
  worldclock: Worldclock,
  'agent-run': AgentRun,
  'agent-swarm': AgentSwarm,
  'test-result': TestResult,
  quota: Quota,
  server: Server,
  deploy: Deploy,
  verification: Verification,
  'scrape-run': ScrapeRun,
  workflow: Workflow,
  'query-result': QueryResult,
  'graph-node': GraphNode,
  decision: Decision,
  'place-naming': PlaceNaming,
  timeline: Timeline,
  jobs: Jobs,
  'design-diff': DesignDiff,
  palette: Palette,
  'audio-takes': AudioTakes,
  kpis: Kpis,
  quiz: Quiz,
  'game-theory': GameTheory,
};

function render(spec: WidgetSpec, host: WidgetHost): ComponentChildren {
  const View = RENDERERS[spec.type] as FunctionComponent<{ w: WidgetSpec; host: WidgetHost }>;
  return <View w={spec} host={host} />;
}

/** Ein Fehler beim Zeichnen darf nur diese Karte kosten, nicht den ganzen Verlauf. */
class Guard extends Component<{ fallback: ComponentChildren; children: ComponentChildren }, { failed: boolean }> {
  override state = { failed: false };
  override componentDidCatch() {
    this.setState({ failed: true });
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function Widget({ code, streaming, host, fallback }: {
  code: string;
  /** Der Block ist noch nicht geschlossen. */
  streaming: boolean;
  host: WidgetHost;
  /** Wie der Block als gewöhnlicher Code aussähe — mit dem Grund, warum. */
  fallback: (reason: string) => ComponentChildren;
}) {
  if (streaming) {
    return <div class="cx-w cx-w-pending" role="status" aria-label="Widget wird erstellt" aria-live="polite"><div>{widgetProgress(code)}</div><span /><span /><span /></div>;
  }
  const parsed = parseWidget(code.trim());
  if (!parsed.ok) return <>{fallback(parsed.error)}</>;
  return <Guard fallback={fallback('Widget konnte nicht gezeichnet werden')}>{render(parsed.spec, host)}</Guard>;
}
