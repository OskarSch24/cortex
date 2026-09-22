import * as vscode from 'vscode';
import type { Target } from '@cortex/core';

const SHORT_PROVIDER: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  copilot: 'Copilot',
  grok: 'Grok',
  openrouter: 'OpenRouter',
};

export function prettyTarget(target: Target): string {
  const provider = SHORT_PROVIDER[target.provider] ?? target.provider;
  const model = target.model ? ` / ${target.model}` : '';
  return `${provider} · ${target.account}${model}`;
}

export class RouterStatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private pinned?: Target;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
    this.item.name = 'cortex';
    this.item.command = 'cortex.pickModel';
    this.setPinned(undefined);
    this.item.show();
  }

  idle(): void {
    this.render();
  }

  routed(_target: Target): void {
    this.render();
  }

  setPinned(target: Target | undefined): void {
    this.pinned = target;
    this.render();
  }

  private render(): void {
    if (!this.pinned) {
      this.item.text = '$(chevron-down) Auto';
      this.item.tooltip = 'cortex — Auto picks across your subscriptions. Click to choose a model.';
      return;
    }
    this.item.text = `$(chevron-down) ${prettyTarget(this.pinned)}`;
    this.item.tooltip = `cortex — ${prettyTarget(this.pinned)}. Click to switch.`;
  }

  dispose(): void {
    this.item.dispose();
  }
}
