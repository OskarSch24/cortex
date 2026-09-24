import { useState } from 'preact/hooks';
import { CortexMark } from '../../components/CortexIcons.js';
import { ACCENTS, CODE_FONTS, THEME_DEFAULTS, UI_FONTS, setAppSetting, useApp, appSetting } from '../store.js';
import { Button, Card, ColorField, Page, Row, Section, Segmented, Select, Slider, TextField, Toggle, type Option } from '../ui.js';

/* ── Darstellung ───────────────────────────────────────────────────────────── */

export function DarstellungPage() {
  const [design, setDesign] = useApp('darstellung.design', 'dunkel');
  const [zeiger, setZeiger] = useApp('darstellung.zeiger', true);
  const [dock, setDock] = useApp('darstellung.dockSymbol', 'cortex');
  const [bewegung, setBewegung] = useApp('darstellung.bewegung', 'system');
  const [ui, setUi] = useApp('darstellung.uiSchrift', 13);
  const [code, setCode] = useApp('darstellung.codeSchrift', 12);
  const [marken, setMarken] = useApp('darstellung.diffMarken', 'farbe');
  const [glatt, setGlatt] = useApp('darstellung.glaettung', true);
  const before = { surface: 'rail', accent: themeValue('dunkel', 'akzent'), contrast: 42 };
  const after = { surface: 'rail-raised', accent: ACCENTS[themeValue('dunkel', 'akzent') as string]?.dunkel ?? '#EDEDEE', contrast: themeValue('dunkel', 'kontrast') };
  return <Page title="Darstellung">
    <Section title="Design">
      <div class="cxs-theme-tiles">
        {([['system', 'System'], ['hell', 'Hell'], ['dunkel', 'Dunkel']] as const).map(([value, label]) => <button type="button" key={value} class={`cxs-theme-tile ${value} ${design === value ? 'on' : ''}`} aria-pressed={design === value} onClick={() => setDesign(value)}>
          <span class="cxs-theme-art"><i /><i /><b><em /><em /><em /></b></span>
          <span>{label}</span>
        </button>)}
      </div>
      <div class="cxs-diff" aria-hidden="true">
        <div class="old">
          <p><i>1</i><code><span class="tk">const</span> themePreview: <span class="tt">ThemeConfig</span> = {'{'}</code></p>
          <p class="del"><i>2</i><code>  surface: <span class="ts">"{before.surface}"</span>,</code></p>
          <p class="del"><i>3</i><code>  accent: <span class="ts">"#8B96C9"</span>,</code></p>
          <p class="del"><i>4</i><code>  contrast: <span class="tn">{before.contrast}</span>,</code></p>
          <p><i>5</i><code>{'};'}</code></p>
        </div>
        <div class="new">
          <p><i>1</i><code><span class="tk">const</span> themePreview: <span class="tt">ThemeConfig</span> = {'{'}</code></p>
          <p class="add"><i>2</i><code>  surface: <span class="ts">"{after.surface}"</span>,</code></p>
          <p class="add"><i>3</i><code>  accent: <span class="ts">"{after.accent}"</span>,</code></p>
          <p class="add"><i>4</i><code>  contrast: <span class="tn">{after.contrast}</span>,</code></p>
          <p><i>5</i><code>{'};'}</code></p>
        </div>
      </div>
      <ThemeCard mode="hell" />
      <ThemeCard mode="dunkel" />
    </Section>
    <Section title="Einstellungen">
      <Card>
        <Row title="Zeiger-Cursor verwenden" sub="Cursor beim Überfahren interaktiver Elemente in einen Zeiger ändern"><Toggle label="Zeiger-Cursor" on={zeiger} onChange={setZeiger} /></Row>
        <Row pending title="Dock-Symbol" sub="Wähle das Symbol aus, das die App im Dock verwendet" class="tall">
          <div class="cxs-dock-icons">
            {(['cortex', 'dunkel'] as const).map(v => <button type="button" key={v} class={dock === v ? 'on' : ''} aria-pressed={dock === v} aria-label={v === 'cortex' ? 'Cortex-Symbol' : 'Dunkles Symbol'} onClick={() => setDock(v)}><span class={v}><CortexMark size={30} /></span></button>)}
          </div>
        </Row>
        <Row title="Bewegung reduzieren" sub="Animationen reduzieren oder dem System folgen"><Segmented label="Bewegung reduzieren" value={bewegung} onChange={setBewegung} options={[{ value: 'system', label: 'System' }, { value: 'ein', label: 'Ein' }, { value: 'aus', label: 'Aus' }]} /></Row>
        <Row title="UI-Schriftgröße" sub="Grundschriftgröße für die Cortex-Benutzeroberfläche anpassen"><TextField label="UI-Schriftgröße" type="number" min={10} max={20} width={64} value={ui} suffix="px" onCommit={v => { const n = Math.round(Number(v)); if (n >= 10 && n <= 20) setUi(n); }} /></Row>
        <Row title="Code-Schriftgröße" sub="Grundgröße für Code in Chats und Diffs anpassen"><TextField label="Code-Schriftgröße" type="number" min={9} max={20} width={64} value={code} suffix="px" onCommit={v => { const n = Math.round(Number(v)); if (n >= 9 && n <= 20) setCode(n); }} /></Row>
        <Row pending title="Markierungen für Unterschiede" sub="Änderungen mit Farben oder +/−-Markierungen anzeigen"><Segmented label="Markierungen" value={marken} onChange={setMarken} options={[{ value: 'farbe', label: 'Farbe' }, { value: 'zeichen', label: '+/-' }]} /></Row>
        <Row title="Schriftglättung" sub="Native macOS-Schriftglättung verwenden"><Toggle label="Schriftglättung" on={glatt} onChange={setGlatt} /></Row>
      </Card>
    </Section>
  </Page>;
}

function themeValue(mode: 'hell' | 'dunkel', name: 'akzent' | 'kontrast' | 'hintergrund' | 'vordergrund') {
  return appSetting(`darstellung.${mode}.${name}`, THEME_DEFAULTS[mode][name]);
}

const PRESETS: Record<string, { label: string; hell: [string, string]; dunkel: [string, string] }> = {
  cortex: { label: 'Cortex', hell: ['#F7F7F8', '#1A1C1F'], dunkel: ['#111316', '#ECEDEF'] },
  graphit: { label: 'Graphit', hell: ['#EEEEF0', '#202226'], dunkel: ['#17181B', '#E4E4E6'] },
  mitternacht: { label: 'Mitternacht', hell: ['#F3F5FA', '#1B2233'], dunkel: ['#0C0F17', '#E6E9F2'] },
  papier: { label: 'Papier', hell: ['#FBFAF7', '#23211C'], dunkel: ['#141311', '#EAE7E1'] },
};

function ThemeCard({ mode }: { mode: 'hell' | 'dunkel' }) {
  useApp('darstellung.design', 'dunkel');
  const k = (name: string) => `darstellung.${mode}.${name}`;
  const [preset, setPreset] = useApp(k('preset'), 'cortex');
  const [akzent, setAkzent] = useApp(k('akzent'), THEME_DEFAULTS[mode].akzent as string);
  const [bg, setBg] = useApp(k('hintergrund'), THEME_DEFAULTS[mode].hintergrund as string);
  const [fg, setFg] = useApp(k('vordergrund'), THEME_DEFAULTS[mode].vordergrund as string);
  const [uiFont, setUiFont] = useApp(k('uiFont'), 'system');
  const [contentFont, setContentFont] = useApp(k('contentFont'), 'ui');
  const [codeFont, setCodeFont] = useApp(k('codeFont'), 'system');
  const [transparent, setTransparent] = useApp(k('transparent'), true);
  const [kontrast, setKontrast] = useApp(k('kontrast'), THEME_DEFAULTS[mode].kontrast as number);
  const [copied, setCopied] = useState(false);
  const weights: Option[] = [{ value: 'normal', label: 'Normal' }];
  const choosePreset = (id: string) => { setPreset(id); const p = PRESETS[id]; if (p) { setAppSetting(k('hintergrund'), p[mode][0]); setAppSetting(k('vordergrund'), p[mode][1]); } };
  const exportTheme = () => {
    const json = JSON.stringify({ mode, preset, akzent, hintergrund: bg, vordergrund: fg, uiFont, contentFont, codeFont, transparent, kontrast }, null, 2);
    void navigator.clipboard?.writeText(json).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); });
  };
  const importTheme = async () => {
    try {
      const raw = JSON.parse(await navigator.clipboard.readText()) as Record<string, unknown>;
      for (const name of ['preset', 'akzent', 'hintergrund', 'vordergrund', 'uiFont', 'contentFont', 'codeFont', 'transparent', 'kontrast']) if (raw[name] !== undefined) setAppSetting(k(name), raw[name]);
    } catch { /* Zwischenablage ohne Design */ }
  };
  return <Card class="cxs-theme-card">
    <div class="cxs-row cxs-theme-head">
      <div class="cxs-row-text"><div class="cxs-row-title plain">{mode === 'hell' ? 'Helles Design' : 'Dunkles Design'}</div></div>
      <div class="cxs-row-control">
        <Button kind="ghost" onClick={() => void importTheme()} title="Design aus der Zwischenablage übernehmen">Importieren</Button>
        <Button kind="ghost" onClick={exportTheme}>{copied ? 'Kopiert' : 'Design kopieren'}</Button>
        <span class={`cxs-aa ${mode}`}>Aa</span>
        <Select label="Designvorlage" value={preset} onChange={choosePreset} width={174} options={Object.entries(PRESETS).map(([value, p]) => ({ value, label: p.label }))} />
      </div>
    </div>
    <Row title="Akzent"><Select label="Akzent" value={akzent} onChange={setAkzent} options={Object.entries(ACCENTS).map(([value, a]) => ({ value, label: value === 'cortex' ? (mode === 'hell' ? 'Schwarz' : 'Weiß') : a.label, icon: <i class="cxs-swatch" style={{ background: a[mode] }} /> }))} /></Row>
    <Row title="Hintergrund"><ColorField label="Hintergrund" value={bg} onChange={setBg} /></Row>
    <Row title="Vordergrund"><ColorField label="Vordergrund" value={fg} onChange={setFg} /></Row>
    <Row title="UI-Schriftart"><span class="cxs-pair"><Select label="UI-Schriftart" value={uiFont} onChange={setUiFont} options={[{ value: 'system', label: 'Cortex (Manrope)' }, { value: 'apple', label: 'Systemschrift' }, { value: 'inter', label: 'Inter' }, { value: 'helvetica', label: 'Helvetica' }, { value: 'georgia', label: 'Georgia' }]} /><Select label="Schriftstärke" value="normal" onChange={() => undefined} options={weights} disabled /></span></Row>
    <Row pending title="Inhaltsschriftart"><span class="cxs-pair"><Select label="Inhaltsschriftart" value={contentFont} onChange={setContentFont} options={[{ value: 'ui', label: 'Wie UI-Schriftart' }, ...Object.keys(UI_FONTS).map(v => ({ value: v, label: ({ system: 'Cortex (Manrope)', apple: 'Systemschrift' } as Record<string, string>)[v] ?? v[0]!.toUpperCase() + v.slice(1) }))]} /><Select label="Schriftstärke" value="normal" onChange={() => undefined} options={weights} disabled /></span></Row>
    <Row title="Code-Schriftart"><span class="cxs-pair"><Select label="Code-Schriftart" value={codeFont} onChange={setCodeFont} options={Object.keys(CODE_FONTS).map(v => ({ value: v, label: ({ system: 'Cortex (JetBrains Mono)', sfmono: 'SF Mono', menlo: 'Menlo', fira: 'Fira Code' } as Record<string, string>)[v]! }))} /><Select label="Schriftstärke" value="normal" onChange={() => undefined} options={weights} disabled /></span></Row>
    <Row title="Transparente Seitenleiste"><Toggle label="Transparente Seitenleiste" on={transparent} onChange={setTransparent} /></Row>
    <Row title="Kontrast"><Slider label="Kontrast" value={kontrast} onChange={setKontrast} /></Row>
  </Card>;
}
