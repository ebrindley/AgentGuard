// Installed-state failures in disposable homes, using the existing release adapter.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { release } from './engines/zsh.mjs';
import { mkdtempSync,mkdirSync,writeFileSync,symlinkSync,readFileSync,existsSync,lstatSync,cpSync,rmSync,readdirSync } from 'node:fs';
import { spawn,spawnSync } from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
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
    assert.equal(command('/bin/zsh',['-fc',bootstrap,'install.sh','--projects',home+'/Projects'],'install-pi').status,0);
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
      assert.equal(command(entry,['uninstall'],'uninstall-pi').status,0);
      assert.equal(lstatSync(home+'/.local/bin/pi').isSymbolicLink(),true);
      assert.equal(existsSync(engine),false);
    });
    // A separate OpenCode-only install models the legacy stamp's ownership.
    rmSync(home+'/.local/bin/pi');rmSync(home+'/.local/lib',{recursive:true});
    rmSync(home+'/.config/pi-sandbox-guard',{recursive:true,force:true});
    check('legacy 0.1.x stamp without a harness list uninstalls',()=>{
      assert.equal(command('/bin/zsh',['-fc',bootstrap,'install.sh','--projects',home+'/Projects'],'install-opencode').status,0);
      const legacy=JSON.parse(readFileSync(stamp));assert.deepEqual(legacy.harnesses,['opencode']);
      delete legacy.harnesses;legacy.version='0.1.2';writeFileSync(stamp,JSON.stringify(legacy));
      assert.equal(command(entry,['uninstall'],'uninstall-legacy').status,0);
      assert.equal(existsSync(engine),false);
    });
  }
  console.log(`${checks} checks, 0 failures; ${run}`);
} finally {server.kill();}
