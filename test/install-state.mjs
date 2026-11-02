// Installed-state failures in disposable homes, using the existing release adapter.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { release } from './engines/zsh.mjs';
import { mkdtempSync,mkdirSync,writeFileSync,symlinkSync,readFileSync,existsSync,lstatSync,cpSync,rmSync,readdirSync,readlinkSync } from 'node:fs';
import { spawn,spawnSync } from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const platformRun=mkdtempSync(root+'/test/.run-platform-');
const installer=readFileSync(root+'/installer/lib.zsh','utf8');
assert.equal(installer.split('$(/usr/bin/uname -s)').length,2);
for(const platform of ['Linux','Darwin']){
  const file=platformRun+'/'+platform+'.zsh';
  writeFileSync(file,installer.replace('$(/usr/bin/uname -s)',platform));
  for(const entry of ['ag_checkout_main','ag_install_main']){
    const result=spawnSync('/bin/zsh',['-fc',`
      setopt no_unset pipe_fail extended_glob
      source "$1"
      ag_init() { print ACCOUNT_LOOKUP; return 1; }
      "$2" fixture
    `,'platform',file,entry],{encoding:'utf8'});
    assert.equal(result.status,1,result.stderr);
    if(platform==='Linux'){
      assert.match(result.stderr,/macOS only/);
      assert.equal(result.stdout,'','unsupported platforms must stop before account lookup');
    }else{
      assert.equal(result.stderr,'');
      assert.equal(result.stdout,'ACCOUNT_LOOKUP\n');
    }
  }
}
console.log('ok installer platform: checkout and staged entry refuse before account lookup; Darwin reaches initialization');
if(process.argv.includes('--platform-only'))process.exit(0);
const run=mkdtempSync(root+'/test/.run-install-state-');
const home=run+'/home',served=run+'/served',bin=run+'/bin';
for(const p of [home+'/Projects/app',home+'/Documents',home+'/.local/bin',served,bin]) mkdirSync(p,{recursive:true});
const node=spawnSync('which',['node'],{encoding:'utf8'}).stdout.trim();
symlinkSync(node,bin+'/node');
writeFileSync(bin+'/opencode',`#!/bin/sh\nexec '${node}' '${root}/test/fake-opencode.mjs' "$@"\n`,{mode:0o755});
const pkg='lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js';
mkdirSync(home+'/.local/'+pkg.slice(0,pkg.lastIndexOf('/')),{recursive:true});
writeFileSync(home+'/.local/'+pkg,'#!/usr/bin/env node\nconsole.log("fake pi 0.70.0");\n',{mode:0o755});
symlinkSync('../'+pkg,home+'/.local/bin/pi');
const app=home+'/Applications/OpenCode.app/Contents';mkdirSync(app+'/MacOS',{recursive:true});
writeFileSync(app+'/Info.plist','<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>FakeOpenCodeApp</string></dict></plist>');
writeFileSync(app+'/MacOS/FakeOpenCodeApp',readFileSync(bin+'/opencode'),{mode:0o755});
const server=spawn(node,[root+'/test/release-server.mjs',served]);
let port='';for await(const chunk of server.stdout){port+=chunk; if(port.includes('\n'))break;}
const url=`http://127.0.0.1:${port.trim()}/ebrindley/AgentGuard`;
let checks=0;
const env={HOME:home,PATH:bin+':/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:'/private/tmp/'};
const engine=home+'/Library/Application Support/AgentGuard',stamp=engine+'/state/stamp.json';
const entry=engine+'/bin/agent-guard';
const saved=run+'/saved';
const present=p=>!!lstatSync(p,{throwIfNoEntry:false});
function command(file,args,name){
  const r=spawnSync(file,args,{env,encoding:'utf8',timeout:240000});
  writeFileSync(run+'/'+name+'.log',r.stdout+r.stderr);
  assert.equal(r.error,undefined,r.error?.message);
  return r;
}
function check(name,fn){fn();checks++;console.log('ok   '+name);}
function restore(){rmSync(home,{recursive:true,force:true});cpSync(saved,home,{recursive:true,dereference:false,verbatimSymlinks:true});}
// Include link targets and file bytes so a refused uninstall cannot discard recovery.
function snapshot(dir){
  return readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>{
    const p=dir+'/'+e.name,rel=p.slice(home.length);
    const st=lstatSync(p);
    if(st.isSymbolicLink()) return [rel+':'+spawnSync('/usr/bin/readlink',[p],{encoding:'utf8'}).stdout];
    if(st.isDirectory())return [rel+'/',...snapshot(p)];
    return [rel+':'+readFileSync(p).toString('base64')];
  });
}
try {
  release(root,served,{home,tag:'v0.0.1',version:'0.0.1',url});
  writeFileSync(served+'/latest.txt','v0.0.1\n');
  const bootstrap=readFileSync(served+'/v0.0.1/install.sh','utf8');
  check('install Pi over its npm entry',()=>{
    const r=command('/bin/zsh',['-fc',bootstrap,'install.sh','--projects',home+'/Projects'],'install-pi');
    assert.equal(r.status,0,r.stdout+r.stderr);
    assert.deepEqual(JSON.parse(readFileSync(stamp)).harnesses,['opencode','pi']);
    assert.ok(present(engine+'/state/legacy/replaced/pi'));
  });
  const valid=readFileSync(stamp,'utf8');cpSync(home,saved,{recursive:true,dereference:false,verbatimSymlinks:true});
  if(process.argv.includes('--uninstall') || process.argv.length===2){
    const bad=[['malformed','{ broken'],['wrong-type',JSON.stringify({...JSON.parse(valid),harnesses:'pi'})],
      ['empty-list',JSON.stringify({...JSON.parse(valid),harnesses:[]})],
      ['unknown',JSON.stringify({...JSON.parse(valid),harnesses:['opencode','unknown']})],
      ['missing-ownership',JSON.stringify({...JSON.parse(valid),version:'0.2.0',harnesses:undefined})],
      ['multiple-documents',valid+valid]];
    for(const [name,value]of bad){
      restore();writeFileSync(stamp,value);const before=snapshot(home);
      check('uninstall preserves state: '+name,()=>{
        const r=command(entry,['uninstall'],'uninstall-'+name);
        assert.notEqual(r.status,0);assert.match(r.stderr,/cannot identify installed harnesses/);
        assert.deepEqual(snapshot(home),before);
      });
    }
    restore();
    check('valid Pi uninstall restores the npm entry',()=>{
      const r=command(entry,['uninstall'],'uninstall-pi');
      assert.equal(r.status,0,r.stdout+r.stderr);
      assert.equal(lstatSync(home+'/.local/bin/pi').isSymbolicLink(),true);
      assert.equal(existsSync(engine),false);
    });
    // A separate OpenCode-only install models the legacy stamp's ownership.
    rmSync(home+'/.local/bin/pi');rmSync(home+'/.local/lib',{recursive:true});
    rmSync(home+'/.config/pi-sandbox-guard',{recursive:true,force:true});
    check('legacy 0.1.x stamp without a harness list uninstalls',()=>{
      const installed=command('/bin/zsh',['-fc',bootstrap,'install.sh','--projects',home+'/Projects'],'install-opencode');
      assert.equal(installed.status,0,installed.stdout+installed.stderr);
      const legacy=JSON.parse(readFileSync(stamp));assert.deepEqual(legacy.harnesses,['opencode']);
      delete legacy.harnesses;legacy.version='0.1.2';writeFileSync(stamp,JSON.stringify(legacy));
      const uninstalled=command(entry,['uninstall'],'uninstall-legacy');
      assert.equal(uninstalled.status,0,uninstalled.stdout+uninstalled.stderr);
      assert.equal(existsSync(engine),false);
    });
  }
  if(process.argv.includes('--update') || process.argv.length===2){
    restore();
    check('same-version detection error is reported',()=>{
      writeFileSync(engine+'/state/migration.json','{ broken');
      const r=command(entry,['update'],'update-detection');
      assert.notEqual(r.status,0);assert.match(r.stderr,/cannot read .*migration.json/);
      assert.doesNotMatch(r.stdout,/is current/);assert.equal(existsSync(engine+'/state/txn'),false);
    });
    restore();
    check('same-version update without pending work succeeds',()=>{
      const r=command(entry,['update'],'update-current');assert.equal(r.status,0);assert.match(r.stdout,/is current/);
    });
    restore();
    check('deferred edit restoration does not reinstall on repeated updates',()=>{
      const config=home+'/.config/opencode/opencode.json',ledger=engine+'/state/permissions.json';
      const settings=JSON.parse(readFileSync(config));settings.permission.edit='allow';writeFileSync(config,JSON.stringify(settings));
      const ownership=JSON.parse(readFileSync(ledger));ownership[config].edit={orig:'ask',wrote:'allow'};writeFileSync(ledger,JSON.stringify(ownership));
      const beforeConfig=readFileSync(config,'utf8'),beforeLedger=readFileSync(ledger,'utf8'),beforeRelease=readlinkSync(engine+'/current');
      for(const suffix of ['first','second']){
        const r=command(entry,['update'],'update-deferred-'+suffix);assert.equal(r.status,0,r.stdout+r.stderr);
        assert.match(r.stdout,/is current; checking/);assert.doesNotMatch(r.stdout,/installing it again/);
        assert.equal(readlinkSync(engine+'/current'),beforeRelease);
        assert.equal(readFileSync(config,'utf8'),beforeConfig);assert.equal(readFileSync(ledger,'utf8'),beforeLedger);
        assert.equal(existsSync(engine+'/state/txn'),false);
      }
    });
    for(const args of [['--restore-edit-permissions'],['--approval-preference','auto']]){
      restore();
      check('newer installed release refuses explicit setup: '+args[0],()=>{
        const newer={...JSON.parse(readFileSync(stamp)),tag:'v9.9.9'};writeFileSync(stamp,JSON.stringify(newer));
        const before=readFileSync(stamp,'utf8');
        const r=command(entry,['update',...args],'update-newer-'+args[0].slice(2));
        assert.notEqual(r.status,0);assert.match(r.stderr,/requested setup options require the installer for v9\.9\.9/);
        assert.doesNotMatch(r.stdout,/checking the installation|installing it again/);
        assert.equal(readFileSync(stamp,'utf8'),before);assert.equal(existsSync(engine+'/state/txn'),false);
      });
    }
  }
  if(process.argv.includes('--update-recovery') || process.argv.length===2){
    restore();
    check('current-version checks use the surviving release after recovery',()=>{
      const active=engine+'/'+readlinkSync(engine+'/current');
      const candidate=engine+'/releases/0.0.1-20990101T000000Z';
      cpSync(active,candidate,{recursive:true,dereference:false,verbatimSymlinks:true});
      const q=s=>"'"+s.replaceAll("'","'\\''")+"'";
      const lib=candidate+'/installer/lib.zsh';
      writeFileSync(lib,readFileSync(lib,'utf8')+`\nag_recover() { /bin/mv ${q(candidate)} ${q(run+'/recovered-candidate')}; }\n`);
      const r=command(candidate+'/bin/agent-guard',['update'],'update-recovered-release');
      assert.equal(r.status,0,r.stdout+r.stderr);
      assert.match(r.stdout,/is current; checking/);
      assert.ok(!existsSync(candidate));
      assert.doesNotMatch(r.stderr,/cannot load|no such file/);
    });
  }
  console.log(`${checks} checks, 0 failures; ${run}`);
} finally {server.kill();}
