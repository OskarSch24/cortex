/**
 * Ein `cortex-widget`-Block im Verlauf.
 *
 * Solange der Block noch einläuft, steht an seiner Stelle eine ruhige leere
 * Karte — kein halbes JSON, das bei jedem Token neu umbricht. Ist er fertig und
 * lesbar, steht das Widget da; ist er es nicht, bleibt er ein Codeblock mit dem
 * Grund, damit nichts still verschwindet.
 */
import type { ComponentChildren } from 'preact';
import { Component } from 'preact';
import { parseWidget, widgetProgress, type WidgetSpec } from './spec.js';
import type { WidgetHost } from './parts.js';
import { Calendar, Converter, Departures, Parcel, Route, Ticker, Timer, Todo, Weather, Worldclock } from './alltag.js';
import {
  AgentRun, AgentSwarm, AudioTakes, Decision, Deploy, DesignDiff, GameTheory, GraphNode, Jobs, Kpis, Palette, PlaceNaming,
  QueryResult, Quiz, Quota, ScrapeRun, Server, TestResult, Timeline, Verification, Workflow,
} from './arbeit.js';

export type { WidgetHost } from './parts.js';

function render(spec: WidgetSpec, host: WidgetHost): ComponentChildren {
  switch (spec.type) {
    case 'weather': return <Weather w={spec} host={host} />;
    case 'timer': return <Timer w={spec} host={host} />;
    case 'departures': return <Departures w={spec} host={host} />;
    case 'converter': return <Converter w={spec} host={host} />;
    case 'parcel': return <Parcel w={spec} host={host} />;
    case 'todo': return <Todo w={spec} host={host} />;
    case 'route': return <Route w={spec} host={host} />;
    case 'calendar': return <Calendar w={spec} host={host} />;
    case 'ticker': return <Ticker w={spec} host={host} />;
    case 'worldclock': return <Worldclock w={spec} host={host} />;
    case 'agent-run': return <AgentRun w={spec} host={host} />;
    case 'agent-swarm': return <AgentSwarm w={spec} host={host} />;
    case 'test-result': return <TestResult w={spec} host={host} />;
    case 'quota': return <Quota w={spec} host={host} />;
    case 'server': return <Server w={spec} host={host} />;
    case 'deploy': return <Deploy w={spec} host={host} />;
    case 'verification': return <Verification w={spec} host={host} />;
    case 'scrape-run': return <ScrapeRun w={spec} host={host} />;
    case 'workflow': return <Workflow w={spec} host={host} />;
    case 'query-result': return <QueryResult w={spec} host={host} />;
    case 'graph-node': return <GraphNode w={spec} host={host} />;
    case 'decision': return <Decision w={spec} host={host} />;
    case 'place-naming': return <PlaceNaming w={spec} host={host} />;
    case 'timeline': return <Timeline w={spec} host={host} />;
    case 'jobs': return <Jobs w={spec} host={host} />;
    case 'design-diff': return <DesignDiff w={spec} host={host} />;
    case 'palette': return <Palette w={spec} host={host} />;
    case 'audio-takes': return <AudioTakes w={spec} host={host} />;
    case 'kpis': return <Kpis w={spec} host={host} />;
    case 'quiz': return <Quiz w={spec} host={host} />;
    case 'game-theory': return <GameTheory w={spec} host={host} />;
  }
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
