/** Local-only computer history. These messages never become conversation events. */
export interface HistorySettings {
  enabled: boolean;
  allowedApps: string[];
  retentionDays: number;
}
export interface HistoryApp { id: string; name: string; supported: boolean; reason?: string }
export interface HistoryEntry {
  id: string;
  startedAt: number;
  endedAt: number;
  appId: string;
  appName: string;
  title: string;
  text: string;
  summary?: string;
}
export interface HistoryState {
  settings: HistorySettings;
  permission: boolean;
  model: 'available' | 'unavailable';
  modelReason?: string;
  running: boolean;
  status: string;
  apps: HistoryApp[];
  entries: HistoryEntry[];
  total: number;
  error?: string;
}
export interface HistoryQuestionResult {
  question: string;
  answer: string;
  sources: Array<Pick<HistoryEntry, 'id' | 'startedAt' | 'appName' | 'title'>>;
  error?: string;
}
export type HistoryRequest =
  | { kind: 'computerHistory'; action: 'unsubscribe' }
  | { kind: 'computerHistory'; action: 'state'; query?: string; from?: number; to?: number }
  | { kind: 'computerHistory'; action: 'configure'; settings: Partial<HistorySettings> }
  | { kind: 'computerHistory'; action: 'permission' }
  | { kind: 'computerHistory'; action: 'delete'; id: string }
  | { kind: 'computerHistory'; action: 'clear' }
  | { kind: 'computerHistory'; action: 'ask'; question: string; from?: number; to?: number; requestId: string };
export type HistoryResponse =
  | { kind: 'computerHistoryState'; state: HistoryState }
  | { kind: 'computerHistoryAnswer'; result: HistoryQuestionResult; requestId: string };

/** Native helper JSON protocol. No capture in status/apps/model operations. */
export interface NativeHistoryStatus {
  permission: boolean;
  model: 'available' | 'unavailable';
  modelReason?: string;
  apps: HistoryApp[];
}
export interface NativeHistorySample {
  sample?: { appId: string; appName: string; title: string; text: string };
  status: string;
}
