import { buildProviderBrief } from '../../engine/packages/core/src/context/providerBrief.js';
import { locationBrief } from '../../engine/packages/core/src/context/locationBrief.js';
import { WIDGET_BRIEF } from '../../engine/packages/core/src/context/widgetBrief.js';
import { parseWidget } from '../../engine/packages/vscode/webview/components/widgets/spec.js';
import { readFileSync } from 'node:fs';
const [cmd, arg] = process.argv.slice(2);
if (cmd === 'brief') {
  process.stdout.write([buildProviderBrief({ provider: 'claude', permissionMode: 'full' }), locationBrief('Frankfurt'), WIDGET_BRIEF].join('\n\n'));
} else {
  const text = readFileSync(arg!, 'utf8');
  const blocks = [...text.matchAll(/```(?:cortex-widget|widget)\r?\n([\s\S]*?)```/g)].map((m) => m[1]!);
  process.stdout.write(JSON.stringify(blocks.map((b) => { const r = parseWidget(b.trim()); return r.ok ? { ok: true, type: r.spec.type } : { ok: false, error: r.error, head: b.slice(0, 200) }; })));
}
