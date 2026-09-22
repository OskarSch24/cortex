import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { StringDecoder } from 'node:string_decoder';

export class DesktopTerminal {
  readonly id = randomUUID(); readonly name: string; readonly creationOptions: any;
  readonly processId: Promise<number>; exitStatus?: { code: number }; state = { isInteractedWith: false };
  private child; private output = ''; private closed = false; private disposing = false;
  private readonly decoder = new StringDecoder('utf8');
  private terminateTimer?: NodeJS.Timeout; private killTimer?: NodeJS.Timeout;
  constructor(helper: string, options: any, private emit: (event: any) => void, private ended: (terminal: DesktopTerminal) => void) {
    this.creationOptions = options; this.name = options.name || 'Terminal';
    const cwd = typeof options.cwd === 'string' ? options.cwd : options.cwd?.fsPath ?? homedir();
    const shell = options.shellPath ?? process.env.SHELL ?? '/bin/zsh';
    if (!existsSync(helper) || !existsSync(shell)) throw new Error('Der Terminal-Helfer oder die ausgewählte Shell fehlt.');
    const environment: NodeJS.ProcessEnv = { ...process.env };
    // Account terminals deliberately remove conflicting provider credentials.
    // Node would otherwise stringify a VS Code-compatible null override.
    for(const [key,value] of Object.entries(options.env??{})) {
      if(value===null)delete environment[key];else if(typeof value==='string')environment[key]=value;
    }
    environment.TERM_PROGRAM='Cortex';
    this.child = spawn(helper, [cwd, shell, ...(options.shellArgs ?? [])], { env: environment, stdio: ['pipe','pipe','pipe'] });
    this.processId = Promise.resolve(this.child.pid!);
    this.child.stdout.on('data', data => { const text=this.decoder.write(data); if(text){this.output = (this.output + text).slice(-2_000_000); this.emit({type:'terminal-data',id:this.id,data:text});} });
    this.child.stderr.on('data', data => this.emit({type:'terminal-data',id:this.id,data:data.toString()}));
    this.child.on('error', error => this.emit({type:'shell-error',message:`Terminal: ${error.message}`}));
    this.child.on('close', code => { const tail=this.decoder.end();if(tail){this.output=(this.output+tail).slice(-2_000_000);this.emit({type:'terminal-data',id:this.id,data:tail});}this.closed=true;clearTimeout(this.terminateTimer);clearTimeout(this.killTimer);this.exitStatus={code:code??1}; this.emit({type:'terminal-exit',id:this.id,code}); this.ended(this); });
    this.child.stdin.on('error', () => {});
  }
  snapshot() { return {type:'terminal-open',id:this.id,name:this.name,cwd:typeof this.creationOptions.cwd==='string'?this.creationOptions.cwd:this.creationOptions.cwd?.fsPath,buffer:this.output}; }
  show(_preserveFocus?: boolean) { this.emit(this.snapshot()); }
  hide() { this.emit({type:'terminal-hide',id:this.id}); }
  sendText(text: string, addNewLine = true) { this.input(text + (addNewLine ? '\r' : '')); }
  input(data: string) { this.state.isInteractedWith = true; this.frame('I',Buffer.from(data)); }
  resize(cols: number, rows: number) { const data=Buffer.alloc(4);data.writeUInt16BE(Math.max(2,Math.min(1000,cols)),0);data.writeUInt16BE(Math.max(1,Math.min(1000,rows)),2);this.frame('R',data); }
  private frame(kind: string, data: Buffer) { if(this.closed||!this.child.stdin.writable)return;const head=Buffer.alloc(5);head.write(kind);head.writeUInt32BE(data.length,1);this.child.stdin.write(Buffer.concat([head,data])); }
  dispose() {
    if(this.closed||this.disposing)return;this.disposing=true;
    this.frame('Q',Buffer.alloc(0));this.child.stdin.end();
    // The native helper reaps the shell and escalates its process group itself.
    // SIGTERM also interrupts a blocked PTY write; only a broken helper needs KILL.
    this.terminateTimer=setTimeout(()=>{if(!this.closed)this.child.kill('SIGTERM');},1500);this.terminateTimer.unref();
    this.killTimer=setTimeout(()=>{if(!this.closed)this.child.kill('SIGKILL');},3500);this.killTimer.unref();
    this.emit({type:'terminal-closed',id:this.id});
  }
}
