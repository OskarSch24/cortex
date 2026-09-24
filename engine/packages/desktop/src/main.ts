import { app, BrowserWindow, WebContentsView, ipcMain, protocol, net, dialog, Menu, safeStorage } from 'electron';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { activate } from '../../vscode/src/extension.js';
import * as platform from './platform.js';
import { createDesktopStorage } from './storage.js';
import { allowedResource, resourcePath, resourceUrl, previewUrl, injectShell } from './security.js';
import { DesktopTerminal } from './terminal.js';
import { agentBrowser, releaseLayout, type AgentBrowserHost, type AgentTab } from './agentBrowser.js';
import { errorMessage } from '../../vscode/src/util/errors.js';

app.setName('Cortex');
if (process.env.CORTEX_DATA_DIR) app.setPath('userData', process.env.CORTEX_DATA_DIR);
protocol.registerSchemesAsPrivileged([{scheme:'cortex-app',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
const testing = process.argv.includes('--verify-startup');
if(testing){
  if(!process.env.CORTEX_DATA_DIR || !process.env.CORTEX_TEST_HOME || process.env.CORTEX_TEST_HOME!==process.env.HOME){
    throw new Error('Startprüfung benötigt ein isoliertes HOME und CORTEX_DATA_DIR.');
  }
  app.setActivationPolicy('prohibited');
}
const resourcesPath = join(__dirname, '..', 'resources', 'cortex');
const shellRoot = join(__dirname, 'renderer');
const panels = new Map<number, any>();
const panelIds = new Map<string, any>();
const terminals = new Map<string, DesktopTerminal>();
const documents = new Map<string, any>();
const context = new Map<string, unknown>();
const requests = new Map<string, (value: unknown) => void>();
let mainWindow: BrowserWindow;
let primary: any;
let storage: ReturnType<typeof createDesktopStorage>;
let extensionContext: any;
// Der eingebaute Browser: mehrere Tabs in einer gemeinsamen Sitzung. Pop-ups
// (Anmeldefenster wie „Mit Apple anmelden“) werden eigene Tabs und behalten
// dabei ihre Verbindung zum öffnenden Fenster. Tabs mit `owner` hat ein
// Agent geöffnet (agentBrowser.ts); sie laufen im Hintergrund weiter.
type BrowserTab = AgentTab;
const browserTabs = new Map<string, BrowserTab>();
let activeTab = '';
let browserVisible = false;
let browserBounds: Electron.Rectangle | undefined;
let browserShown = false;
const previewSessions = new WeakSet<Electron.Session>();
let quitting = false;
let restartOnExit = false;
let rendererReady = false;
let applicationReady = false;
let hostRoundtrip = false;
const startupToken = randomUUID();

function sendShell(message: any) {
  if(message.kind === 'contexts') { for(const [key,value] of Object.entries(message.values)){context.set(key,value);sendShell({type:'context',key,value});}return; }
  if(message.kind === 'configuration') message={type:'config',values:message.values};
  if(message.kind === 'notice') message={type:'shell-error',message:message.message};
  if(message.kind === 'editorSaved') message={type:'editor-saved',id:message.uri,text:message.text};
  if(message.kind === 'diagnostics') message={...message,type:'diagnostics'};
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('cortex:shell', message);
}
function report(error: unknown) { const message=errorMessage(error); console.error(`[Cortex] ${message}`); sendShell({type:'shell-error',message}); }
function trusted(event: Electron.IpcMainEvent) {
  if(quitting)return undefined;
  const panel=panels.get(event.sender.id);
  return panel && event.senderFrame === event.sender.mainFrame && event.sender.getURL() === `cortex-app://view/${panel.id}` ? panel : undefined;
}

function createPanel(viewType: string, title: string, options: any = {}, viewColumn?: number) {
  const isMain = viewType === 'kortex.agent' || viewType === 'cortex.agent';
  if(isMain && primary && !primary.disposed) { primary.reveal(); return primary; }
  const win = isMain ? mainWindow : createWindow(title);
  const id=randomUUID(), receive=new platform.EventEmitter<any>(), disposeEvent=new platform.EventEmitter<void>(), viewEvent=new platform.EventEmitter<any>();
  let html='', ready=false, disposed=false;
  const queue:any[]=[];
  const webview:any={
    options: options ?? {}, cspSource:'cortex-app:',
    onDidReceiveMessage:receive.event,
    postMessage:async(message:any)=>{if(disposed)return false;if(ready)win.webContents.send('cortex:host',message);else queue.push(message);return true;},
    asWebviewUri:(uri:any)=>({toString:()=>resourceUrl(id,uri.fsPath)}),
  };
  Object.defineProperty(webview,'html',{get:()=>html,set:(value:string)=>{
    ready=false;html=injectShell(value,id,shellRoot);
    void win.loadURL(`cortex-app://view/${id}`).catch(report);
  }});
  const panel:any={ id,viewType,title,webview,win,receive,queue,
    get visible(){return !disposed&&win.isVisible();}, get active(){return !disposed&&win.isFocused();}, get disposed(){return disposed;},
    options:{},viewColumn:viewColumn??1,
    onDidDispose:disposeEvent.event,onDidChangeViewState:viewEvent.event,
    reveal:()=>{if(!disposed&&!testing){win.show();win.focus();viewEvent.fire({webviewPanel:panel});}},
    dispose:()=>{if(!disposed)win.close();},
  };
  const webContentsId=win.webContents.id;
  panels.set(webContentsId,panel);panelIds.set(id,panel);if(isMain)primary=panel;
  win.webContents.on('did-finish-load',()=>{ready=true;for(const message of queue.splice(0))win.webContents.send('cortex:host',message);if(testing)win.webContents.send('cortex:host',{kind:'desktop-host-ping',token:startupToken});else win.show();viewEvent.fire({webviewPanel:panel});});
  win.on('focus',()=>{platform.notifyWindowFocus(true);viewEvent.fire({webviewPanel:panel});});
  win.on('blur',()=>{platform.notifyWindowFocus(false);viewEvent.fire({webviewPanel:panel});});
  win.on('closed',()=>{disposed=true;panels.delete(webContentsId);panelIds.delete(id);disposeEvent.fire();receive.dispose();viewEvent.dispose();if(primary===panel)primary=undefined;});
  return panel;
}
function createWindow(title='Cortex') {
  const win=new BrowserWindow({width:1440,height:960,minWidth:760,minHeight:560,title,show:false,backgroundColor:'#181818',titleBarStyle:'hiddenInset',trafficLightPosition:{x:16,y:16},webPreferences:{preload:join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,webviewTag:false}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  if(testing){
    win.webContents.on('console-message',details=>{if(details.level==='error')console.error(`[Cortex renderer] ${details.message}`);});
    win.webContents.on('render-process-gone',(_event,details)=>{console.error('CORTEX_RENDERER_FAILED',details.reason);app.exit(1);});
  }
  win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('cortex-app://view/'))event.preventDefault();});
  win.on('enter-full-screen',()=>sendShell({type:'window-state',fullscreen:true}));
  win.on('leave-full-screen',()=>sendShell({type:'window-state',fullscreen:false}));
  win.on('close',event=>{
    if(quitting||win!==mainWindow)return;
    if([...documents.values()].some(doc=>doc.isDirty)){
      const choice=dialog.showMessageBoxSync(win,{type:'question',message:'Ungespeicherte Dateiänderungen',detail:'Vor dem Beenden speichern?',buttons:['Abbrechen','Änderungen verwerfen','Alle speichern'],defaultId:2,cancelId:0});
      if(choice===0){restartOnExit=false;event.preventDefault();return;}
      if(choice===2){event.preventDefault();void Promise.all([...documents.values()].filter(doc=>doc.isDirty).map(saveDocument)).then(saved=>{if(saved.every(Boolean)){quitting=true;app.quit();}else restartOnExit=false;}).catch(error=>{restartOnExit=false;report(error);});return;}
    }
    quitting=true;app.quit();
  });
  return win;
}
function activeBrowser(){return browserTabs.get(activeTab)?.view;}
function tabSummary(tab:BrowserTab){const contents=tab.view.webContents;const url=contents.isDestroyed()?'about:blank':contents.getURL()||'about:blank';return {id:tab.id,agent:!!tab.owner,title:(contents.isDestroyed()?'':contents.getTitle())||(url==='about:blank'?'Neuer Tab':url),url,loading:tab.loading};}
function browserState(){const tab=browserTabs.get(activeTab);const contents=tab&&!tab.view.webContents.isDestroyed()?tab.view.webContents:undefined;return {type:'browser-state',url:contents?.getURL()||'about:blank',title:contents?.getTitle()||'Vorschau',canBack:contents?.navigationHistory.canGoBack()??false,canForward:contents?.navigationHistory.canGoForward()??false,visible:browserVisible,loading:tab?.loading??false,error:tab?.error??'',tabs:[...browserTabs.values()].map(tabSummary),active:activeTab};}
function tabShown(id:string){return id===activeTab&&browserVisible&&browserShown;}
function placeBrowser(){for(const tab of browserTabs.values()){const current=tab.id===activeTab;if(current&&browserBounds)tab.view.setBounds(browserBounds);const shown=tabShown(tab.id);if(shown)releaseLayout(tab);tab.view.setVisible(shown);}}
function preparePreviewSession(session:Electron.Session){
  if(previewSessions.has(session))return;previewSessions.add(session);
  session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  session.setPermissionCheckHandler(()=>false);
  // Mehrere Passkeys für dieselbe Seite: der Mac fragt, welcher gemeint ist.
  session.on('select-webauthn-account',(_event,details,callback)=>{let chosen:string|undefined;try{if(details.accounts.length===1)chosen=details.accounts[0]!.credentialId;else if(details.accounts.length>1){const labels=details.accounts.map(account=>account.displayName||account.name||account.credentialId);const choice=dialog.showMessageBoxSync(mainWindow,{type:'question',message:`Passkey für ${details.relyingPartyId}`,detail:'Mit welchem Konto möchtest du dich anmelden?',buttons:[...labels,'Abbrechen'],cancelId:labels.length,defaultId:0});chosen=details.accounts[choice]?.credentialId;}}finally{callback(chosen);}});
}
function createTab(adopt?: Electron.BrowserWindowConstructorOptions & {webContents?: Electron.WebContents}, owner?: string): BrowserTab {
  const view=adopt?.webContents?new WebContentsView({webContents:adopt.webContents}):new WebContentsView({webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,partition:'persist:cortex-preview'}});
  const tab:BrowserTab={id:randomUUID().slice(0,8),view,loading:false,error:'',owner};browserTabs.set(tab.id,tab);
  const contents=view.webContents;preparePreviewSession(contents.session);
  view.setBackgroundColor('#111316');view.setVisible(false);if(owner)contents.setBackgroundThrottling(false);mainWindow.contentView.addChildView(view);
  const update=()=>sendShell(browserState());
  contents.setWindowOpenHandler(({url,disposition})=>{
    try{previewUrl(url);}catch{return {action:'deny'};}
    return {action:'allow',createWindow:options=>{const child=createTab(options as any,tab.owner);if(disposition!=='background-tab'&&!tab.owner){activeTab=child.id;placeBrowser();}sendShell({...browserState(),activate:disposition!=='background-tab'&&!tab.owner});return child.view.webContents;}};
  });
  contents.on('will-navigate',(event,url)=>{try{previewUrl(url);}catch{event.preventDefault();}});
  contents.on('did-start-loading',()=>{tab.loading=true;tab.error='';update();});
  contents.on('did-stop-loading',()=>{tab.loading=false;update();});
  contents.on('did-fail-load',(_event,code,description,_url,mainFrame)=>{if(mainFrame&&code!==-3){tab.error=description||'Die Seite ließ sich nicht laden.';update();}});
  for(const name of ['did-navigate','did-navigate-in-page','did-finish-load','page-title-updated'] as const)contents.on(name as any,update);
  // Ein Anmeldefenster schließt sich nach getaner Arbeit selbst (window.close()).
  contents.on('destroyed',()=>{if(browserTabs.has(tab.id))closeTab(tab.id);});
  return tab;
}
function selectTab(id:string){if(!browserTabs.has(id))return;activeTab=id;browserVisible=true;placeBrowser();sendShell({...browserState(),activate:true});}
function closeTab(id:string){
  const tab=browserTabs.get(id);if(!tab)return;browserTabs.delete(id);
  try{mainWindow.contentView.removeChildView(tab.view);}catch{}
  if(!tab.view.webContents.isDestroyed())tab.view.webContents.close();
  if(activeTab===id)activeTab=[...browserTabs.keys()].at(-1)||'';
  if(!browserTabs.size){browserVisible=false;primary?.receive.fire({kind:'closeBrowser'});}
  placeBrowser();sendShell(browserState());
}
async function openBrowser(url='about:blank',newTab=false) {
  const target=previewUrl(url);
  const tab=!newTab&&browserTabs.get(activeTab)||createTab();
  activeTab=tab.id;browserVisible=true;tab.view.setVisible(false);sendShell({...browserState(),activate:true,loading:true});
  try{await tab.view.webContents.loadURL(target);tab.error='';}
  catch(error){tab.error=errorMessage(error);}
  placeBrowser();sendShell(browserState());
}
// Was ein Agent im eingebauten Browser tun darf, steht in agentBrowser.ts.
const agentHost:AgentBrowserHost={
  tabs:browserTabs,shown:tabShown,validUrl:previewUrl,close:closeTab,show:selectTab,
  create:owner=>{const tab=createTab(undefined,owner);sendShell(browserState());return tab;},
};
function closeBrowser(){browserVisible=false;placeBrowser();sendShell(browserState());}
async function showEditor(document:any,_options?:any){
  const id=document.uri.toString();documents.set(id,document);platform.notifyEditorState({uri:document.uri,text:document.getText(),active:true});
  sendShell({type:'editor-open',id,path:document.uri.fsPath,text:document.getText(),language:document.languageId,readonly:document.isReadonly??false});
  return {document,selection:new platform.Selection(0,0,0,0),revealRange:()=>{},edit:async(callback:any)=>{const edits:any[]=[];callback({replace:(_range:any,text:string)=>edits.push(text),insert:(_point:any,text:string)=>edits.push(document.getText()+text)});if(edits.length){platform.notifyEditorState({uri:document.uri,text:edits.at(-1),active:true});sendShell({type:'editor-open',id,path:document.uri.fsPath,text:edits.at(-1),language:document.languageId});}return true;}};
}
async function saveDocument(document:any){
  const previousId=document.uri.toString();
  const saved=await document.save();
  if(saved){
    if(previousId!==document.uri.toString()){
      documents.delete(previousId);sendShell({type:'editor-closed',id:previousId});await showEditor(document);
    }
    sendShell({type:'editor-saved',id:document.uri.toString(),text:document.getText()});
  }
  return saved;
}
function requestShell(request:any):Promise<any>{
  const id=randomUUID();sendShell({type:'prompt',id,...request,kind:request.kind==='quickPick'?'pick':'input',placeholder:request.placeHolder??request.placeholder});
  return new Promise(resolve=>requests.set(id,resolve));
}
async function chooseCommand(title:string,items:Array<{label:string;command:string}>){
  const index=await requestShell({kind:'quickPick',title,items:items.map((item,value)=>({...item,value}))});
  const item=Number.isInteger(index)?items[index]:undefined;
  if(item)return platform.commands.executeCommand(item.command);
}
const builtins=['workbench.action.browser.open','workbench.action.browser.closeAll','simpleBrowser.api.open','workbench.action.closePanel','workbench.action.closeSidebar','workbench.action.closeAuxiliaryBar','workbench.action.focusSecondEditorGroup','workbench.action.openSettings','workbench.action.openSettingsJson','workbench.action.openGlobalKeybindings','workbench.view.extensions','workbench.action.quickOpen','workbench.action.showCommands','workbench.action.closeActiveEditor','workbench.action.splitEditor','vscode.diff','_cortex.restartApplication','_cortex.agentBrowser','workbench.action.files.save','editor.action.formatDocument'];
async function executeBuiltin(command:string,...args:any[]):Promise<any>{
  switch(command){
    case 'workbench.action.closeSidebar':case 'workbench.action.closeAuxiliaryBar':return; // No external Workbench chrome exists in this host.
    case 'workbench.action.closePanel':sendShell({type:'terminal-hide'});return;
    case 'workbench.action.focusSecondEditorGroup':sendShell({type:'editor-focus'});return;
    case 'workbench.action.browser.open':return openBrowser(args[0]?.url);
    case 'simpleBrowser.api.open':return openBrowser(args[0]?.toString());
    case 'workbench.action.browser.closeAll':closeBrowser();return;
    case '_cortex.agentBrowser':return agentBrowser(agentHost,String(args[0]??''),args[1]&&typeof args[1]==='object'?args[1]:{});
    case '_cortex.restartApplication':restartOnExit=true;mainWindow.close();return;
    case 'vscode.diff':{
      const left=await platform.workspace.openTextDocument(args[0]);const right=await platform.workspace.openTextDocument(args[1]);
      sendShell({type:'editor-diff',id:randomUUID(),path:args[2]||'Änderungen',original:left.getText(),modified:right.getText(),language:right.languageId,readonly:true});return;
    }
    case 'workbench.action.files.save':for(const document of documents.values())if(document.isDirty)await saveDocument(document);return;
    case 'editor.action.formatDocument':sendShell({type:'editor-format'});return;
    case 'workbench.action.openSettingsJson':return platform.window.showTextDocument(await platform.workspace.openTextDocument(storage.settingsPath));
    case 'workbench.action.openSettings':primary?.webview.postMessage({kind:'showPage',page:'settings'});return;
    case 'workbench.view.extensions':primary?.webview.postMessage({kind:'showPage',page:'plugins'});return;
    case 'workbench.action.openGlobalKeybindings':return chooseCommand('Tastaturkurzbefehle',[{label:'⌘N · Neuer Chat',command:'cortex.newConversation'},{label:'⌘, · Einstellungen',command:'workbench.action.openSettings'},{label:'⌘S · Datei speichern',command:'workbench.action.files.save'},{label:'⌘⇧P · Befehle',command:'workbench.action.showCommands'},{label:'⌘J · Terminal',command:'cortex.showTerminal'}]);
    case 'workbench.action.quickOpen':{
      const picked=await dialog.showOpenDialog(mainWindow,{properties:['openFile']});
      if(picked.filePaths[0])return platform.commands.executeCommand('vscode.open',platform.Uri.file(picked.filePaths[0]));return;
    }
    case 'workbench.action.showCommands':{
      const commands=await platform.commands.getCommands();return chooseCommand('Cortex-Befehl ausführen',commands.filter((id:string)=>id.startsWith('cortex.')).map((id:string)=>({label:id.replace('cortex.',''),command:id})));
    }
    case 'workbench.action.closeActiveEditor':sendShell({type:'editor-request-close'});return;
    case 'workbench.action.splitEditor':sendShell({type:'editor-split'});return;
    default:throw new Error(`Der Befehl „${command}“ ist in Cortex noch nicht verfügbar.`);
  }
}

async function shellMessage(message:any){
  if(!message||typeof message.type!=='string')return;
  const terminal=terminals.get(message.id),document=documents.get(message.id);
  switch(message.type){
    case 'shell-ready':rendererReady=true;for(const [key,value] of context)sendShell({type:'context',key,value});sendShell({type:'window-state',fullscreen:mainWindow.isFullScreen()});sendShell({type:'config',values:platform.configurationValues()});sendShell(browserState());return;
    case 'host-roundtrip':if(testing&&message.token===startupToken)hostRoundtrip=true;return;
    case 'command':if(typeof message.command==='string')await platform.commands.executeCommand(message.command);return;
    case 'prompt-result':requests.get(message.id)?.(message.value);requests.delete(message.id);return;
    case 'terminal-input':if(typeof message.data==='string'&&message.data.length<1048576)terminal?.input(message.data);return;
    case 'terminal-resize':if(Number.isFinite(message.cols)&&Number.isFinite(message.rows))terminal?.resize(message.cols,message.rows);return;
    case 'terminal-close':terminal?.dispose();terminals.delete(message.id);sendShell({type:'terminal-closed',id:message.id});return;
    case 'terminal-new':platform.window.createTerminal({name:'Cortex',cwd:platform.workspace.workspaceFolders?.[0]?.uri.fsPath??homedir()}).show();return;
    case 'terminal-hide':primary?.receive.fire({kind:'closeTerminal'});return;
    case 'browser-navigate':await openBrowser(String(message.url));return;
    case 'browser-new-tab':await openBrowser(String(message.url||'about:blank'),true);return;
    case 'browser-select-tab':selectTab(String(message.id));return;
    case 'browser-close-tab':closeTab(String(message.id));return;
    case 'browser-back':activeBrowser()?.webContents.navigationHistory.goBack();return;
    case 'browser-forward':activeBrowser()?.webContents.navigationHistory.goForward();return;
    case 'browser-reload':activeBrowser()?.webContents.reload();return;
    case 'browser-close':primary?.receive.fire({kind:'closeBrowser'});closeBrowser();return;
    case 'browser-bounds':{const {width,height}=mainWindow.getContentBounds();const zoom=mainWindow.webContents.getZoomFactor();const scaled=(value:unknown)=>Math.round((Number(value)||0)*zoom);const x=Math.max(0,Math.min(width,scaled(message.x))),y=Math.max(0,Math.min(height,scaled(message.y)));browserBounds={x,y,width:Math.max(0,Math.min(width-x,scaled(message.width))),height:Math.max(0,Math.min(height-y,scaled(message.height)))};browserShown=!!message.visible;placeBrowser();}return;
    case 'editor-active':if(document)platform.notifyEditorState({uri:document.uri,active:true});return;
    case 'editor-selection':if(document&&message.selection)platform.notifyEditorState({uri:document.uri,selection:{start:{line:message.selection.startLine,character:message.selection.startCharacter},end:{line:message.selection.endLine,character:message.selection.endCharacter}},active:true});return;
    case 'editor-change':if(document&&typeof message.text==='string')platform.notifyEditorState({uri:document.uri,text:message.text,active:true});return;
    case 'editor-save':if(document){try{if(typeof message.text==='string')platform.notifyEditorState({uri:document.uri,text:message.text,active:true});await saveDocument(document);}catch(error){sendShell({type:'editor-error',id:message.id,message:errorMessage(error)});}}return;
    case 'editor-close':if(document){if(document.isDirty){const {response}=await dialog.showMessageBox(mainWindow,{message:'Dateiänderungen speichern?',detail:document.uri.fsPath,buttons:['Abbrechen','Verwerfen','Speichern'],defaultId:2,cancelId:0});if(!response)return;if(response===2&&!await saveDocument(document))return;}const id=document.uri.toString();platform.notifyEditorState({uri:document.uri,closed:true});documents.delete(id);sendShell({type:'editor-closed',id});}else sendShell({type:'editor-closed',id:message.id});return;
  }
}

/**
 * Passkeys mit Touch ID im eingebauten Browser. Electron speichert sie im
 * Schlüsselbund, gebunden an die Secure Enclave dieses Macs. Das geht nur, wenn
 * die App mit der Schlüsselbund-Berechtigung signiert ist (Provisioning-Profil,
 * siehe scripts/assemble.sh); dann legt die Signatur webauthn.json in die
 * Ressourcen. Ohne sie bleibt Touch ID aus, statt Seiten einen Weg anzubieten,
 * der beim ersten Versuch scheitert. Passkeys aus dem iCloud-Schlüsselbund
 * erreicht Electron nicht: Apple gibt sie nur zugelassenen Browsern frei.
 */
function configurePasskeys(){
  const marker=join(process.resourcesPath,'webauthn.json');
  if(process.platform!=='darwin'||!existsSync(marker))return;
  try{const {keychainAccessGroup}=JSON.parse(readFileSync(marker,'utf8'));if(typeof keychainAccessGroup==='string'&&keychainAccessGroup)app.configureWebAuthn({touchID:{keychainAccessGroup,promptReason:'dich bei $1 mit deinem Passkey anzumelden'}});}
  catch(error){report(error);}
}
async function boot(){
  configurePasskeys();
  storage=createDesktopStorage({userDataPath:app.getPath('userData'),isolated:!!process.env.CORTEX_DATA_DIR,encryption:safeStorage});
  storage.onSettingsError(({message})=>report(message));
  protocol.handle('cortex-app',async request=>{
    try{const url=new URL(request.url);
      if(url.hostname==='view'){const panel=panelIds.get(url.pathname.slice(1));return new Response(panel?.webview.html||'Cortex wird geladen …',{status:panel?200:404,headers:{'Content-Type':'text/html; charset=utf-8'}});}
      if(url.hostname==='resource'){const {panel:id,path}=resourcePath(url);const panel=panelIds.get(id);const roots=[resourcesPath,shellRoot,...(panel?.webview.options?.localResourceRoots??[]).map((uri:any)=>uri.fsPath)];if(!panel||!allowedResource(path,roots))return new Response('Nicht freigegeben',{status:403});return net.fetch(pathToFileURL(path).toString());}
    }catch{return new Response('Ungültige Anfrage',{status:400});}return new Response('Nicht gefunden',{status:404});
  });
  mainWindow=createWindow();
  platform.configurePlatform({resourcesPath,window:mainWindow,storage,createPanel,executeBuiltin,builtinCommands:builtins,showEditor,sendShell,requestShell,createTerminal:(options:any)=>{const terminal=new DesktopTerminal(join(__dirname,'cortex-pty'),options??{},sendShell,platform.notifyTerminalClosed);terminals.set(terminal.id,terminal);return terminal;}});
  ipcMain.on('cortex:message',(event,message)=>{const panel=trusted(event);if(panel&&message&&typeof message.kind==='string'){if(message.kind==='ready')applicationReady=true;panel.receive.fire(message);}});
  ipcMain.on('cortex:shell-message',(event,message)=>{if(trusted(event))void shellMessage(message).catch(report);});
  ipcMain.on('cortex:drop',(event,paths)=>{const panel=trusted(event);if(panel&&Array.isArray(paths)){const valid=paths.filter(path=>typeof path==='string'&&existsSync(path));if(valid.length)panel.webview.postMessage({kind:'attachments',paths:valid});}});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'Cortex',submenu:[{role:'about'},{label:'Einstellungen …',accelerator:'CmdOrCtrl+,',click:()=>void executeBuiltin('workbench.action.openSettings').catch(report)},{type:'separator'},{role:'services'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{label:'Cortex beenden',accelerator:'CmdOrCtrl+Q',click:()=>mainWindow.close()}]},
    {label:'Ablage',submenu:[{label:'Neuer Chat',accelerator:'CmdOrCtrl+N',click:()=>void platform.commands.executeCommand('cortex.newConversation').catch(report)},{label:'Datei öffnen …',accelerator:'CmdOrCtrl+O',click:()=>void dialog.showOpenDialog(mainWindow,{properties:['openFile']}).then(result=>result.filePaths[0]&&platform.commands.executeCommand('vscode.open',platform.Uri.file(result.filePaths[0]))).catch(report)},{label:'Speichern',accelerator:'CmdOrCtrl+S',click:()=>void executeBuiltin('workbench.action.files.save').catch(report)},{label:'Neuer Browser-Tab',accelerator:'CmdOrCtrl+T',click:()=>void openBrowser('about:blank',true).catch(report)},{role:'close'}]},
    {label:'Bearbeiten',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'Ansicht',submenu:[{label:'Befehle …',accelerator:'CmdOrCtrl+Shift+P',click:()=>void executeBuiltin('workbench.action.showCommands').catch(report)},{label:'Terminal',accelerator:'CmdOrCtrl+J',click:()=>void platform.commands.executeCommand('cortex.showTerminal').catch(report)},{label:'Seitenleiste ein-/ausblenden',accelerator:'CmdOrCtrl+Alt+B',click:()=>void platform.commands.executeCommand('cortex.toggleDock').catch(report)},{type:'separator'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]},
    {label:'Fenster',submenu:[{role:'minimize'},{role:'zoom'},{role:'front'}]},
    {label:'Hilfe',submenu:[{label:'Über Cortex',click:()=>app.showAboutPanel()}]},
  ]));
  app.setAboutPanelOptions({applicationName:'Cortex',applicationVersion:app.getVersion(),version:'Eigenständige Mac-App',copyright:'Cortex · Open-Source-Hinweise im Anwendungspaket'});
  extensionContext=platform.createContext();activate(extensionContext);
  if(testing){
    const deadline=Date.now()+15000;
    const check=setInterval(()=>{if(rendererReady&&applicationReady&&hostRoundtrip&&primary?.webview.html&&context.has('cortex.chatToolsVisible')){clearInterval(check);console.log('CORTEX_STANDALONE_STARTUP_OK');quitting=true;app.quit();}else if(Date.now()>deadline){clearInterval(check);console.error('CORTEX_STANDALONE_STARTUP_TIMEOUT',{rendererReady,applicationReady,hostRoundtrip});app.exit(1);}},100);
  }
}
if(!app.requestSingleInstanceLock()){app.quit();}else{
  app.on('second-instance',()=>{mainWindow?.show();mainWindow?.focus();});
  app.on('activate',()=>{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.show();});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',event=>{if(!quitting&&mainWindow&&!mainWindow.isDestroyed()&&[...documents.values()].some(document=>document.isDirty)){event.preventDefault();mainWindow.close();return;}quitting=true;if(restartOnExit){restartOnExit=false;app.relaunch();}for(const terminal of terminals.values())terminal.dispose();for(const disposable of extensionContext?.subscriptions??[])try{disposable.dispose();}catch{}for(const resolve of requests.values())resolve(undefined);});
  // Panel teardown and canceled runs can still flush their final state while
  // windows close. Keep the atomic store available until Electron really exits.
  app.on('quit',()=>storage?.dispose());
  app.whenReady().then(()=>{if(testing)app.dock?.hide();return boot();}).catch(error=>{console.error(error);if(testing)app.exit(1);else{dialog.showErrorBox('Cortex konnte nicht starten',`${errorMessage(error)}\n\nDeine bisherigen Daten bleiben erhalten.`);app.quit();}});
}
