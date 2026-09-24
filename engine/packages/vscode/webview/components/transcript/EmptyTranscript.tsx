import { IconCortex } from '../icons.js';

/**
 * Der Verlauf, solange er leer ist. Als Funktion statt als Komponente
 * aufgerufen, damit das Wurzel-div beim ersten Eintrag dasselbe bleibt.
 */
export function emptyTranscript({ accounts, noAccounts, onAddAccount }: {
  accounts: Array<{ reviewOnly?: boolean; authState?: string; provider: string; label: string }>;
  noAccounts?: boolean;
  onAddAccount?: () => void;
}) {
  const account = accounts.find(account => !account.reviewOnly && account.authState !== 'expired');
  const example = account ? `@${account.provider}:${account.label}` : undefined;
  return (
    <div class="transcript empty">
      <div class="empty-box">
        <div class="empty-logo">
          <IconCortex size={22} />
          <span>cortex</span>
        </div>
        {noAccounts ? (
          <>
            <div class="empty-line">
              Connect your AI subscriptions — multiple Claude accounts, Codex, Grok —
              and every task is routed to the best one.
            </div>
            <button class="run-btn send empty-cta" onClick={onAddAccount}>
              Add your first account
            </button>
          </>
        ) : (
          <>
            <div class="empty-line">Route every task to the best subscription you own.</div>
            <div class="empty-hints">
              <div>
                {example ? <><code>{example}</code> Konto gezielt auswählen</> : 'Konto und Modell über die Auswahl unter der Eingabe wählen'}
              </div>
              <div>
                <code>#tests</code> trigger tag rules
              </div>
              <div>
                <code>/review</code> commands run on every model
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
