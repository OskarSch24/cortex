import { useEffect, useState } from 'preact/hooks';
import { NATIVE_SETTINGS } from '../../src/panel/nativeSettings.js';
import { vscode } from '../vscodeApi.js';

const categories = [ ['Alle Einstellungen', ''], ['Darstellung', 'workbench'], ['Editor', 'editor'], ['Dateien', 'files'], ['Terminal', 'terminal.integrated'], ['Tastenkürzel', '@keybindings'], ['Erweiterungen', '@extensions'] ];
export function NativeSettings() {
 const standalone = Boolean((window as any).cortexDesktop);
 const [values, setValues] = useState<Record<string, unknown>>({});
 const [error, setError] = useState('');
 const [search, setSearch] = useState('');
 useEffect(() => {
   const listener = (event: MessageEvent) => {
     if (event.data.kind === 'nativeSettings') { setValues(event.data.values); setError(event.data.error ?? ''); }
   };
   window.addEventListener('message', listener);
   vscode.postMessage({kind:'getNativeSettings'});
   return () => window.removeEventListener('message', listener);
 }, []);
 const open = (query = '') => vscode.postMessage({kind:'openNativeSettings',query});
 const change = (key: string, value: unknown) => vscode.postMessage({kind:'setNativeSetting',key,value});
 return <section class="cx-native-settings">
   <h2>Ansicht</h2>
   <div class="cx-native-links" aria-label="Ansichtsaktionen">
     {!standalone && <button class="cx-secondary" onClick={() => vscode.postMessage({kind:'workbenchAction',action:'split'})}>Ansicht teilen</button>}
     <button class="cx-secondary" onClick={() => vscode.postMessage({kind:'workbenchAction',action:'close'})}>{standalone ? 'Datei schließen' : 'Ansicht schließen'}</button>
     <button class="cx-secondary" onClick={() => vscode.postMessage({kind:'workbenchAction',action:'commands'})}>Weitere Befehle …</button>
   </div>
   <h2>Editor & Anwendung</h2>
   <p>{standalone ? 'Einstellungen für den Cortex-Dateieditor und das integrierte Terminal. Änderungen werden sofort übernommen.' : 'Die Benutzereinstellungen von VSCodium. Projekt- und Spracheinstellungen kannst du im vollständigen Einstellungseditor bearbeiten.'}</p>
   <form class="cx-native-search" onSubmit={e => { e.preventDefault(); if (!standalone) open(search); }}><input aria-label="Anwendungseinstellungen suchen" placeholder="Einstellungen durchsuchen …" value={search} onInput={e => setSearch(e.currentTarget.value)} /><button type="submit" class="cx-secondary">Suchen</button></form>
   <div class="cx-native-links">{(standalone ? [['Tastenkürzel','@keybindings'],['Plugins','@extensions']] : categories).map(([label,query]) => <button class="cx-secondary" onClick={() => open(query)}>{label}</button>)}<button class="cx-secondary" onClick={() => open('@json')}>settings.json</button></div>
   {error && <p role="alert">{error}</p>}
   {!Object.keys(values).length && !error && <p>Einstellungen werden geladen …</p>}
   {['Editor','Dateien','Terminal'].map(group => <section class="settings-block"><h3>{group}</h3>{NATIVE_SETTINGS.filter(s => s.group === group && (!standalone || `${s.label} ${s.key}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))).map(setting => {
     const value = values[setting.key];
     return <label class="cx-native-row"><span>{setting.label}<small>{setting.key}</small></span>
       {setting.type === 'boolean' ? <input type="checkbox" disabled={value === undefined} checked={value === true} onChange={e => change(setting.key,e.currentTarget.checked)} /> : setting.type === 'enum' ? <select disabled={value === undefined} value={String(value ?? '')} onChange={e => change(setting.key,e.currentTarget.value)}>{setting.options.map(option => <option value={option}>{('labels' in setting ? (setting.labels as Record<string, string>)[option] : undefined) ?? option}</option>)}</select> : <input key={`${setting.key}:${value}`} disabled={value === undefined} type={setting.type === 'number' ? 'number' : 'text'} min={setting.type === 'number' ? setting.min : undefined} max={setting.type === 'number' ? setting.max : undefined} defaultValue={String(value ?? '')} onBlur={e => { const next = setting.type === 'number' ? Number(e.currentTarget.value) : e.currentTarget.value; if (next !== value) change(setting.key,next); }} />}
     </label>;
   })}</section>)}
 </section>;
}
