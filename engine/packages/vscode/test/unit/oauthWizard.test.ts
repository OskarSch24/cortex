import { describe, it, expect, vi, afterEach } from 'vitest';
import { addAccountWizard, respondToConnection } from '../../src/onboarding/addAccount.js';
import { vendorLogin, verifiedIdentity } from '../../src/onboarding/oauthProcess.js';
vi.mock('../../src/onboarding/oauthProcess.js', () => ({ vendorLogin: vi.fn(async()=>{}), verifiedIdentity: vi.fn(async()=>'work@example.com') }));
vi.mock('node:fs', async importOriginal => ({...await importOriginal<typeof import('node:fs')>(), mkdirSync: vi.fn()}));
const adapter = { displayName: 'Claude', managedLoginFlow: () => ({ terminalCommand: [process.execPath], env: {} }) };
const adapters = { get: () => adapter } as any;
const existing = { id:'a',provider:'claude',label:'privat',authMode:'managed-home',homeDir:'/existing/profile',hasSecret:false,priority:1,identity:'private@example.com',verifiedAt:123 };
function store(records:any[] = []) { return {all:()=>records,upsert:vi.fn(async()=>{})} as any; }
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();vi.mocked(verifiedIdentity).mockResolvedValue('work@example.com');});
describe('OAuth account commit',()=>{
 it('times a abandoned login out after three minutes without saving the account', async()=>{
  vi.useFakeTimers();
  vi.mocked(vendorLogin).mockImplementationOnce(async (_bin,_args,_profile,_env,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true})));
  const accounts=store(), progress=vi.fn();
  const run=addAccountWizard(accounts,adapters,{provider:'claude',label:'timeout',onProgress:progress});
  await vi.advanceTimersByTimeAsync(180000); await run;
  expect(accounts.upsert).not.toHaveBeenCalled();
  expect(progress).toHaveBeenLastCalledWith('error',expect.stringContaining('3 Minuten'));
 });
 it('stores the verified identity only after the user confirms it',async()=>{
  const accounts=store();
  await addAccountWizard(accounts,adapters,{provider:'claude',label:'business',email:'work@example.com',onProgress:(state,_text,detail)=>{
   if(state==='review') { expect(accounts.upsert).not.toHaveBeenCalled();expect(detail?.identity).toBe('work@example.com');respondToConnection('claude',detail!.attemptId!,true); }
  }});
  expect(accounts.upsert).toHaveBeenCalledWith(expect.objectContaining({identity:'work@example.com',hasSecret:false,disabled:false,verifiedAt:expect.any(Number)}));
 });
 it('requires an explicit choice for a mismatched identity',async()=>{
  const accounts=store();
  await addAccountWizard(accounts,adapters,{provider:'claude',label:'privat',email:'private@example.com',onProgress:(state,text,detail)=>{
   if(state==='review'){expect(text).toContain('Abweichende E-Mail');expect(text).toContain('private@example.com');respondToConnection('claude',detail!.attemptId!,false);}
  }});
  expect(accounts.upsert).not.toHaveBeenCalled();
  await addAccountWizard(accounts,adapters,{provider:'claude',label:'privat',email:'private@example.com',onProgress:(state,_text,detail)=>{if(state==='review')respondToConnection('claude',detail!.attemptId!,true);}});
  expect(accounts.upsert).toHaveBeenCalledWith(expect.objectContaining({identity:'work@example.com'}));
 });
 it('does not mark login without a verifiable identity as connected',async()=>{
  vi.mocked(verifiedIdentity).mockResolvedValue(undefined);const accounts=store();
  await addAccountWizard(accounts,adapters,{provider:'claude',label:'privat',onProgress:vi.fn()});expect(accounts.upsert).not.toHaveBeenCalled();
 });
 it('leaves the original profile intact when reconnect is rejected',async()=>{
  const accounts=store([existing]);
  await addAccountWizard(accounts,adapters,{provider:'claude',accountId:'a',onProgress:(state,_text,detail)=>{if(state==='review')respondToConnection('claude',detail!.attemptId!,false);}});
  expect(vendorLogin).toHaveBeenCalled();expect(accounts.upsert).not.toHaveBeenCalled();expect(accounts.all()[0].homeDir).toBe('/existing/profile');
 });
});
