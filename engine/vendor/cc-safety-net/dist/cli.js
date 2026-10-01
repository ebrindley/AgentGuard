import{a,s,ke,Ue,k,Ze,Ge,c,o,He,R,L,ve,Qe,f,We,d,r,v,i,re,n,g,le,F,tt,nt,l,ue,de,rt,I,K,oe,S,ot,M,b,Se,j,u,J,Be,ze,O,w,T,pe,fe,Le,it,m,e,Te,we,Ve,qe,ie,Ce,se,_e,Y,U,Pe,me,G,Ke,H,Z,X,ae,Je,Ye,C,W,Ae,Oe,De,E,Ne,Ee,Fe,h,t,Q,ge,y,x,_,st,Me,$e,p,B}from"./chunks/index-qbhpx1zs.js";import{te,z,je,D,N}from"./chunks/index-jb96wweh.js";var Zd=["-h","--help"];function xt(P,A){let q=Object.entries(P.booleans??{}),V=Object.entries(P.values??{}),ee=Object.entries(P.lists??{}),ne=Object.fromEntries(q.map(([Xe])=>[Xe,!1])),ce={},he=Object.fromEntries(ee.map(([Xe])=>[Xe,[]])),ye=[],be=[],xe=!1,Ie=-1;for(let[Xe,et]of A.entries()){if(Xe<=Ie)continue;if(et==="--"){ye.push(...A.slice(Xe+1));break}if(Zd.includes(et)){xe=!0;continue}let Re=q.find(([,lt])=>lt.includes(et));if(Re){ne[Re[0]]=!0;continue}let at=V.find(([,lt])=>lt.includes(et));if(at){let lt=A[Xe+1];if(lt===void 0||lt.startsWith("-")){be.push(`${et} requires a value`);continue}ce[at[0]]=lt,Ie=Xe+1;continue}let ct=ee.find(([,lt])=>lt.includes(et));if(ct){let lt=A.slice(Xe+1),ft=lt.findIndex((gt)=>gt.startsWith("-")),mt=lt.slice(0,ft===-1?lt.length:ft);if(mt.length===0){be.push(`${et} requires at least one value`);continue}he[ct[0]]=[...he[ct[0]]??[],...mt],Ie=Xe+mt.length;continue}if(et.startsWith("-")){be.push(`Unknown option for ${P.label}: ${et}`);continue}if(P.positionals==="tail"){ye.push(...A.slice(Xe));break}ye.push(et)}if(P.positionals!=="list"&&P.positionals!=="tail")be.push(...ye.map((Xe)=>`Unexpected argument for ${P.label}: ${Xe}`));return{flags:ne,values:ce,lists:he,positionals:ye,help:xe,errors:be}}function Ut(P){for(let A of P)console.error(A);return P.length>0}import{readdirSync as iu,statSync as Vi,unlinkSync as su}from"node:fs";import{basename as zi,dirname as au,isAbsolute as lu,join as cu,relative as du,resolve as uu,sep as pu}from"node:path";var Gi=(P)=>{let A=Date.now()-new Date(P).getTime();if(!Number.isFinite(A))return"";let q=Math.floor(A/60000),V=Math.floor(q/60),ee=Math.floor(V/24);if(ee>0)return`${ee}d ago`;if(V>0)return`${V}h ago`;if(q>0)return`${q}m ago`;return"just now"},so=(P)=>{let A=(P??"").trim().split(/\s+/).filter((ee)=>ee&&!/^[A-Za-z_][A-Za-z0-9_]*=/.test(ee)),q=A[0]?.split("/").pop();if(!q)return null;let V=A[1];return V&&/^[a-z][a-z0-9-]*$/.test(V)?`${q} ${V}`:q};function Bi(P){let A=(ee)=>`${ee.sessionId}
${so(ee.segment||ee.command)}`,q=P.filter((ee)=>ee.decision!=="allow"),V=q.filter((ee)=>ee.sessionId).reduce((ee,ne)=>ee.set(A(ne),(ee.get(A(ne))??0)+1),new Map);return new Set(q.filter((ee)=>ee.failureStage||(V.get(A(ee))??0)>=2))}import{existsSync as Qd,readdirSync as eu,readFileSync as tu}from"node:fs";import{join as nu}from"node:path";function Xt(P,A){try{return eu(P,{withFileTypes:!0,encoding:"utf8"}).flatMap((q)=>{let V=nu(P,q.name);if(q.isDirectory())return Xt(V,A);if(q.name.endsWith(".jsonl"))return[V];return[]})}catch{if(A&&Qd(P))A.count++;return[]}}var ru=["segment","reason","sessionId","decision","agent","ruleId","failureStage"];function ou(P){if(!P||typeof P!=="object"||Array.isArray(P))return!1;let A=P;if(typeof A.ts!=="string"||typeof A.command!=="string")return!1;return ru.every((q)=>A[q]===void 0||typeof A[q]==="string")}function mn(P,A){try{return tu(P,"utf-8").split(`
`).filter(Boolean).flatMap((q)=>{try{let V=JSON.parse(q);if(!ou(V)){if(A)A.count++;return[]}return[V]}catch{if(A)A.count++;return[]}})}catch{if(A)A.count++;return[]}}function Ct(P){return Array.from(P,(A)=>{let q=A.charCodeAt(0);if(q<=31||q>=127&&q<=159)return`\\x${q.toString(16).padStart(2,"0")}`;return A}).join("")}function fu(P,A){let q=te(P),V=xt({label:"logs",booleans:{all:["--all"],suspect:["--suspect"],json:["--json"],pruneLegacy:["--prune-legacy"],dryRun:["--dry-run"]},values:{id:["--id"],limit:["--limit"],since:["--since"],agent:["--agent"],rule:["--rule"],session:["--session"],project:["--project"]}},A);if(Ut(V.errors))return null;if(V.values.id!==void 0&&!/^[a-f0-9]{16}$/.test(V.values.id))return console.error("--id must be 16 hexadecimal characters"),null;let ee=V.values.limit===void 0?20:qi(V.values.limit);if(ee===null)return console.error("--limit must be a positive number"),null;let ne=V.values.since===void 0?Math.min(30,q):qi(V.values.since);if(ne===null||ne>q)return console.error(`--since must be a positive number of days no greater than ${q}`),null;let ce={limit:ee,limitExplicit:V.values.limit!==void 0,since:ne,sinceExplicit:V.values.since!==void 0,all:V.flags.all,json:V.flags.json,suspect:V.flags.suspect,pruneLegacy:V.flags.pruneLegacy,dryRun:V.flags.dryRun,id:V.values.id,agent:V.values.agent,rule:V.values.rule,session:V.values.session,project:V.values.project===void 0?void 0:uu(V.values.project)};if(ce.id&&(ce.agent!==void 0||ce.rule!==void 0||ce.session!==void 0||ce.project!==void 0||ce.suspect||ce.sinceExplicit||ce.limitExplicit))return console.error("--id cannot be combined with --agent, --rule, --session, --project, --suspect, --since, or --limit"),null;if(ce.pruneLegacy&&(ce.id!==void 0||ce.agent!==void 0||ce.rule!==void 0||ce.session!==void 0||ce.project!==void 0||ce.suspect||ce.all||ce.sinceExplicit||ce.limitExplicit))return console.error("--prune-legacy cannot be combined with --id, --agent, --rule, --session, --project, --suspect, --all, --since, or --limit"),null;if(ce.dryRun&&!ce.pruneLegacy)return console.error("--dry-run requires --prune-legacy"),null;return ce}async function Ji(P,A,q={}){let V=fu(P,A);if(!V)return 1;let ee=q.logsDir??D(P);if(V.pruneLegacy)return mu(ee,V.json,V.dryRun);if(!ee)return console.log(V.json?"[]":V.id?`No retained audit log entry found for id ${Ct(V.id)}.`:"No audit log entries found."),0;z(P,ee);let ne={count:0},ce=Xt(ee,ne).flatMap((Ie)=>mn(Ie,ne).map((Xe)=>({entry:Xe,file:Ie})));if(ne.count>0)console.error(`warning: ${ne.count} audit log ${ne.count===1?"source":"sources"} could not be read; these results are incomplete`);if(V.id)return vu(ce,V,q.timeZone);let he=Date.now()-V.since*24*60*60*1000,ye=ce.filter((Ie)=>bu(Ie,V,ee,he)),be=V.suspect?Bi(ye.map((Ie)=>Ie.entry)):null,xe=(be?ye.filter((Ie)=>be.has(Ie.entry)):ye).sort((Ie,Xe)=>Date.parse(Xe.entry.ts)-Date.parse(Ie.entry.ts)).slice(0,V.limit);if(V.json)return console.log(JSON.stringify(xe.map((Ie)=>Ie.entry),null,2)),0;if(xe.length===0)return console.log("No audit log entries found."),0;for(let Ie of xe)console.log(ku(Ie.entry,q.timeZone));return 0}function mu(P,A,q){let V=P?hu(P).map((he)=>cu(P,he)):[];if(q)return gu(V,A);let ee=[],ne=0,ce=0;for(let he of V){let ye=Vi(he,{throwIfNoEntry:!1})?.size??0,be=yu(he);if(be){ee.push(`${zi(he)}: ${be}`);continue}ne++,ce+=ye}if(A)return console.log(JSON.stringify({removedFiles:ne,removedBytes:ce,failedFiles:ee.length})),ee.length===0?0:1;console.log(ne===0&&ee.length===0?"No legacy audit log files found.":`Removed ${ne} legacy audit log ${ne===1?"file":"files"} (${Wi(ce)}).`);for(let he of ee)console.error(`Could not remove ${Ct(he)}`);if(console.log("Nested v2 audit logs were not changed."),ne>0)console.log("This deletion cannot be undone.");return ee.length===0?0:1}function gu(P,A){let q=P.reduce((V,ee)=>V+(Vi(ee,{throwIfNoEntry:!1})?.size??0),0);if(A)return console.log(JSON.stringify({dryRun:!0,files:P.length,bytes:q})),0;if(console.log(P.length===0?"No legacy audit log files found.":`Would remove ${P.length} legacy audit log ${P.length===1?"file":"files"} (${Wi(q)}).`),console.log("Nested v2 audit logs are not included."),P.length>0)console.log("Run the same command without --dry-run to delete them.");return 0}function hu(P){try{return iu(P,{withFileTypes:!0}).filter((A)=>A.isFile()&&A.name.endsWith(".jsonl")).map((A)=>A.name)}catch{return[]}}function yu(P){try{return su(P),null}catch(A){return A instanceof Error?A.message:String(A)}}function Wi(P){let A=["B","KiB","MiB","GiB"],q=Math.min(Math.floor(Math.log2(Math.max(P,1))/10),A.length-1);return`${Math.round(P/1024**q*10)/10} ${A[q]}`}function vu(P,A,q){let V=P.filter((ne)=>ne.entry.id===A.id);if(V.length>1)return console.error(`Multiple audit log entries found for id ${Ct(A.id??"")}.`),1;if(A.json)return console.log(JSON.stringify(V.map((ne)=>ne.entry),null,2)),0;let ee=V[0];if(!ee)return console.log(`No retained audit log entry found for id ${Ct(A.id??"")}.`),0;return console.log(xu(ee.entry,q)),0}function bu(P,A,q,V){if(!A.all&&P.entry.decision==="allow")return!1;if(Date.parse(P.entry.ts)<V)return!1;if(A.agent!==void 0&&P.entry.agent!==A.agent)return!1;if(A.rule!==void 0&&P.entry.ruleId!==A.rule)return!1;if(A.session!==void 0&&!Lu(P,q,A.session))return!1;if(A.project!==void 0&&!wu(P.entry.cwd,A.project))return!1;return!0}function Lu(P,A,q){if(P.entry.sessionId===q)return!0;return au(P.file)===A&&zi(P.file,".jsonl")===q}function wu(P,A){if(!P)return!1;let q=du(A,P);return q!==".."&&!q.startsWith(`..${pu}`)&&!lu(q)}function ku(P,A){let q=Ct(P.id??"-"),V=Ct(P.decision??"deny"),ee=P.cwd?`  [${Ct(P.cwd)}]`:"",ne=P.segment||P.command,ce=ne===P.command?"":"↳ ",he=ne.length>50?`${ne.slice(0,50)}…`:ne;return`${q.padEnd(16)}  ${Ct(Ki(P.ts,A))}  ${V.padEnd(5)}  ${Ct(P.agent??"-").padEnd(15)}  ${Ct(P.ruleId??"-").padEnd(20)}  ${ce}${Ct(he)}${ee}`}function xu(P,A){let q=(ee)=>Ct(ee===void 0||ee===null||ee===""?"-":ee),V=P.shape?`${P.agent??"-"} (shape: ${P.shape})`:P.agent??"-";return[`id:        ${q(P.id)}`,`ts:        ${q(Ki(P.ts,A))}`,`decision:  ${q(P.decision)}`,`agent:     ${q(V)}`,`level:     ${q(P.level)}`,`tool:      ${q(P.toolName)}`,`rule:      ${q(P.ruleId)}`,`intent:    ${q(P.intent)}`,`stage:     ${q(P.failureStage)}`,`error:     ${q(P.errorCode)}`,`session:   ${q(P.sessionId)}`,`cwd:       ${q(P.cwd)}`,`version:   ${q(P.v)}`,`truncated: ${q(P.truncated===!0?"yes":void 0)}`,`reason:    ${q(P.reason)}`,`command:   ${q(P.command)}`,`segment:   ${q(P.segment)}`].join(`
`)}function Ki(P,A){let q=new Date(P);if(Number.isNaN(q.getTime()))return P;return new Intl.DateTimeFormat("sv-SE",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23",timeZone:A}).format(q)}function qi(P){let A=Number(P);return Number.isFinite(A)&&A>0?A:null}var Yi={name:"doctor",aliases:["--doctor"],description:"Run diagnostic checks to verify installation and configuration",usage:"doctor [options]",options:[{flags:"--json",description:"Output diagnostics as JSON"},{flags:"--skip-update-check",description:"Skip npm registry version check"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net doctor","cc-safety-net doctor --json","cc-safety-net doctor --skip-update-check"]};var Xi={name:"explain",description:"Show step-by-step analysis trace of how a command would be analyzed",usage:"explain [options] <command>",argument:"<command>",options:[{flags:"--json",description:"Output analysis as JSON"},{flags:"--cwd",argument:"<path>",description:"Use custom working directory"},{flags:"-h, --help",description:"Show this help"}],examples:['cc-safety-net explain "git reset --hard"','cc-safety-net explain --json "rm -rf /"','cc-safety-net explain --cwd /tmp "git status"']};var Zi={name:"gui",description:"Open the local policy editor GUI",usage:"gui [options]",options:[{flags:"--no-open",description:"Print the URL without opening a browser"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net gui","cc-safety-net gui --no-open"]};var nr=[{id:"antigravity-cli",displayName:"Antigravity CLI",doctorOrder:3,runtime:{order:1,flags:["-ac","--agy-cli"],description:"Run as Antigravity CLI PreToolUse hook",legacyTopLevelFlags:[]},install:{order:2,flag:"--agy-cli",artifactKind:"hook config",probeCommand:["agy","--version"]}},{id:"claude-code",displayName:"Claude Code",doctorOrder:1,runtime:{order:2,displayName:"Coding CLI",flags:["-cc","--coding-cli"],legacyFlags:["--claude-code"],description:"Run as Coding CLI PreToolUse hook",legacyTopLevelFlags:["-cc","--claude-code"]},install:{order:3,flag:"--claude-code",artifactKind:"plugin",probeCommand:["claude","--version"]}},{id:"codex",displayName:"Codex",doctorOrder:4,runtime:{order:3,flags:["-cx","--codex"],description:"Run as a Codex PreToolUse hook",legacyTopLevelFlags:[]},install:{order:4,flag:"--codex",artifactKind:"plugin",probeCommand:["codex","--version"]}},{id:"copilot-cli",displayName:"GitHub Copilot CLI",doctorOrder:7,runtime:{order:6,flags:["-cp","--copilot-cli"],description:"Run as GitHub Copilot CLI PreToolUse hook",legacyTopLevelFlags:["-cp","--copilot-cli"]},install:{order:7,flag:"--copilot-cli",artifactKind:"plugin",probeCommand:["copilot","--binary-version"]}},{id:"gemini-cli",displayName:"Gemini CLI",doctorOrder:6,runtime:{order:5,flags:["-gc","--gemini-cli"],description:"Run as Gemini CLI BeforeTool hook",legacyTopLevelFlags:["-gc","--gemini-cli"]},install:{order:6,flag:"--gemini-cli",artifactKind:"extension",probeCommand:["gemini","--version"]}},{id:"grok-build",displayName:"Grok Build",doctorOrder:8,runtime:{order:7,flags:["-gb","--grok-build"],description:"Run as Grok Build PreToolUse hook",legacyTopLevelFlags:[]},install:{order:8,flag:"--grok-build",artifactKind:"hook config",probeCommand:["grok","--version"]}},{id:"hermes-agent",displayName:"Hermes Agent",doctorOrder:9,runtime:{order:8,flags:["-ha","--hermes-agent"],description:"Run as Hermes Agent pre_tool_call hook",legacyTopLevelFlags:[]},install:{order:9,flag:"--hermes-agent",artifactKind:"plugin",probeCommand:["hermes","--version"]}},{id:"kimi-code",displayName:"Kimi Code",doctorOrder:10,runtime:{order:9,flags:["-kc","--kimi-code"],description:"Run as Kimi Code PreToolUse hook",legacyTopLevelFlags:[]},install:{order:10,flag:"--kimi-code",artifactKind:"hook config",probeCommand:["kimi","--version"]}},{id:"openclaw",displayName:"OpenClaw",doctorOrder:11,install:{order:11,flag:"--openclaw",artifactKind:"plugin",probeCommand:["openclaw","--version"]}},{id:"opencode",displayName:"OpenCode",doctorOrder:12,install:{order:12,flag:"--opencode",artifactKind:"plugin",probeCommand:["opencode","--version"]}},{id:"pi",displayName:"Pi",doctorOrder:13,install:{order:13,flag:"--pi",artifactKind:"package",probeCommand:["pi","--version"]}},{id:"cursor",displayName:"Cursor",doctorOrder:5,runtime:{order:4,flags:["-cu","--cursor"],description:"Run as Cursor preToolUse hook",legacyTopLevelFlags:[]},install:{order:5,flag:"--cursor",artifactKind:"hook config",probeCommand:["cursor","--version"]}},{id:"amp",displayName:"Amp Code",doctorOrder:2,install:{order:1,flag:"--amp",artifactKind:"plugin",probeCommand:["amp","--version"]}}],rr=nr.slice().sort((P,A)=>P.doctorOrder-A.doctorOrder).map((P)=>P.id),En=nr.filter((P)=>("runtime"in P)).slice().sort((P,A)=>P.runtime.order-A.runtime.order).map((P)=>({id:P.id,displayName:"displayName"in P.runtime?P.runtime.displayName:P.displayName,flags:P.runtime.flags,legacyFlags:"legacyFlags"in P.runtime?P.runtime.legacyFlags:[],description:P.runtime.description,legacyTopLevelFlags:P.runtime.legacyTopLevelFlags})),$t=nr.slice().sort((P,A)=>P.install.order-A.install.order).map((P)=>({id:P.id,...P.install})).map(({order:P,...A})=>A),Cu=Object.fromEntries(nr.map((P)=>[P.id,P.displayName]));function bt(P){return Cu[P]}var Su=En.map((P)=>({flags:P.flags.join(", "),description:P.description})),Ru=En.flatMap((P)=>P.flags.map((A)=>`cc-safety-net hook ${A}`)),Qi={name:"hook",description:"Run as an agent CLI hook (reads JSON from stdin)",usage:"hook INTEGRATION_FLAG",options:[...Su,{flags:"-h, --help",description:"Show this help"}],examples:Ru};var es={name:"install",description:"Install CC Safety Net into a coding agent CLI",usage:"install [TARGET_FLAG]",options:[...$t.map((P)=>({flags:P.flag,description:`Install ${bt(P.id)} ${P.artifactKind}`})),{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net install",...$t.map((P)=>`cc-safety-net install ${P.flag}`)]},ts={name:"uninstall",description:"Uninstall CC Safety Net from a coding agent CLI",usage:"uninstall [TARGET_FLAG]",options:[...$t.map((P)=>({flags:P.flag,description:`Uninstall ${bt(P.id)} ${P.artifactKind}`})),{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net uninstall",...$t.map((P)=>`cc-safety-net uninstall ${P.flag}`)]},ns={name:"update",description:"Update every installed CC Safety Net integration to the latest version",usage:"update",options:[{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net update"]};var rs={name:"logs",description:"Browse audit log entries recorded by hooks",usage:"logs [options]",options:[{flags:"--id",argument:"<id>",description:"Show one entry from retained history by its 16-character id (not guaranteed once it is older than the configured retention)"},{flags:"--limit",argument:"<n>",description:"Maximum entries to print",default:"20"},{flags:"--since",argument:"<days>",description:"Only include entries newer than this many days (max: the configured audit retention, 1-365)",default:"30"},{flags:"--agent",argument:"<name>",description:"Filter by agent name"},{flags:"--rule",argument:"<ruleId>",description:"Filter by rule id"},{flags:"--session",argument:"<id>",description:"Filter by session id"},{flags:"--project",argument:"<path>",description:"Filter by project path"},{flags:"--suspect",description:"Only denials that look like false positives"},{flags:"--all",description:"Include allow entries"},{flags:"--prune-legacy",description:"Permanently delete all legacy root-level logs; nested logs are untouched"},{flags:"--dry-run",description:"With --prune-legacy, report what would be deleted and delete nothing"},{flags:"--json",description:"Output entries as JSON"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net logs --id 3fa9c2d1a70e8b42","cc-safety-net logs --agent claude-code","cc-safety-net logs --project . --since 7","cc-safety-net logs --suspect --since 7","cc-safety-net logs --json","cc-safety-net logs --prune-legacy --dry-run","cc-safety-net logs --prune-legacy"]};var or={name:"policy",description:"Check and apply project or user policy proposals",usage:"policy <subcommand>",subcommands:[{usage:"check <file>",description:"Validate a policy proposal and print its diff"},{usage:"apply <file>",description:"Apply a proposal after confirming in a terminal"}],options:[{flags:"-g, --global",description:"Use the user-scope policy instead of the project one"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net policy check proposal.json","cc-safety-net policy apply proposal.json","cc-safety-net policy apply proposal.json --global"]};var ao=[{flags:"--ref",argument:"<ref>",description:"Use a branch, tag, or commit"},{flags:"--only",argument:"<rulebook...>",description:"Add only these repository rulebooks"},{flags:"-g, --global",description:"Use user-scope rule config"},{flags:"-h, --help",description:"Show this help"}],lo=["cc-safety-net rule add project-rules","cc-safety-net rule add acme/safety-rules","cc-safety-net rule add acme/safety-rules --only aws gcloud","cc-safety-net rule add acme/safety-rules --ref v2 --only aws","cc-safety-net rule add --only terraform aws"],gn={name:"rule",description:"Manage CC Safety Net rule config and rulebook sources",usage:"rule <subcommand>",subcommands:[{usage:"init [--example]",description:"Create inert rule config"},{usage:"add [source] [--ref <ref>] [--only <rulebook...>]",description:"Add rulebook sources and sync"},{usage:"remove <source>",description:"Remove a rulebook source and sync"},{usage:"update [source]",description:"Re-fetch and vendor remote rulebooks"},{usage:"sync",description:"Deprecated: migrate lock and cache leftovers"},{usage:"list",description:"List active rulebooks"},{usage:"wrapper add <command>",description:"Trust a transparent command wrapper"},{usage:"wrapper remove <command>",description:"Remove a transparent command wrapper"},{usage:"wrapper list",description:"List transparent command wrappers"},{usage:"migrate [--cleanup]",description:"Migrate legacy inline rules"},{usage:"doc",description:"Print the rulebook authoring guide"},{usage:"verify",description:"Validate rule config files"}],options:[{flags:"-g, --global",description:"Use user-scope rule config"},{flags:"--cleanup",description:"Delete legacy files after rule migrate verifies them"},{flags:"--delete-source",description:"Delete clean local source directory on remove"},{flags:"--example",description:"Create an inactive example rulebook with rule init"},...ao.slice(0,2),{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net rule init","cc-safety-net rule init --example","cc-safety-net rule wrapper add rtk",...lo,"cc-safety-net rule update","cc-safety-net rule migrate --cleanup","cc-safety-net rule verify"]};var os={name:"status",description:"Show what the runtime is enforcing right now",usage:"status",options:[{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net status"]};var is={name:"statusline",description:"Print status line with mode indicators for shell integration",usage:"statusline --claude-code",options:[{flags:"-cc, --claude-code",description:"Print status line for Claude Code"},{flags:"-h, --help",description:"Show this help"}],examples:["cc-safety-net statusline -cc","cc-safety-net statusline --claude-code"]};var ir=[os,Yi,rs,Xi,gn,or,es,ns,ts,Qi,Zi,is];function Pu(P){return P.aliases??[]}function sr(P){let A=P.toLowerCase();return ir.find((q)=>q.name.toLowerCase()===A||Pu(q).some((V)=>V.toLowerCase()===A))}import{basename as Eu}from"node:path";function ar(P,A=7,q=D(P)){let V=Date.now()-A*24*60*60*1000,ee=[],ne=new Set,ce=0,he,ye,be,xe;if(q)z(P,q);let Ie={count:0},Xe=q?Xt(q,Ie):[];for(let Re of Xe)for(let at of mn(Re,Ie)){if(at.decision==="allow")continue;let ct=new Date(at.ts).getTime();if(ct>=V){if(ce++,ne.add(at.sessionId??Eu(Re,".jsonl")),ye===void 0||ct<=ye)he=at.ts,ye=ct;if(xe===void 0||ct>xe)be=at.ts,xe=ct;Du(ee,at,ct)}}let et=ee.map((Re)=>({timestamp:Re.ts,command:Re.command,reason:Re.reason,relativeTime:Gi(new Date(Re.ts))}));return{totalBlocked:ce,sessionCount:ne.size,recentEntries:et,oldestEntry:he,newestEntry:be,unreadable:Ie.count}}function Du(P,A,q){let V=P.findIndex((ee)=>q>new Date(ee.ts).getTime());if(V===-1){if(P.length<3)P.push(A);return}if(P.splice(V,0,A),P.length>3)P.pop()}import{dirname as Uu}from"node:path";import{dirname as Au,join as _u,resolve as Tu}from"node:path";var Iu="config.json";function Pt(P,A,q,V){g($u(P),`${JSON.stringify(A,null,2)}
`,q,V)}function $u(P){return typeof P==="string"?re(P):P}function uo(P){return{errors:ie(Fu(P),": "," "),ruleNames:new Set(_e(P).map((A)=>A.toLowerCase()))}}var Ou="must match pattern (letters, numbers, hyphens, underscores; max 64 chars)",ss="must match pattern (letters, numbers, hyphens, underscores)";function Fu(P){if(!as(P))return[e([],"Config must be an object")];return[...P.version===1?[]:[e(["version"],"must be 1")],...Nu(P.rules)]}function Nu(P){if(P===void 0)return[];if(!Array.isArray(P))return[e(["rules"],"must be an array")];return[...P.flatMap((A,q)=>as(A)?ju(A,["rules",q]):[e(["rules",q],"must be an object")]),...Te(P)]}function ju(P,A){return[...co(P.name,[...A,"name"],"required string",l,Ou),...co(P.command,[...A,"command"],"required string",w,ss),...P.subcommand===void 0?[]:co(P.subcommand,[...A,"subcommand"],"must be a string if provided",w,ss),...Mu(P.block_args,[...A,"block_args"]),...Hu(P.reason,[...A,"reason"]),...P.intent===void 0||Ce(P.intent)?[]:[e([...A,"intent"],we)]]}function co(P,A,q,V,ee){if(typeof P!=="string")return[e(A,q)];return V.test(P)?[]:[e(A,ee)]}function Mu(P,A){if(!Array.isArray(P))return[e(A,"required array")];if(P.length===0)return[e(A,"must have at least one element")];return P.flatMap((q,V)=>{if(typeof q!=="string")return[e([...A,V],"must be a string")];return q===""?[e([...A,V],"must not be empty")]:[]})}function Hu(P,A){if(typeof P!=="string")return[e(A,"required string")];if(P==="")return[e(A,"must not be empty")];return P.length>T?[e(A,`must be at most ${T} characters`)]:[]}function as(P){return!!P&&typeof P==="object"&&!Array.isArray(P)}function po(P){let A=ls(P);if(!A.ok)return A.result;return uo(A.parsed)}function ls(P){let A=[],q=new Set;try{let V=typeof P==="string"?re(P):P,ee=n(V);if(ee===null)return A.push(`File not found: ${V.path}`),{ok:!1,result:{errors:A,ruleNames:q}};if(!ee.trim())return A.push("Config file is empty"),{ok:!1,result:{errors:A,ruleNames:q}};return{ok:!0,parsed:JSON.parse(ee)}}catch(V){if(V instanceof r)return A.push(V.message),{ok:!1,result:{errors:A,ruleNames:q}};let ee=V instanceof Error?V.message:String(V);return A.push(V instanceof SyntaxError?"Invalid JSON":ee),{ok:!1,result:{errors:A,ruleNames:q}}}}function cs(P){return Tu(P,".safety-net.json")}function Jt(P){let A=ls(P);if(!A.ok)return A.result;let q=Ve(A.parsed);return{errors:q.errors,ruleNames:q.sources}}function lr(P,A={}){return _u(Au(Se(P,A)),Iu)}function ds(P,A,q){let V;try{if(n(A)===null)return{path:P,exists:!1,valid:!1,ruleCount:0};V=Jt(A),V.errors.push(...U(P,q))}catch(ee){if(!(ee instanceof r))throw ee;V={errors:[ee.message],ruleNames:new Set}}return{path:P,exists:!0,valid:V.errors.length===0,ruleCount:V.ruleNames.size,...V.errors.length>0?{errors:V.errors}:{}}}function Gu(P,A){return{source:A,name:P.name,command:P.command,subcommand:P.subcommand,blockArgs:[...P.block_args],reason:P.reason}}function us(P,A){let q=j(P),V=M(A),ee=Uu(q),ne=Y(P,{cwd:A,userConfigPath:q,projectConfigPath:V,userConfigDir:ee}),ce=J(P,{cwd:A,userConfigPath:q,projectConfigPath:V,userConfigDir:ee}),he=new Map(ne.rulebooks.flatMap((ye)=>ye.rules.map((be)=>[be,ye.source])));return{userConfig:ds(q,ce.userConfigTarget,ce.userScope),projectConfig:ds(V,ce.projectConfigTarget,ce.projectScope),effectiveRules:ne.rules.map((ye)=>Gu(ye,he.get(ye.name)??"project"))}}var Bu=[{flag:o.level,description:"Safety level preset: standard, strict, or paranoid",defaultBehavior:"standard"},{flag:o.strict,description:"Legacy; equivalent to safety.overrides.fail_closed",defaultBehavior:"permissive"},{flag:o.paranoid,description:"Legacy; equivalent to safety.overrides.paranoid_rm and paranoid_interpreters",defaultBehavior:"off"},{flag:o.paranoidRm,description:"Legacy; equivalent to safety.overrides.paranoid_rm",defaultBehavior:"off"},{flag:o.paranoidInterpreters,description:"Legacy; equivalent to safety.overrides.paranoid_interpreters",defaultBehavior:"off"},{flag:o.worktree,description:"Allow local git discards in linked worktrees",defaultBehavior:"off"},{flag:o.debug,description:"Print diagnostic messages to stderr",defaultBehavior:"off"},{flag:o.auditScope,description:"Command decisions recorded: all, or blocked (privacy-minimizing, denials only)",defaultBehavior:"all"}];function ps(P){return[...Bu.map((A)=>({name:A.flag.name,value:ve(A.flag,P.env),isSet:Qe(A.flag,P.env),legacyName:A.flag.legacyName,legacyValue:A.flag.legacyName?P.env.get(A.flag.legacyName):void 0,legacyIsSet:A.flag.legacyName?P.env.get(A.flag.legacyName)!==void 0:void 0,description:A.description,defaultBehavior:A.defaultBehavior})),{name:"CC_SAFETY_NET_HOME",value:P.env.get("CC_SAFETY_NET_HOME"),isSet:P.env.get("CC_SAFETY_NET_HOME")!==void 0,description:"Override user-scope config/cache directory",defaultBehavior:"~/.cc-safety-net"}]}var fs={error:0,warning:1,info:2},qu=["policy","config","audit"];function Vu(P){return P.map((A)=>{if(A==="ownership")return"is not owned by the current user";if(A==="permissions")return"has unsafe permissions";if(A==="symlink")return"is a symbolic link";return"is not a directory"}).join(" and ")}var zu=[{derive:(P)=>P.hooks.length>0&&P.hooks.every((A)=>!A.configured)?[{checkId:"integration.none-configured",severity:"error",title:"No integration configured",detail:"CC Safety Net is not connected to any supported coding-agent integration.",fixHint:"Run `cc-safety-net install` and configure at least one integration."}]:[]},{derive:(P)=>P.hooks.filter((A)=>A.inspectionStatus==="failed").map((A)=>{let q=bt(A.platform);return{checkId:"integration.inspection-failed",severity:"error",title:`${q} inspection failed`,detail:`Doctor could not verify the ${q} integration configuration.`,fixHint:`Correct the reported ${q} configuration error, then run \`cc-safety-net doctor\` again.`,integration:A.platform}})},{derive:(P)=>P.userConfig.exists&&!P.userConfig.valid?[{checkId:"config.user-invalid",severity:"error",title:"User configuration is invalid",detail:"Doctor could not load a valid user rules configuration.",fixHint:"Run `cc-safety-net rule verify`, correct the reported error, then rerun doctor.",path:P.userConfig.path}]:[]},{derive:(P)=>P.projectConfig.exists&&!P.projectConfig.valid?[{checkId:"config.project-invalid",severity:"error",title:"Project configuration is invalid",detail:"Doctor could not load a valid project rules configuration.",fixHint:"Run `cc-safety-net rule verify`, correct the reported error, then rerun doctor.",path:P.projectConfig.path}]:[]},{derive:(P)=>P.configState.state==="degraded"?[{checkId:"config.runtime-degraded",severity:"warning",title:"Runtime is enforcing a fallback configuration",detail:`The rejected candidate configuration is not active: ${P.configState.reason}`,fixHint:"Fix the file named in the reason, or run `cc-safety-net rule update` to vendor a remote source, then rerun doctor."}]:[]},{derive:(P)=>P.v2Leftovers&&P.v2Leftovers.length>0?[{checkId:"config.v2-leftovers",severity:"info",title:"Rulebook lock and cache leftovers detected",detail:`Files an earlier version left behind are no longer read: ${P.v2Leftovers.join(", ")}.`,fixHint:"Run `cc-safety-net rule sync` (add `--global` for user scope) to migrate them, then rerun doctor."}]:[]},{derive:(P)=>{let A=P.environment.find((q)=>q.name==="CC_SAFETY_NET_AUDIT_SCOPE");return He(A?.value)==="invalid"?[{checkId:"environment.audit-scope-invalid",severity:"warning",title:"Audit scope value is invalid",detail:"CC_SAFETY_NET_AUDIT_SCOPE is not `all` or `blocked`, so allowed command decisions are not recorded.",fixHint:"Set CC_SAFETY_NET_AUDIT_SCOPE to `all` or `blocked`, then restart the integration."}]:[]}},...qu.map((P)=>({derive:(A)=>A.posture.directories.filter((q)=>q.kind===P&&q.status==="unsafe").map((q)=>({checkId:`posture.${P}-directory-unsafe`,severity:"error",title:`${P[0]?.toUpperCase()}${P.slice(1)} directory is unsafe`,detail:`The ${P} directory ${Vu(q.issues)}.`,fixHint:"Ensure this is a real directory owned by the current user with no group or other write access, then rerun doctor.",...q.path?{path:q.path}:{}}))})),{derive:(P)=>{let A=[...P.effectiveSafety.weakenedRuleOverrides].sort();return A.length>0?[{checkId:"posture.rule-overrides-weaken-preset",severity:"warning",title:"Rule overrides weaken the selected preset",detail:`Explicit overrides disable rules the resolved preset would enable: ${A.join(", ")}.`,fixHint:`Remove these \`off\` overrides or set them to \`on\`: ${A.join(", ")}.`}]:[]}}];function ms(P){return zu.flatMap((A,q)=>A.derive(P).map((V,ee)=>({finding:V,catalogOrder:q,occurrence:ee}))).sort((A,q)=>fs[A.finding.severity]-fs[q.finding.severity]||A.catalogOrder-q.catalogOrder||A.occurrence-q.occurrence).map((A)=>A.finding)}function Gt(){return Boolean(process.stdout.isTTY&&!process.env.NO_COLOR)}var Ju=(P)=>Gt()?`\x1B[32m${P}\x1B[0m`:P,Wu=(P)=>Gt()?`\x1B[33m${P}\x1B[0m`:P,Ku=(P)=>Gt()?`\x1B[34m${P}\x1B[0m`:P,Yu=(P)=>Gt()?`\x1B[36m${P}\x1B[0m`:P,Xu=(P)=>Gt()?`\x1B[31m${P}\x1B[0m`:P,Zu=(P)=>Gt()?`\x1B[2m${P}\x1B[0m`:P,Qu=(P)=>Gt()?`\x1B[1m${P}\x1B[0m`:P,dt={green:Ju,yellow:Wu,blue:Ku,cyan:Yu,red:Xu,dim:Zu,bold:Qu},ep="\x1B[0m",tp=[39,82,198,226,208,51,196,46,201,214,93,154,220,27,49,190,200,33,129,227,45,160,63,118,123,202];function np(P){let A=P;return()=>(A=(A*1664525+1013904223)%4294967296,A/4294967296)}function rp(P){let A=[...tp],q=np(P);for(let V=A.length-1;V>0;V--){let ee=Math.floor(q()*(V+1)),ne=A[V];A[V]=A[ee],A[ee]=ne}return A}function op(P,A=0){if(!Gt())return"";let q=rp(A);return`\x1B[38;5;${q[P%q.length]}m`}function gs(P,A,q=0){if(!Gt())return`"${P}"`;return`${op(A,q)}"${P}"${ep}`}function cr(P){return P==="default"?"built-in default":`${P} policy`}var ip=new RegExp("\x1B\\[[0-9;]*m","g"),fo=(P)=>P.replace(ip,"").length;function Zt(P){let A=(P.headers??P.rows[0]??[]).map((ce,he)=>{let ye=Math.max(...P.rows.map((be)=>fo(be[he]??"")));return Math.max(fo(ce),ye)}),q=(ce,he)=>ce+" ".repeat(Math.max(0,he-fo(ce))),V=(ce,he)=>he[0]+A.map((ye)=>ce.repeat(ye+2)).join(he[1])+he[2],ee=(ce)=>`│ ${ce.map((he,ye)=>q(he,A[ye]??0)).join(" │ ")} │`,ne=P.headers?[`   ${ee(P.headers)}`,`   ${V("─",["├","┼","┤"])}`]:[];return[`   ${V("─",["┌","┬","┐"])}`,...ne,...P.rows.map((ce)=>`   ${ee(ce)}`),`   ${V("─",["└","┴","┘"])}`].join(`
`)}function hs(P){let A=[];A.push("Hook Integration"),A.push(sp(P));let q=[],V=[];for(let ee of P){let ne=bt(ee.platform);if(ee.errors&&ee.errors.length>0)for(let ce of ee.errors)if(ee.configured)q.push({platform:ne,message:ce});else V.push({platform:ne,message:ce})}for(let ee of q)A.push(`   Warning (${ee.platform}): ${ee.message}`);for(let ee of V)A.push(dt.red(`   Error (${ee.platform}): ${ee.message}`));return A.join(`
`)}function sp(P){let A=["Platform","Discovery","Configuration","Inspection"],q=P.map((V)=>{let ee=bt(V.platform);if(V.inspectionStatus==="not-inspected"){let ye=dt.dim("Not inspected");return[ee,ye,ye,ye]}let ne=V.detected?dt.green("Detected"):V.inspectionStatus==="failed"?dt.red("Unknown"):dt.dim("Not detected"),ce=V.configured?dt.green("Configured"):V.detected?dt.yellow("Not configured"):V.inspectionStatus==="failed"?dt.red("Unknown"):dt.dim("Not applicable"),he=V.inspectionStatus==="verified"?dt.green("Verified"):V.inspectionStatus==="failed"?dt.red("Failed"):dt.dim("Not applicable");return[ee,ne,ce,he]});return Zt({headers:A,rows:q})}function ys(P){let q=["Guard Engine Verification",`   Synthetic self-test: ${P.failed>0?dt.red(`${P.passed}/${P.total} FAIL`):dt.green(`${P.passed}/${P.total} passed`)}`],V=P.results.filter((ee)=>!ee.passed);if(V.length>0){q.push(""),q.push(dt.red("   Failures:"));for(let ee of V)q.push(dt.red(`   • ${ee.description}`)),q.push(dt.red(`     expected ${ee.expected}, got ${ee.actual}`))}return q.join(`
`)}function ap(P){if(P.length===0)return"   (no custom rules)";let A=["Source","Name","Command","Block Args"],q=P.map((V)=>[V.source,V.name,V.subcommand?`${V.command} ${V.subcommand}`:V.command,V.blockArgs.join(", ")]);return Zt({headers:A,rows:q})}function vs(P){let A=[];if(A.push("Configuration"),A.push(lp(P.userConfig,P.projectConfig)),A.push(""),P.effectiveRules.length>0)A.push(`   Effective rules (${P.effectiveRules.length} total):`),A.push(ap(P.effectiveRules));else A.push("   Effective rules: (none - using built-in rules only)");return A.join(`
`)}function lp(P,A){let q=["Scope","Status"],V=(ne)=>{if(!ne.exists)return dt.dim("N/A");if(!ne.valid)return dt.red(`Invalid (${ne.errors?.[0]??"unknown error"})`);return dt.green("Configured")},ee=[["User",V(P)],["Project",V(A)]];return Zt({headers:q,rows:ee})}function bs(P){let A=[];return A.push("Environment"),A.push(cp(P)),A.join(`
`)}function Ls(P){let A=P.effectiveSafety.policyScopes,q=["Effective Safety",`   Selected preset: ${P.effectiveSafety.selectedPreset}${A?` (${cr(A.levelScope)})`:""}`,`   Effective: ${P.effectiveSafety.level}`],V=[["fail_closed","fail_closed"],["paranoid_rm","paranoid_rm"],["paranoid_interpreters","paranoid_interpreters"]];for(let[ee,ne]of V){let ce=P.effectiveSafety.capabilities[ee],he=ce.enabled?dt.green("ON"):dt.dim("OFF"),ye=ce.sources.length>0?` (${ce.sources.join(", ")})`:"";q.push(`   ${ne}: ${he} via ${ce.source}${ye}`)}if(A&&A.weakenings.length>0){q.push("   Project policy deltas:");for(let ee of A.weakenings)q.push(`      ${ee}`)}q.push(`   Stored rule customizations: ${P.effectiveSafety.ruleCounts.stored}`),q.push(`   Effective rule customizations: ${P.effectiveSafety.ruleCounts.effective}`);for(let[ee,ne]of Object.entries(P.effectiveSafety.ruleOverrides))q.push(`   ${ee}: ${ne}`);return q.join(`
`)}function ws(P){let A=["Findings"];if(P.length===0)return A.push("   No findings from inspected doctor facts."),A.join(`
`);for(let q of P){let V=`[${q.severity.toUpperCase()}] ${q.checkId}: ${Ct(q.title)}`,ee=q.severity==="error"?dt.red:q.severity==="warning"?dt.yellow:dt.blue;if(A.push(`   ${ee(V)}`),A.push(`      ${Ct(q.detail)}`),q.path)A.push(`      Path: ${Ct(q.path)}`);if(q.fixHint)A.push(`      Fix: ${Ct(q.fixHint)}`)}return A.join(`
`)}function cp(P){let A=["Variable","Status","Legacy"],q=P.map((V)=>{let ee=V.isSet?dt.green("✓"):dt.dim("✗"),ne=V.legacyName&&V.legacyIsSet?`${V.legacyName} ${dt.green("✓")}`:V.legacyName??"";return[V.name,ee,ne]});return Zt({headers:A,rows:q})}function ks(P){let A=[];if(P.totalBlocked===0)A.push("Recent Activity"),A.push("   No blocked commands in the last 7 days"),A.push("   Tip: This is normal for new installations");else A.push(`Recent Activity · last 7 days (${P.totalBlocked} blocked / ${P.sessionCount} sessions)`),A.push(dp(P.recentEntries));if(P.unreadable>0)A.push(`   Warning: ${P.unreadable} audit log ${P.unreadable===1?"source":"sources"} could not be read; this summary is incomplete`);return A.join(`
`)}function dp(P){let A=["Time","Command"],q=P.map((V)=>{let ee=Ct(V.command.replace(/\r\n|\r|\n/g," ↵ ").replace(/\t/g," ")),ne=ee.length>40?`${ee.slice(0,37)}...`:ee;return[V.relativeTime,ne]});return Zt({headers:A,rows:q})}function xs(P){let A=[];if(A.push("Update Check"),P.latestVersion===null&&!P.error)return A.push(dr([["Status",dt.dim("Skipped")],["Installed",P.currentVersion]])),A.join(`
`);if(P.error)return A.push(dr([["Status",`${dt.yellow("⚠")} Error`],["Installed",P.currentVersion],["Error",dt.dim(P.error)]])),A.join(`
`);if(P.updateAvailable)return A.push(dr([["Status",`${dt.yellow("⚠")} Update Available`],["Current",P.currentVersion],["Latest",dt.green(P.latestVersion??"")]])),A.push(""),A.push("   Run: bunx cc-safety-net@latest doctor"),A.push("   Or:  npx cc-safety-net@latest doctor"),A.join(`
`);return A.push(dr([["Status",`${dt.green("✓")} Up to date`],["Version",P.currentVersion]])),A.join(`
`)}function dr(P){return Zt({rows:P})}function Cs(P){let A=[];return A.push("System Info"),A.push(up(P)),A.join(`
`)}function up(P){let A=["Component","Version"],q=(ne)=>{if(ne===null)return dt.dim("not found");return ne},ee=[{label:"cc-safety-net",value:P.version},...rr.map((ne)=>({label:bt(ne),value:P.versions[ne]??null})),{label:"Node.js",value:P.nodeVersion},{label:"npm",value:P.npmVersion},{label:"Bun",value:P.bunVersion},{label:"Platform",value:P.platform}].map((ne)=>[ne.label,q(ne.value)]);return Zt({headers:A,rows:ee})}function Ss(P){if(P.findings.length===0)return dt.green(`
No findings from inspected doctor facts.`);let A={error:P.findings.filter((ne)=>ne.severity==="error").length,warning:P.findings.filter((ne)=>ne.severity==="warning").length,info:P.findings.filter((ne)=>ne.severity==="info").length},q=["error","warning","info"].filter((ne)=>A[ne]>0).map((ne)=>`${A[ne]} ${ne}`),V=P.findings.length===1?"finding":"findings",ee=`
${P.findings.length} ${V}: ${q.join(", ")}.`;if(A.error>0)return dt.red(ee);if(A.warning>0)return dt.yellow(ee);return dt.blue(ee)}import{lstatSync as pp}from"node:fs";import{dirname as mo}from"node:path";function go(P,A){try{let q=pp(A);if(q.isSymbolicLink())return{kind:P,path:A,status:"unsafe",issues:["symlink"]};if(!q.isDirectory())return{kind:P,path:A,status:"unsafe",issues:["not-directory"]};if(process.platform==="win32"||typeof process.getuid!=="function")return{kind:P,path:A,status:"unknown",issues:[]};let V=[...q.uid!==process.getuid()?["ownership"]:[],...(q.mode&18)!==0?["permissions"]:[]];return{kind:P,path:A,status:V.length>0?"unsafe":"safe",issues:V}}catch(q){if(typeof q==="object"&&q!==null&&"code"in q&&q.code==="ENOENT")return{kind:P,path:A,status:"not-applicable",issues:[]};return{kind:P,path:A,status:"unknown",issues:[]}}}function Rs(P,A){let q=D(P);return{directories:[go("policy",mo(mo(A))),go("config",mo(A)),...q?[go("audit",q)]:[{kind:"audit",status:"unknown",issues:[]}]]}}import{spawn as fp}from"node:child_process";import{existsSync as Ps}from"node:fs";import{delimiter as mp,extname as gp,join as hp}from"node:path";import{stripVTControlCharacters as Es}from"node:util";var As="2.4.14",yp=5000,vp="_CC_SAFETY_NET_TEST_SPAWN_PLATFORM";function wt(){return As}function ho(P,A){let q=P[A];if(q)return q;let V=Object.keys(P).find((ee)=>ee.toLowerCase()===A.toLowerCase()&&!!P[ee]);return V?P[V]:q}function bp(P){return(ho(P,"PATHEXT")||".COM;.EXE;.BAT;.CMD").split(";").filter((A)=>A.length>0)}function Lp(P,A){let q=gp(P)?[P]:[...bp(A).map((V)=>`${P}${V}`),P];if(P.includes("/")||P.includes("\\"))return q.find((V)=>Ps(V))??P;return(ho(A,"PATH")??"").split(mp).flatMap((V)=>q.map((ee)=>hp(V,ee))).find((V)=>Ps(V))??P}function Ds(P){if(!/[\s"&|<>^]/.test(P))return P;return`"${P.replace(/"/g,'""')}"`}function Qt(P,A){let[q,...V]=P,ee=A[vp]==="win32"?"win32":process.platform;if(!q||ee!=="win32")return{cmd:q??"",args:V};let ne=Lp(q,A);if(!/\.(?:bat|cmd)$/i.test(ne))return{cmd:ne,args:V};return{cmd:ho(A,"COMSPEC")??"cmd.exe",args:["/d","/c",["call",Ds(ne),...V.map(Ds)].join(" ")]}}var hn=async(P,A=yp)=>{let q=await wp(P,{timeoutMs:A});if(q.code!==0)return null;return Es(q.stdout).trim()||Es(q.stderr).trim()||null};function wp(P,A){let[q,...V]=P;if(!q)return Promise.resolve({code:null,stdout:"",stderr:""});return new Promise((ee)=>{try{let ne=Qt([q,...V],process.env),ce=fp(ne.cmd,ne.args,{stdio:["ignore","pipe","pipe"]}),he=!1,ye="",be="";ce.stdout.on("data",(Xe)=>{ye+=Xe.toString()}),ce.stderr.on("data",(Xe)=>{be+=Xe.toString()});let xe=(Xe)=>{if(he)return;he=!0,clearTimeout(Ie),ee(Xe)},Ie=setTimeout(()=>{ce.kill(),xe({code:null,stdout:ye,stderr:be})},A.timeoutMs);ce.on("close",(Xe)=>{xe({code:Xe,stdout:ye,stderr:be})}),ce.on("error",()=>{xe({code:null,stdout:ye,stderr:be})})}catch{ee({code:null,stdout:"",stderr:""})}})}function ur(P){if(!P)return null;let A=/Claude Code\s+(\d+\.\d+\.\d+)/i.exec(P);if(A)return A[1]??null;let q=/v?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)/i.exec(P);if(q)return q[1]??null;return P.split(`
`)[0]?.trim()||null}async function pr(P,A=hn,q=process.cwd()){let V=Promise.all($t.map(async(Ie)=>[Ie.id,ur(await A([...Ie.probeCommand]))])),[ee,ne,ce,he,ye,be,xe]=await Promise.all([V,V.then(async(Ie)=>{let Xe=Ie.find(([at])=>at==="opencode")?.[1];if(!Xe?.startsWith("2.")||!P(Xe))return null;let et=["--param",`location[directory]=${q}`],Re=["opencode","api","integration.list",...et];return await A(Re,30000),A(["opencode","api","plugin.list",...et],30000)}),A(["codex","plugin","list"],30000),A(["amp","plugins","list"],30000),A(["node","--version"]),A(["npm","--version"]),A(["bun","--version"])]);return{version:As,versions:Object.fromEntries(ee),codexPluginListOutput:ce,ampPluginListOutput:he,openCodePluginListOutput:ne,nodeVersion:ur(ye),npmVersion:ur(be),bunVersion:ur(xe),platform:`${process.platform} ${process.arch}`}}function yo(P,A){if(A==="dev")return!1;let q=P.split(".").map(Number),V=A.split(".").map(Number),[ee=0,ne=0,ce=0]=q,[he=0,ye=0,be=0]=V;if(ee!==he)return ee>he;if(ne!==ye)return ne>ye;return ce>be}async function Wt(){let P=wt(),A=new AbortController,q=setTimeout(()=>A.abort(),3000);try{let V=await fetch("https://registry.npmjs.org/cc-safety-net/latest",{signal:A.signal});if(!V.ok)return{currentVersion:P,latestVersion:null,updateAvailable:!1,error:`npm registry returned ${V.status}`};let ee=await V.json(),ne=yo(ee.version,P);return{currentVersion:P,latestVersion:ee.version,updateAvailable:ne}}catch(V){return{currentVersion:P,latestVersion:null,updateAvailable:!1,error:V instanceof Error?V.message:"Network error"}}finally{clearTimeout(q)}}import*as js from"node:readline";var $s=(P)=>`\x1B[${P}B`,kp=(P)=>`\x1B[${P}A`;var _s=["░","▒","▓","╱","╲","┃","━","┏","┓","┗","┛","╋"];function xp(P){return new Promise((A)=>setTimeout(A,P))}function Cp(P,A,q){if(!q)return A(P);if(q.aborted)return Promise.resolve();return new Promise((V,ee)=>{let ne=()=>q.removeEventListener("abort",ce),ce=()=>{ne(),V()};q.addEventListener("abort",ce,{once:!0}),A(P).then(()=>{ne(),V()},(he)=>{ne(),ee(he)})})}function fr(P){return Math.max(0,Math.min(1,P))}function yn(P){return Math.max(0,Math.min(255,Math.round(P)))}function vo(P){return P<=0.0031308?12.92*P:1.055*P**0.4166666666666667-0.055}function Sp(P,A,q){let V=q*Math.PI/180,ee=A*Math.cos(V),ne=A*Math.sin(V),ce=(P+0.3963377774*ee+0.2158037573*ne)**3,he=(P-0.1055613458*ee-0.0638541728*ne)**3,ye=(P-0.0894841775*ee-1.291485548*ne)**3;return{blue:yn(vo(fr(-0.0041960863*ce-0.7034186147*he+1.707614701*ye))*255),green:yn(vo(fr(-1.2684380046*ce+2.6097574011*he-0.3413193965*ye))*255),red:yn(vo(fr(4.0767416621*ce-3.3077115913*he+0.2309699292*ye))*255)}}function bo(P,A){let q=(A*P*180/Math.PI%360+360)%360;return Sp(0.72,0.15,q)}function Os(P,A=0.1){let q=bo(A,P);return`\x1B[38;2;${q.red};${q.green};${q.blue}m`}function Rp(P,A){return{blue:yn(P.blue+(255-P.blue)*A),green:yn(P.green+(255-P.green)*A),red:yn(P.red+(255-P.red)*A)}}function Fs(P,A,q){let V=Math.imul(P+2654435769,2246822507)^Math.imul(A+3266489909,668265263)^Math.imul(q+374761393,2654435761),ee=V^V>>>15,ne=Math.imul(ee,739982445),ce=ne^ne>>>12,he=Math.imul(ce,695872825);return((he^he>>>15)>>>0)/4294967296}function Pp(P,A,q){let V=Math.floor(Fs(P,A,q)*_s.length);return _s[V]??"░"}function Ts(P){let A=fr(P);return A*A*A*(A*(A*6-15)+10)}function Ep(P){if(P.length===0)return"";let A=[],q=!1,V="";for(let ee of P){let ne=`${ee.red};${ee.green};${ee.blue}`;if(ee.bold!==q)A.push(ee.bold?"\x1B[1m":"\x1B[22m"),q=ee.bold;if(ne!==V)A.push(`\x1B[38;2;${ne}m`),V=ne;A.push(ee.character)}return`${A.join("")}\x1B[22m\x1B[39m`}function Dp(P,A,q,V,ee){return P.map((ne,ce)=>({...bo(q,V+A+ce/ee),bold:!1,character:ne}))}function Ap(P,A,q,V,ee,ne,ce,he){let ye=Math.max(1,V*0.75),be=Math.min(1,q/ye),xe=ee*Ts(be),Ie=Math.max(0,(q-ye)/Math.max(1,V-ye)),Xe=(1-Ts(q/V))*he*2,et=0.35*Math.max(0,1-Ie*2),Re=be>=1,at=Math.min(P.length,Math.ceil(xe+2+1));return P.slice(0,at).map((ct,lt)=>{let ft=bo(ne,ce+A+lt/he+Xe),mt=lt+Fs(A,lt,7919)*2-1;if(mt>xe+2)return{...ft,bold:!1,character:" "};let gt=xe-mt,ut=0.8*Math.exp(-(gt*gt)/12.5),vt=Math.min(0.9,ut+et),At=!Re&&mt>xe-4;return{...Rp(ft,vt),bold:vt>0.3,character:At?Pp(A,lt,q):ct}})}function Is(P){return`\x1B[?2026h${P.map((A,q)=>`\x1B8${q>0?$s(q):""}${Ep(A)}`).join("")}\x1B[?2026l`}async function Lo(P,A={}){if(!P)return;let q=A.output??process.stdout,V=A.sleep??xp,ee=A.seed??0,ne=P.split(`
`).map((xe)=>Array.from(xe)),ce=Math.max(...ne.map((xe)=>xe.length)),he=12000*ne.filter((xe)=>xe.length>0).length/40,ye=ce>0?Math.max(1,Math.ceil(he/16.666666666666668)):0,be=ye>0?he/ye:0;q.write(`\x1B[?25l${ne.length>1?`${`
`.repeat(ne.length-1)}${kp(ne.length-1)}`:""}\x1B7`);try{for(let xe=1;xe<=ye;xe+=1){if(A.signal?.aborted)break;q.write(Is(ne.map((Ie,Xe)=>Ap(Ie,Xe,xe,ye,ce,0.1,ee,3)))),await Cp(be,V,A.signal)}}finally{if(q.write(Is(ne.map((xe,Ie)=>Dp(xe,Ie,0.1,ee,3)))),q.write("\x1B8"),ne.length>1)q.write($s(ne.length-1));q.write(`
\x1B[0m\x1B[?25h`)}}var Ns=["┏━┛┏━┛  ┏━┛┏━┃┏━┛┏━┛━┏┛┃ ┃  ┏━ ┏━┛━┏┛","┃  ┃    ━━┃┏━┃┏━┛┏━┛ ┃ ━┏┛  ┃ ┃┏━┛ ┃ ","━━┛━━┛  ━━┛┛ ┛┛  ━━┛ ┛  ┛   ┛ ┛━━┛ ┛ "].join(`
`);function _p(P){return Boolean(P.isTTY)}async function Dn(P={}){let A=P.output??process.stdout;if(!_p(A))return;let q=P.input??process.stdin,V={output:A,seed:P.seed??Math.random()*8192,sleep:P.sleep};if(!q.isTTY||typeof q.setRawMode!=="function"){await Lo(Ns,V);return}let ee=new AbortController,ne=q.readableFlowing===!0,ce=q.isRaw===!0,he=!1,ye=(be,xe)=>{if(xe.ctrl&&xe.name==="c")he=!0;if(he||xe.name==="return"||xe.name==="enter")ee.abort()};js.emitKeypressEvents(q),q.on("keypress",ye),q.setRawMode(!0),q.resume();try{await Lo(Ns,{...V,signal:ee.signal})}finally{if(q.off("keypress",ye),q.setRawMode(ce),!ne)q.pause()}if(!he)return;if(P.onInterrupt){P.onInterrupt();return}process.kill(process.pid,"SIGINT")}import{createHash as Fp}from"node:crypto";import{existsSync as Us}from"node:fs";import{dirname as mr,join as Gs}from"node:path";import{dirname as Ms,join as Tp,resolve as Ip}from"node:path";var $p="rule.lock";function Op(P){return Tp(Ms(P),$p)}function Hs(P={}){return Ip(P.cwd??process.cwd(),".safety-net.json")}function Et(P,A){let q=A.global?A.userConfigPath??j(P,A):A.projectConfigPath??M(A.cwd??process.cwd()),V=A.global?Be(P,A):ze(q,A.cwd??process.cwd()),ee=Op(q);return{configDir:Ms(q),configPath:q,lockPath:ee,filesystemScope:V,configTarget:i(V,q),lockTarget:i(V,ee)}}var Np="`cc-safety-net rule sync` is deprecated: rulebooks are live files that need no synchronization. This run only migrates the lock and cache an earlier version left behind.",jp="cache",Mp="rulebooks";function Bs(P,A={}){let q=Et(P,A),V=i(q.filesystemScope,Vs(q.configDir)),ee=n(q.lockTarget);if(console.log(Np),ee===null&&!Us(V.path))return console.log(`No v2 lock or cache leftovers found in ${mr(q.configDir)}; nothing to migrate.`),0;let ne=qp(ee),ce=m(q.configTarget);if(!ce.config&&(n(q.configTarget)!==null||ne.size>0))return console.error(`Cannot migrate: the rules config in ${mr(q.configDir)} is missing or unreadable while v2 leftovers remain. Restore rule.json, then re-run rule sync.`),1;let he=ce.config?.rules??[];for(let ye of he.flatMap((be)=>Hp(be,ne,q,V,A.global===!0)))console.log(ye);return F(q.lockTarget),tt(V),console.log(`Removed the v2 lock and cache under ${mr(q.configDir)}.`),0}function qs(P,A){return[...new Set([{cwd:A},{cwd:A,global:!0}].flatMap((q)=>{let V=Et(P,q);return[V.lockPath,Vs(V.configDir)]}))].filter((q)=>Us(q))}function Hp(P,A,q,V,ee){if(!S(P))return[];let ne=I(P).name,ce=i(q.filesystemScope,O(q.configDir,ne)),he=n(ce);if(he!==null&&Up(he,ne))return[];let ye=A.get(P),be=ye?Gp(ye,ne,V.path,q.filesystemScope):null;if(be===null)return[`Could not migrate ${P} from the v2 cache. Run \`cc-safety-net rule update ${P}${ee?" --global":""}\` to vendor it.`];if(g(ce,be),he!==null)return[`Restored ${P} from the v2 cache over an invalid file.`];return[`Vendored ${P} from the v2 cache.`]}function Up(P,A){let q=me(P);return!("problem"in q)&&q.rulebook.name===A}function Gp(P,A,q,V){let ee=Gs(q,Mp,`${Bp(P)}--${P.digest.replace("sha256:","").slice(0,12)}`,ue),ne=n(i(V,ee));if(ne===null||Jp(ne)!==P.digest)return null;let ce=me(ne);if("problem"in ce||ce.rulebook.name!==A)return null;return ne}function Vs(P){return Gs(mr(P),jp)}function Bp(P){return([P.owner,P.repo,P.display_ref,P.name].every((V)=>typeof V==="string"&&V!=="")?`${P.owner}/${P.repo}#${P.display_ref}/${P.name}`:P.spec).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"rulebook"}function qp(P){let A=P===null?null:zp(P),q=zs(A)&&Array.isArray(A.rulebooks)?A.rulebooks:[];return new Map(q.filter(Vp).map((V)=>[V.spec,V]))}function Vp(P){return zs(P)&&typeof P.spec==="string"&&typeof P.digest==="string"}function zs(P){return!!P&&typeof P==="object"}function zp(P){try{return JSON.parse(P)}catch{return null}}function Jp(P){return`sha256:${Fp("sha256").update(P).digest("hex")}`}var Js="\r\x1B[2K",Wp="\x1B[?25l",Kp="\x1B[39m",Yp="\x1B[?25h",Xp=100,Zp=0.55,Qp=80,Ws=["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];function e2(P){return new Promise((A)=>setTimeout(A,P))}async function gr(P,A={}){let q=A.output??process.stdout;if(!q.isTTY)return P;let V=A.sleep??e2,ee=!1,ne=P.then((he)=>(ee=!0,he),(he)=>{throw ee=!0,he});if(await Promise.race([ne.then(()=>!0),V(Xp).then(()=>!1)]))return ne;q.write(Wp);try{for(let he=0;!ee;he+=1)q.write(`${Js}${Os(he*Zp)}${Ws[he%Ws.length]}${Kp} ${A.loadingMessage??"Loading…"}`),await Promise.race([ne,V(Qp)]);return await ne}finally{q.write(`${Js}${Yp}`)}}async function An(P,A,q,V={}){let ee=A();if(P)await q();if(P&&ee.ready)await gr(ee.ready,V);return ee.finish()}import{stripVTControlCharacters as t2}from"node:util";var hr="amp plugins list",n2=/^\s*[✓✗]\s+cc-safety-net(?:\.ts)?\s+\(User Plugins\)\s+(\S+)\s*$/;function Ks(P){if(!P.ampPluginListOutput)return{platform:"amp",status:"n/a"};let A=t2(P.ampPluginListOutput).split(`
`).map((q)=>n2.exec(q)?.[1]).find((q)=>q!==void 0);if(!A)return{platform:"amp",status:"n/a"};if(A!=="active")return{platform:"amp",status:"disabled",method:hr,configPath:hr,errors:[`Amp personal plugin cc-safety-net is ${A}; run "plugins: reload" in Amp or reinstall with install --amp`]};return{platform:"amp",status:"configured",method:hr,configPath:hr}}import{existsSync as a2,readFileSync as l2}from"node:fs";import{isAbsolute as kv,join as s2}from"node:path";function _n(P){return s2(P,".gemini","config","hooks.json")}var c2=/cc-safety-net\s+hook\s+(?:[^\s]+\s+)*(?:--agy-cli|-ac)(\s|["']|$)/;function d2(P){if(!P||typeof P!=="object"||Array.isArray(P))return[];return Object.values(P).flatMap((A)=>{if(!A||typeof A!=="object"||Array.isArray(A))return[];let q=A,V=q.PreToolUse;if(!Array.isArray(V))return[];return V.flatMap((ee)=>{if(!ee||typeof ee!=="object"||Array.isArray(ee))return[];let ne=ee.hooks;if(!Array.isArray(ne))return[];return ne.flatMap((ce)=>{if(!ce||typeof ce!=="object"||Array.isArray(ce))return[];let he=ce.command;if(typeof he!=="string"||!c2.test(he))return[];return[{command:he,enabled:q.enabled!==!1}]})})})}function Ys(P){let A=_n(P.environment.home);if(!a2(A))return{platform:"antigravity-cli",status:"n/a",configPath:A};let q;try{q=d2(JSON.parse(l2(A,"utf-8")))}catch(V){return{platform:"antigravity-cli",status:"n/a",configPath:A,errors:[`Failed to parse Antigravity hooks config ${A}: ${V instanceof Error?V.message:String(V)}`]}}if(q.some((V)=>V.enabled))return{platform:"antigravity-cli",status:"configured",method:"hook config",configPath:A};if(q.length>0)return{platform:"antigravity-cli",status:"disabled",method:"hook config",configPath:A};return{platform:"antigravity-cli",status:"n/a",configPath:A}}import{join as ko}from"node:path";import{existsSync as u2,lstatSync as p2,readFileSync as f2}from"node:fs";import{join as m2}from"node:path";function Ft(P,A=(q)=>q){if(!u2(P))return{kind:"missing"};try{return{kind:"ok",value:JSON.parse(A(f2(P,"utf-8")))}}catch{return{kind:"unreadable"}}}function en(P,A){if(P==="~")return A;if(P.startsWith("~/")||P.startsWith("~\\"))return m2(A,P.slice(2));return P}function Lt(P){try{return p2(P)}catch{return}}function yr(P,A){let q=Lt(A);if(!q)return{platform:P,status:"n/a",configPath:A};if(!q.isSymbolicLink()&&q.isDirectory())return;return{platform:P,status:"n/a",configPath:A,errors:[`${A} is a symlink or not a directory; move or remove it before installing`]}}function pt(P,A){return typeof P==="object"&&P!==null?P[A]:void 0}var wo="cc-safety-net@cc-marketplace";function vr(P){return P.env.get("CLAUDE_CONFIG_DIR")||ko(P.home,".claude")}function Xs(P){return ko(vr(P),"plugins","installed_plugins.json")}function Zs(P,A){let q=pt(pt(P,"plugins"),A);return Array.isArray(q)&&q.length>0}function br(P,A){let q=Ft(Xs(P));return q.kind==="ok"&&Zs(q.value,A)}function xo(P){let A=Xs(P),q=Ft(A);if(q.kind==="unreadable")return{platform:"claude-code",status:"not-inspected"};if(q.kind==="missing")return{platform:"claude-code",status:"n/a"};if(!Zs(q.value,wo))return{platform:"claude-code",status:"n/a"};let V=ko(vr(P),"settings.json"),ee=Ft(V);if(ee.kind==="unreadable")return{platform:"claude-code",status:"not-inspected"};if(!(ee.kind==="ok"&&pt(pt(ee.value,"enabledPlugins"),wo)===!0))return{platform:"claude-code",status:"disabled",method:"plugin config",configPath:V,errors:[`${wo} is installed but not enabled in Claude Code`]};return{platform:"claude-code",status:"configured",method:"plugin config",configPath:A}}function Qs(P){return xo(P.environment)}var ea="Start Codex, open `/hooks`, select the cc-safety-net PreToolUse hook, and press `t` to trust it.";function ta(P){if(!P.codexPluginListOutput)return{platform:"codex",status:"n/a"};let A=P.codexPluginListOutput.split(`
`).find((q)=>q.includes("https://github.com/kenryu42/cc-safety-net.git"));if(!A)return{platform:"codex",status:"n/a"};if(!A.includes("installed,"))return{platform:"codex",status:"n/a"};if(!A.includes("installed, enabled"))return{platform:"codex",status:"disabled",method:"codex plugin list",configPath:"codex plugin list",errors:["Codex plugin line for https://github.com/kenryu42/cc-safety-net.git must contain installed, enabled."]};return{platform:"codex",status:"configured",method:"codex plugin list",configPath:"codex plugin list",errors:["Codex runs only trusted hooks, and doctor cannot check trust. Start Codex, open `/hooks`, select the cc-safety-net PreToolUse hook, and press `t` to trust it."]}}import{existsSync as Cr,readdirSync as g2,readFileSync as h2}from"node:fs";import{join as Rt}from"node:path";function _t(P){let A="",q=0,V=!1,ee=!1,ne=-1;while(q<P.length){let ce=P[q],he=P[q+1];if(ee){A+=ce,ee=!1,q++;continue}if(ce==='"'&&!V){V=!0,ne=-1,A+=ce,q++;continue}if(ce==='"'&&V){V=!1,A+=ce,q++;continue}if(ce==="\\"&&V){ee=!0,A+=ce,q++;continue}if(V){A+=ce,q++;continue}if(ce==="/"&&he==="/"){while(q<P.length&&P[q]!==`
`)q++;continue}if(ce==="/"&&he==="*"){q+=2;while(q<P.length-1){if(P[q]==="*"&&P[q+1]==="/"){q+=2;break}q++}continue}if(ce===","){ne=A.length,A+=ce,q++;continue}if(ce==="}"||ce==="]"){if(ne!==-1){let ye=A.slice(ne+1);if(/^\s*$/.test(ye))A=A.slice(0,ne)+ye}ne=-1,A+=ce,q++;continue}if(!/\s/.test(ce))ne=-1;A+=ce,q++}return A}function ra(P,A,q){let V=A+1,ee=!1;while(V<P.length){if(ee){ee=!1,V++;continue}if(P[V]==="\\"){ee=!0,V++;continue}if(P[V]==='"')return V+1;V++}throw Error(q)}function So(P,A,q){let V=P[A],ee=V==="["?"]":"}",ne=0,ce=A;while(ce<P.length){let he=q.skipComment?.(P,ce)??ce;if(he!==ce){ce=he;continue}if(P[ce]==='"'){ce=ra(P,ce,q.stringError);continue}if(P[ce]===V)ne++;if(P[ce]===ee){if(ne--,ne===0)return ce}ce++}throw Error(q.bracketError)}function oa(P,A){let q=P.lastIndexOf(`
`,A)+1;return/^[ \t]*/.exec(P.slice(q))?.[0]??""}function Lr(P,A){let q=A.end+(/^\s*/.exec(P.slice(A.end))?.[0].length??0);if(P[q]===","){let ce=P[q+1]===`
`?q+2:q+1;return`${P.slice(0,A.start)}${P.slice(ce)}`}let V=P.slice(0,A.start).search(/\s*$/)-1;if(P[V]!==",")return`${P.slice(0,A.start)}${P.slice(A.end)}`;let ee=P.lastIndexOf(`
`,V-1),ne=ee!==-1&&/^\s*$/.test(P.slice(ee+1,V))?ee:V;return`${P.slice(0,ne)}${P.slice(A.end)}`}function Co(P,A){if(P.startsWith("//",A)){let q=P.indexOf(`
`,A+2);return q===-1?P.length:q+1}if(P.startsWith("/*",A)){let q=P.indexOf("*/",A+2);return q===-1?P.length:q+2}return A}function na(P,A){let q=A;while(q<P.length){if(/\s/.test(P[q]??"")){q++;continue}let V=Co(P,q);if(V===q)return q;q=V}return q}function ia(P,A,q){let V=0,ee=0;while(ee<P.length){let ne=Co(P,ee);if(ne!==ee){ee=ne;continue}if(P[ee]==='"'){let ce=ra(P,ee,q.stringError);if(V===1&&JSON.parse(P.slice(ee,ce))===A){let he=na(P,ce),ye=na(P,he+1);if(P[he]===":"&&P[ye]==="[")return{start:ye,end:So(P,ye,{skipComment:Co,...q})}}ee=ce;continue}if(P[ee]==="{"||P[ee]==="[")V++;if(P[ee]==="}"||P[ee]==="]")V--;ee++}return}var Nt="cc-safety-net@cc-marketplace",wr=["cc-marketplace","cc-safety-net"],sa=["_direct","copilot-safety-net"],aa=["cc-marketplace","safety-net"],la="safety-net@cc-marketplace";function kr(P,A){let q=A.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");return new RegExp(`(^|[^a-z0-9-])${q}([^a-z0-9-]|$)`,"m").test(P??"")}function ca(P){return kr(P,"cc-safety-net@cc-marketplace")}function da(P){return kr(P,"cc-marketplace")}function ua(P){return kr(P,"copilot-safety-net")}function pa(P){return kr(P,"safety-net@cc-marketplace")}function xr(P){if(!P?.includes("cc-safety-net"))return!1;return/(^|\s)hook\s+(?:[^\s]+\s+)*(--copilot-cli|-cp)(\s|$)/.test(P)}function ma(P,A){if(!P)return null;let q=P.match(/(\d+)\.(\d+)\.(\d+)/);if(!q)return null;let V=[Number(q[1]),Number(q[2]),Number(q[3])];for(let ee=0;ee<A.length;ee++){let ne=V[ee]??0,ce=A[ee]??0;if(ne!==ce)return ne>ce}return!0}function y2(P){return ma(P,[0,0,422])}function v2(P){return ma(P,[1,0,8])}function In(P){return P.env.get("COPILOT_HOME")||Rt(P.home,".copilot")}function Ro(P){return(P.hooks?.preToolUse??[]).some((q)=>{if(q.type!==void 0&&q.type!=="command")return!1;return xr(q.command)||xr(q.bash)||xr(q.powershell)||xr(q.exec&&[q.exec,...q.args??[]].join(" "))})}function Tn(P){return P===void 0||typeof P==="string"}function b2(P){return P===void 0||Array.isArray(P)&&P.every((A)=>typeof A==="string")}function L2(P){if(!P||typeof P!=="object"||Array.isArray(P))return!1;let A=P;if(A.disableAllHooks!==void 0&&typeof A.disableAllHooks!=="boolean")return!1;if(A.hooks===void 0)return!0;if(!A.hooks||typeof A.hooks!=="object"||Array.isArray(A.hooks))return!1;let q=A.hooks.preToolUse;if(q===void 0)return!0;return Array.isArray(q)&&q.every((V)=>V!==null&&typeof V==="object"&&!Array.isArray(V)&&Tn(V.type)&&Tn(V.command)&&Tn(V.bash)&&Tn(V.powershell)&&Tn(V.exec)&&b2(V.args))}function Po(P,A){try{let q=JSON.parse(_t(h2(P,"utf-8")));if(!L2(q)){A?.push(`Invalid hook config ${P}: hooks.preToolUse must be an array of hook objects`);return}return q}catch(q){A?.push(`Failed to parse ${P}: ${q instanceof Error?q.message:String(q)}`);return}}function ga(P,A){try{return g2(P).filter((q)=>q.endsWith(".json")).sort((q,V)=>q.localeCompare(V))}catch(q){return A?.push(`Failed to read ${P}: ${q instanceof Error?q.message:String(q)}`),[]}}function w2(P,A){if(!Cr(P))return[];let q=[];for(let V of ga(P,A)){let ee=Rt(P,V),ne=Po(ee,A);if(ne&&Ro(ne))q.push(ee)}return q}function vn(P,A){if(!Cr(P))return;let q=Po(P,A);if(!q)return;return{path:P,config:q}}function fa(P,A,q,V){if(A){P.push(`GitHub Copilot CLI ${A} does not support ${q}; requires ${V}+`);return}P.push(`GitHub Copilot CLI version unavailable; skipping ${q} because it requires ${V}+`)}function k2(P){for(let A of P){if(A?.config.disableAllHooks===!0)return A.path;if(A?.config.disableAllHooks===!1)return}return}function x2(P,A,q,V){let ee=In(P),ne=Rt(A,".github","hooks"),ce=Rt(ee,"hooks"),he=Rt(A,".github","copilot"),ye=Rt(A,".claude"),be=v2(q),xe=be===!0?V:void 0,Ie=[vn(Rt(he,"settings.local.json"),xe),vn(Rt(he,"settings.json"),xe),vn(Rt(ye,"settings.local.json"),xe),vn(Rt(ye,"settings.json"),xe)],Xe=[vn(Rt(ee,"settings.json"),xe),vn(Rt(ee,"config.json"),xe)];if(be!==!1){let gt=k2([...Ie,...Xe]);if(gt){if(be===null)V.push(`GitHub Copilot CLI version unavailable; treating disableAllHooks in ${gt} as active`);return{activeConfigPaths:[],repoInlineSources:Ie,disabledBy:gt}}}let et=w2(ne,V),Re=y2(q),at=Re===!0?V:void 0,ct=Cr(ce)?ga(ce,at):[],lt=[];for(let gt of ct){let ut=Rt(ce,gt),vt=Po(ut,at);if(vt&&Ro(vt))lt.push(ut)}if(Re!==!0&&lt.length>0)fa(V,q,`user hook files in ${ce}`,"0.0.422"),lt.length=0;let ft=[];for(let gt of[...Ie,...Xe]){if(!gt)continue;if(!Ro(gt.config))continue;if(be===!0){ft.push(gt);continue}fa(V,q,"inline hook definitions in Copilot config files","1.0.8");break}let mt=(gt)=>gt.filter((ut)=>!!ut&&ft.includes(ut)).map((ut)=>ut.path);return{activeConfigPaths:[...mt(Ie),...et,...mt(Xe),...lt],repoInlineSources:Ie}}function ha(P){let A=[],q=x2(P.environment,P.cwd,P.copilotCliVersion,A);if(q.disabledBy)return{platform:"copilot-cli",status:"disabled",method:"hook config",configPath:q.disabledBy,configPaths:[q.disabledBy],errors:A.length>0?A:void 0};let V=In(P.environment),ee=Rt(V,"installed-plugins",...wr),ne=Cr(ee),ce=Rt(V,"settings.json"),he=Ft(ce,_t),ye=(et)=>pt(pt(et,"enabledPlugins"),Nt),be=q.repoInlineSources.find((et)=>typeof ye(et?.config)==="boolean"),xe=be??(he.kind==="ok"?{path:ce,config:he.value}:void 0);if(ne&&!be&&he.kind==="unreadable")return{platform:"copilot-cli",status:"not-inspected"};let Ie=ne&&xe!==void 0&&ye(xe.config)===!1;if(Ie&&q.activeConfigPaths.length===0)return{platform:"copilot-cli",status:"disabled",method:"plugin config",configPath:xe.path,errors:[`${Nt} is installed but not enabled in Copilot CLI`]};let Xe=ne&&!Ie;if(Xe||q.activeConfigPaths.length>0){let et=q.activeConfigPaths[0];return{platform:"copilot-cli",status:"configured",method:Xe?"plugin config":"hook config",configPath:et??(Xe?ee:void 0),configPaths:q.activeConfigPaths.length>0?q.activeConfigPaths:void 0,errors:A.length>0?A:void 0}}return{platform:"copilot-cli",status:"n/a",errors:A.length>0?A:void 0}}import{existsSync as I2,readFileSync as $2}from"node:fs";import{existsSync as ya,mkdirSync as R2,readFileSync as P2}from"node:fs";import{dirname as E2,join as D2}from"node:path";import{renameSync as C2,writeFileSync as S2}from"node:fs";function kt(P,A){let q=`${P}.${process.pid}.tmp`;S2(q,A),C2(q,P)}var jt=Object.fromEntries(En.map((P)=>[P.id,`npx -y cc-safety-net hook ${P.flags[1]}`]));var $n=jt.cursor,va=30;function Rr(P){return D2(P.home,".cursor","hooks.json")}function tn(P){return typeof P==="object"&&P!==null&&!Array.isArray(P)}function Eo(){return{command:$n,timeout:va,failClosed:!0}}function Sr(P){return tn(P)&&P.command===$n}function A2(P){return Object.keys(P).length===3&&P.command===$n&&P.timeout===va&&P.failClosed===!0}function _2(P){try{return JSON.parse(P2(P,"utf-8"))}catch(A){if(A instanceof SyntaxError)throw Error(`Failed to parse Cursor hooks config ${P}: ${A.message}`);throw A}}function ba(P){let A=_2(P);if(!tn(A))throw Error(`Cursor hooks config ${P} must be a JSON object`);if(A.version!==1)throw Error(`Cursor hooks config ${P} must set "version": 1`);if(A.hooks!==void 0&&!tn(A.hooks))throw Error(`Cursor hooks config ${P} "hooks" must be an object`);let q=tn(A.hooks)?A.hooks.preToolUse:void 0;if(q!==void 0&&!Array.isArray(q))throw Error(`Cursor hooks config ${P} "hooks.preToolUse" must be an array`);return A}function La(P){let A=tn(P.hooks)?P.hooks.preToolUse:void 0;return Array.isArray(A)?A:[]}function T2(P){if(!P.some(Sr))return[...P,Eo()];return P.reduce((A,q)=>{if(!Sr(q))return A.result.push(q),A;if(!A.inserted)A.result.push(Eo()),A.inserted=!0;return A},{result:[],inserted:!1}).result}function wa(P,A,q){let V=tn(A.hooks)?A.hooks:{},ee={...A,hooks:{...V,preToolUse:q}};kt(P,`${JSON.stringify(ee,null,2)}
`)}function ka(P){let A=Rr(P);if(!ya(A))return R2(E2(A),{recursive:!0}),kt(A,`${JSON.stringify({version:1,hooks:{preToolUse:[Eo()]}},null,2)}
`),{path:A,alreadyInstalled:!1};let q=ba(A),V=La(q),ee=V.filter(Sr);if(tn(q.hooks)&&Array.isArray(q.hooks.preToolUse)&&ee.length===1&&ee[0]!==void 0&&A2(ee[0]))return{path:A,alreadyInstalled:!0};return wa(A,q,T2(V)),{path:A,alreadyInstalled:!1}}function xa(P){let A=Rr(P);if(!ya(A))return{path:A,alreadyInstalled:!1};let q=ba(A),V=La(q),ee=V.filter((ne)=>!Sr(ne));if(ee.length===V.length)return{path:A,alreadyInstalled:!1};return wa(A,q,ee),{path:A,alreadyInstalled:!0}}function O2(P){if(!P||typeof P!=="object"||Array.isArray(P))return[];let A=P.hooks;if(!A||typeof A!=="object"||Array.isArray(A))return[];let q=A.preToolUse;if(!Array.isArray(q))return[];return q.filter((V)=>!!V&&typeof V==="object"&&!Array.isArray(V)&&V.command===$n)}function F2(P){let A=[];if(P.length>1)A.push("Multiple managed cc-safety-net hooks found; reinstall to collapse duplicates");let q=P[0];if(q&&q.failClosed!==!0)A.push('Managed hook is missing "failClosed": true; reinstall to repair');if(q&&q.timeout!==30)A.push('Managed hook "timeout" is not 30; reinstall to repair');return A}function Ca(P){let A=Rr(P.environment);if(!I2(A))return{platform:"cursor",status:"n/a",configPath:A};let q;try{q=JSON.parse($2(A,"utf-8"))}catch(ne){return{platform:"cursor",status:"n/a",configPath:A,errors:[`Failed to parse Cursor hooks config ${A}: ${ne instanceof Error?ne.message:String(ne)}`]}}let V=O2(q);if(V.length===0)return{platform:"cursor",status:"n/a",configPath:A};let ee=F2(V);return{platform:"cursor",status:"configured",method:"hook config",configPath:A,errors:ee.length>0?ee:void 0}}import{existsSync as N2}from"node:fs";import{join as Do}from"node:path";var Ao="gemini-safety-net";function _o(P){let A=Do(P.home,".gemini","extensions"),q=Do(A,Ao);if(!N2(q))return{platform:"gemini-cli",status:"n/a"};let V=Do(A,"extension-enablement.json"),ee=Ft(V);if(ee.kind==="unreadable")return{platform:"gemini-cli",status:"not-inspected"};let ne=ee.kind==="ok"?pt(pt(ee.value,Ao),"overrides"):void 0;if(Array.isArray(ne)&&ne.some((he)=>typeof he==="string"&&he.startsWith("!")))return{platform:"gemini-cli",status:"disabled",method:"extension config",configPath:V,errors:[`${Ao} is disabled in Gemini CLI`]};return{platform:"gemini-cli",status:"configured",method:"extension config",configPath:q}}function Sa(P){return _o(P.environment)}import{existsSync as U2,readFileSync as G2}from"node:fs";import{existsSync as Pa,mkdirSync as j2,readFileSync as Ea,rmSync as M2}from"node:fs";import{dirname as H2,join as Ra}from"node:path";var On=jt["grok-build"],Dr=30;function Ar(P){return Ra(P.env.get("GROK_HOME")??Ra(P.home,".grok"),"hooks","cc-safety-net.json")}function nn(P){return typeof P==="object"&&P!==null&&!Array.isArray(P)}function Pr(){return{hooks:[{type:"command",command:On,timeout:Dr}]}}function Da(P){return nn(P)&&P.command===On}function Aa(P){return P.flatMap((A)=>{if(!nn(A)||!Array.isArray(A.hooks))return[A];let q=A.hooks.filter((V)=>!Da(V));if(q.length===A.hooks.length)return[A];return q.length===0?[]:[{...A,hooks:q}]})}function _a(P){try{let A=JSON.parse(P);return nn(A)?A:null}catch{return null}}function Ta(P){let A=nn(P.hooks)?P.hooks.PreToolUse:void 0;return Array.isArray(A)?A:[]}function Er(P,A,q){let V=nn(A.hooks)?A.hooks:{};kt(P,`${JSON.stringify({...A,hooks:{...V,PreToolUse:q}},null,2)}
`)}function Ia(P){let A=Ar(P);if(!Pa(A))return j2(H2(A),{recursive:!0}),Er(A,{},[Pr()]),{path:A,alreadyInstalled:!1};let q=_a(Ea(A,"utf-8"));if(!q)return Er(A,{},[Pr()]),{path:A,alreadyInstalled:!1};let V=Ta(q),ee=V.filter((ne)=>nn(ne)&&Array.isArray(ne.hooks)&&ne.hooks.some(Da));if(ee.length===1&&JSON.stringify(ee[0])===JSON.stringify(Pr()))return{path:A,alreadyInstalled:!0};return Er(A,q,[...Aa(V),Pr()]),{path:A,alreadyInstalled:!1}}function $a(P){let A=Ar(P);if(!Pa(A))return{path:A,alreadyInstalled:!1};let q=_a(Ea(A,"utf-8"));if(!q)return{path:A,alreadyInstalled:!1};let V=Ta(q),ee=Aa(V);if(JSON.stringify(ee)===JSON.stringify(V))return{path:A,alreadyInstalled:!1};let ne=nn(q.hooks)?q.hooks:{};if(ee.length===0&&Object.keys(q).length===1&&Object.keys(ne).length===1)return M2(A),{path:A,alreadyInstalled:!0};return Er(A,q,ee),{path:A,alreadyInstalled:!0}}function Fn(P){return!!P&&typeof P==="object"&&!Array.isArray(P)}function B2(P){if(!Fn(P)||!Fn(P.hooks))return[];let A=P.hooks.PreToolUse;if(!Array.isArray(A))return[];return A.filter((q)=>Fn(q)&&Array.isArray(q.hooks)&&q.hooks.some((V)=>Fn(V)&&V.command===On))}function q2(P){let q=(Array.isArray(P.hooks)?P.hooks.filter(Fn):[]).find((V)=>V.command===On);return[...P.matcher===void 0||P.matcher===""||P.matcher==="*"?[]:['Managed hook has a "matcher" that narrows coverage; reinstall to repair'],...q?.type==="command"?[]:['Managed hook "type" is not "command"; reinstall to repair'],...q?.timeout===Dr?[]:[`Managed hook "timeout" is not ${Dr}; reinstall to repair`]]}function Oa(P){let A=Ar(P.environment);if(!U2(A))return{platform:"grok-build",status:"n/a",configPath:A};let q;try{q=JSON.parse(G2(A,"utf-8"))}catch(ne){return{platform:"grok-build",status:"n/a",configPath:A,errors:[`Failed to parse Grok Build hooks config ${A}: ${ne instanceof Error?ne.message:String(ne)}`]}}let V=B2(q)[0];if(!V)return{platform:"grok-build",status:"n/a",configPath:A};let ee=q2(V);return{platform:"grok-build",status:"configured",method:"hook config",configPath:A,errors:ee.length>0?ee:void 0}}import{readFileSync as qa}from"node:fs";import{join as Va}from"node:path";var It="cc-safety-net",To="# cc-safety-net managed Hermes Agent plugin. Do not edit. Reinstall with: npx -y cc-safety-net install --hermes-agent",V2=30;function Fa(P){return`${To}
# version: ${P}
`}function z2(P){return`${Fa(P)}name: ${It}
version: "${P}"
description: "Block destructive commands and secret-file access before Hermes runs a tool."
author: "cc-safety-net"
provides_hooks:
  - pre_tool_call
`}function J2(P){return`${Fa(P)}"""CC Safety Net guard for Hermes Agent.

Registers pre_tool_call and forwards the tool call to the packaged CC Safety Net
adapter (cc-safety-net hook --hermes-agent) over JSON stdin. The adapter prints nothing
when the call is allowed and an {"action": "block", ...} directive when it is denied.
Every transport and analysis failure is returned as a block that names its cause.
"""

import json
import os
import shutil
import signal
import subprocess

HOOK_EVENT = "pre_tool_call"
SUPPORTED_TOOLS = ("patch", "read_file", "terminal", "write_file")
ANALYZER = [${jt["hermes-agent"].split(" ").map((A)=>`"${A}"`).join(", ")}]
TIMEOUT_SECONDS = ${V2}


def _block(detail):
    return {"action": "block", "message": "CC Safety Net failed closed: " + detail}


def _terminal_cwd(task_id):
    """Return the directory Hermes will run this terminal command in.

    A \`terminal\` call without \`workdir\` runs in the session's own cwd RECORD, not in the
    Hermes process directory: \`_resolve_command_cwd\` in tools/terminal_tool.py returns
    \`workdir or get_session_cwd(session_key) or default_cwd\`, and that record is rewritten
    after every completed command, so it IS the session's \`cd\` state. The session key is
    derived exactly as terminal_tool derives it: the contextvar when set, the raw task_id
    otherwise. No record yet (first command of a session) means \`default_cwd\`, which the local
    terminal backend reads from \`TERMINAL_CWD\` (\`hermes_cli/config.py\` bridges the configured
    \`terminal.cwd\` into it) and only then falls back to the process directory.
    """
    from tools.approval import get_current_session_key
    from tools.terminal_tool import get_session_cwd

    return (
        get_session_cwd(get_current_session_key(default="") or (task_id or ""))
        or os.environ.get("TERMINAL_CWD")
        or os.getcwd()
    )


def _file_tool_cwd(task_id):
    """Return the directory Hermes resolves this file tool's relative paths against.

    tools/file_tools.py passes \`task_id or "default"\` to \`_resolve_base_dir\`, which walks the
    session's cwd record, the task's cwd override, \`TERMINAL_CWD\`, then the process directory.
    tools.file_tools defines it up to v2026.8.31 and re-exports it from tools.file_tools_paths since.
    """
    from tools.file_tools import _resolve_base_dir

    return str(_resolve_base_dir(task_id or "default"))


def _pre_tool_call(tool_name="", args=None, session_id="", task_id="", **_):
    if tool_name not in SUPPORTED_TOOLS:
        return None

    executable = shutil.which(ANALYZER[0])
    if executable is None:
        return _block(ANALYZER[0] + " was not found on PATH.")

    try:
        cwd = _terminal_cwd(task_id) if tool_name == "terminal" else _file_tool_cwd(task_id)
    except OSError as error:
        return _block("the working directory could not be resolved (%s)." % error)
    except ImportError as error:
        # Without Hermes' own directory lookup we cannot tell which directory the call acts in,
        # and analysing the wrong one clears every path-scoped protection.
        return _block(
            "the Hermes %s directory could not be read (%s). Update cc-safety-net and "
            "reinstall the plugin with: npx -y cc-safety-net install --hermes-agent."
            % ("session" if tool_name == "terminal" else "file tool", error)
        )

    payload = json.dumps(
        {
            "hook_event_name": HOOK_EVENT,
            "tool_name": tool_name,
            "tool_input": args if isinstance(args, dict) else None,
            "session_id": session_id if isinstance(session_id, str) else "",
            "cwd": cwd,
        }
    )

    try:
        if os.name == "nt":
            launch_options = {}
        else:
            launch_options = {"start_new_session": True}
        process = subprocess.Popen(
            [executable] + ANALYZER[1:],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            # Decode explicitly: the analyzer writes UTF-8, and a locale decoder would raise
            # UnicodeDecodeError on output it cannot read. "replace" turns that into unreadable
            # output, which blocks with its cause named.
            encoding="utf-8",
            errors="replace",
            # Resolve the analyzer from a neutral directory: npx prefers a repository-local
            # node_modules/.bin/cc-safety-net, so inheriting Hermes' working directory would
            # let workspace contents stand in for the analyzer. The payload's "cwd" above is
            # still the real Hermes working directory, which the analysis needs.
            cwd=os.path.expanduser("~"),
            # Own process group so the timeout below can kill the whole tree: npx's descendants
            # outlive a kill aimed at npx alone and keep holding the pipes captured here. Windows
            # uses taskkill's process-tree traversal instead because sessions are POSIX-only.
            **launch_options,
        )
    except OSError as error:
        return _block("analysis could not start (%s)." % error)

    try:
        stdout, _ = process.communicate(payload, timeout=TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        try:
            if os.name == "nt":
                system_root = os.environ.get("SystemRoot")
                if not system_root:
                    raise OSError("SystemRoot is unavailable")
                subprocess.run(
                    [
                        os.path.join(system_root, "System32", "taskkill.exe"),
                        "/PID",
                        str(process.pid),
                        "/T",
                        "/F",
                    ],
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=1,
                    check=False,
                )
            else:
                os.killpg(process.pid, signal.SIGKILL)
        except (OSError, subprocess.SubprocessError):
            pass
        try:
            process.communicate(timeout=1)
        except (OSError, subprocess.SubprocessError):
            pass
        return _block("analysis timed out after %ss." % TIMEOUT_SECONDS)

    if process.returncode != 0:
        return _block("analysis exited with status %s." % process.returncode)

    directive = (stdout or "").strip()
    if not directive:
        return None

    try:
        parsed = json.loads(directive)
    except ValueError:
        return _block("analysis returned unreadable output.")

    if isinstance(parsed, dict) and parsed.get("action") == "block":
        message = parsed.get("message")
        if isinstance(message, str) and message:
            return parsed
    return _block("analysis returned an unexpected directive.")


def register(ctx):
    ctx.register_hook("pre_tool_call", _pre_tool_call)
`}function Nn(P){return[{name:"__init__.py",content:J2(P)},{name:"plugin.yaml",content:z2(P)}]}import{mkdirSync as W2,readdirSync as K2,readFileSync as Na,rmSync as Io}from"node:fs";import{basename as Y2,dirname as X2,join as Bt}from"node:path";var Z2="__pycache__",Q2=/^[a-z0-9][a-z0-9_-]{0,63}$/;function ef(P){try{return Na(P,"utf-8").trim()}catch{return}}function $o(P){let A=P.env.get("HERMES_HOME")?.trim();if(A&&Y2(X2(A))==="profiles")return A;let q=A||Bt(P.home,".hermes"),V=Bt(q,"active_profile"),ee=ef(V),ne=ee?.toLowerCase();if(!ne||ne==="default")return q;if(!Q2.test(ne))throw Error(`Invalid Hermes profile name "${ee}" in ${V}; run \`hermes profile use <name>\` with a valid profile.`);return Bt(q,"profiles",ne)}function Oo(P){return Bt($o(P),"plugins",It)}function Fo(P){return P.startsWith(To)}function No(P,A){let q=Oo(P),V=Lt(q);if(V&&(V.isSymbolicLink()||!V.isDirectory()))throw Error(`Refusing to ${A} ${q}: not a regular directory. Move or remove it and rerun ${A==="install"?"install":"uninstall"} --hermes-agent.`);return q}function ja(P,A){let q=Lt(P);if(!q)return;if(q.isSymbolicLink()||!q.isFile())throw Error(`Refusing to ${A} ${P}: not a regular file. Move or remove it.`);let V=Na(P,"utf-8");if(!Fo(V))throw Error(`Refusing to ${A} unmanaged file at ${P}. Move or remove it.`);return V}function Ma(P){let A=No(P,"install"),q=Nn(wt());if(q.map((ee)=>ja(Bt(A,ee.name),"overwrite")).every((ee,ne)=>ee===q[ne]?.content))return{path:A,alreadyInstalled:!0};return W2(A,{recursive:!0}),q.forEach((ee)=>{kt(Bt(A,ee.name),ee.content)}),{path:A,alreadyInstalled:!1}}function jo(P){let A=No(P,"remove");if(!Lt(A))return[];return Nn(wt()).filter((q)=>ja(Bt(A,q.name),"remove")!==void 0)}function Ha(P){let A=No(P,"remove");if(!Lt(A))return{path:A,alreadyInstalled:!1};let q=jo(P);if(q.forEach((V)=>{Io(Bt(A,V.name))}),Io(Bt(A,Z2),{recursive:!0,force:!0}),K2(A).length===0)Io(A,{recursive:!0});return{path:A,alreadyInstalled:q.length>0}}var jn="hermes-agent",Ua=/^([^\s#][^:]*):/,tf=/^\s+([A-Za-z_][\w-]*):/,Ga=/^\s+-\s*(.*)$/;function nf(P){return P.trim().replace(/^(["'])(.*)\1$/,"$2")}function rf(P){let A=P.split(/\r?\n/),q=A.findIndex((ne)=>Ua.exec(ne)?.[1]?.trim()==="plugins");if(q===-1)return[];let V=A.slice(q+1),ee=V.findIndex((ne)=>Ua.test(ne));return ee===-1?V:V.slice(0,ee)}function Ba(P,A){let q=rf(P),V=q.findIndex((ce)=>tf.exec(ce)?.[1]===A);if(V===-1)return[];let ee=q.slice(V+1),ne=ee.findIndex((ce)=>!Ga.test(ce));return(ne===-1?ee:ee.slice(0,ne)).map((ce)=>nf(Ga.exec(ce)?.[1]??""))}function of(P){try{return qa(Va($o(P),"config.yaml"),"utf-8")}catch{return}}function Mo(P){let A=of(P)??"";return Ba(A,"enabled").includes(It)&&!Ba(A,"disabled").includes(It)}function za(P){return/^# version:\s*(.+)$/m.exec(P)?.[1]?.trim()}function sf(P,A){let q=Lt(P);if(!q)return{error:`${A.name} is missing from ${P}; run install --hermes-agent`};if(q.isSymbolicLink()||!q.isFile())return{error:`${P} is a symlink or not a regular file; move or remove it`};try{let V=qa(P,"utf-8");if(!Fo(V))return{error:`Unmanaged ${A.name} occupies ${P}; move or remove it`};if(za(V)===wt()&&V!==A.content)return{error:`Modified ${A.name} occupies ${P}; run install --hermes-agent to restore it`};return{content:V}}catch(V){return{error:`Failed to read ${P}: ${V instanceof Error?V.message:String(V)}`}}}function af(P){try{return{path:Oo(P)}}catch(A){return{error:A instanceof Error?A.message:String(A)}}}function Ja(P){let A=af(P.environment);if("error"in A)return{platform:jn,status:"n/a",errors:[A.error]};let q=A.path,V=yr(jn,q);if(V)return V;let ee=Nn(wt()).map((ye)=>sf(Va(q,ye.name),ye)),ne=ee.flatMap((ye)=>("error"in ye)?[ye.error]:[]);if(ne.length>0)return{platform:jn,status:"n/a",configPath:q,errors:ne};let ce=ee.some((ye)=>("content"in ye)&&za(ye.content)!==wt()),he=ce?["Installed Hermes Agent plugin is outdated; run install --hermes-agent to update"]:[];if(!Mo(P.environment))return{platform:jn,status:"disabled",method:"plugin directory",configPath:q,errors:[`${It} is not enabled in Hermes; run \`hermes plugins enable ${It}\``,...he]};return{platform:jn,status:"configured",method:"plugin directory",configPath:q,errors:ce?he:void 0}}import{existsSync as lf,readFileSync as cf}from"node:fs";import{join as Wa}from"node:path";var df=/cc-safety-net\s+hook\s+(?:[^\s]+\s+)*--kimi-code(\s|["']|$)/;function uf(P){return Wa(P.env.get("KIMI_CODE_HOME")||Wa(P.home,".kimi-code"),"config.toml")}function Mn(P){let A=uf(P.environment);if(!lf(A))return{platform:"kimi-code",status:"n/a",configPath:A};try{if(!df.test(cf(A,"utf-8")))return{platform:"kimi-code",status:"n/a",configPath:A}}catch(q){return{platform:"kimi-code",status:"n/a",configPath:A,errors:[`Failed to read ${A}: ${q instanceof Error?q.message:String(q)}`]}}return{platform:"kimi-code",status:"configured",method:"hook config",configPath:A}}import{readFileSync as ol}from"node:fs";import{join as Un}from"node:path";var yt="cc-safety-net",Tt="index.js",bn="openclaw.plugin.json",Ln="package.json";var _r="// cc-safety-net managed OpenClaw plugin. Do not edit. Reinstall with: npx -y cc-safety-net install --openclaw";import{existsSync as mf,lstatSync as gf,readdirSync as hf,readFileSync as yf}from"node:fs";import{dirname as Ya,join as Kt}from"node:path";import{fileURLToPath as vf}from"node:url";import{spawn as pf}from"node:child_process";function ff(P){return P.join(" ")}function Ho(P,A,q){return[`Failed to run ${ff(P)}${A===null?"":` (exit ${A})`}.`,q.trim()].filter(Boolean).join(`
`)}function Uo(P){let A={stdout:"",stderr:""};return P.stdout.setEncoding("utf-8"),P.stderr.setEncoding("utf-8"),P.stdout.on("data",(q)=>{A.stdout+=q}),P.stderr.on("data",(q)=>{A.stderr+=q}),A}function St(P,A){return new Promise((q,V)=>{let ee=Qt([...P],process.env),ne=pf(ee.cmd,ee.args,{stdio:["ignore","pipe","pipe"]}),ce=Uo(ne),he=()=>[ce.stdout,ce.stderr].filter(Boolean).join(`
`),ye=A?.timeoutMs??120000,be=setTimeout(()=>{ne.kill(),V(Error(Ho(P,null,`Timed out after ${ye}ms.
${he()}`.trim())))},ye);ne.on("error",(xe)=>{clearTimeout(be),V(Error(Ho(P,null,`${xe.message}
${he()}`.trim())))}),ne.on("close",(xe)=>{if(clearTimeout(be),xe!==0){V(Error(Ho(P,xe,he())));return}q(A?.stdoutOnly?ce.stdout:he())})})}async function Go(P){for(let A of P)await St(A)}async function Ka(P){for(let A of P)try{await St(A)}catch(q){console.warn(q instanceof Error?q.message:String(q))}}var Bo=Kt("openclaw",yt),rn=`run \`openclaw plugins enable ${yt}\``,bf="config reload superseded by a newer runtime config source",Lf=[Tt,bn,Ln];function Xa(P){let A=P.env.get("OPENCLAW_HOME")?.trim();return A?en(A,P.home):P.home}function Za(P){let A=Xa(P),q=P.env.get("OPENCLAW_STATE_DIR")?.trim();if(q)return en(q,A);let V=P.env.get("OPENCLAW_CONFIG_PATH")?.trim();return V?Ya(en(V,A)):Kt(A,".openclaw")}function Qa(P){let A=P.env.get("OPENCLAW_CONFIG_PATH")?.trim();return A?en(A,Xa(P)):Kt(Za(P),"openclaw.json")}function Hn(P){return Kt(Za(P),"extensions",yt)}function wf(P){let A=hf(P);if(A.length===0)return!0;if(A.some((ee)=>!Lf.includes(ee)))return!1;let q=Kt(P,Tt),V=Lt(q);return V!==void 0&&!V.isSymbolicLink()&&V.isFile()&&yf(q,"utf-8").startsWith(_r)}function qo(P){let A=Hn(P),q=Lt(A);if(!q)return;if(!q.isSymbolicLink()&&q.isDirectory()&&wf(A))return;throw Error(`Refusing to modify ${A}: it does not hold a cc-safety-net managed OpenClaw plugin. Move or remove it, then run the command again.`)}function el(){let P=Ya(vf(import.meta.url));return[Kt(P,Bo),Kt(P,"..",Bo),Kt(P,"..","..","..","dist",Bo)]}function Vo(P=el()){return P.find((A)=>mf(A)&&gf(A).isDirectory())}function kf(P=el()){let A=Vo(P);if(!A)throw Error("Packaged OpenClaw plugin directory not found. Reinstall cc-safety-net and try again.");return A}function tl(P=kf()){return[["openclaw","plugins","install",P,"--force","--accept-capabilities"]]}function xf(P){let A=(()=>{try{return JSON.parse(P)}catch{return}})(),q=pt(pt(A,"plugin"),"status");return typeof q==="string"?q:void 0}async function Cf(){await St(["openclaw","plugins","enable",yt]).catch((P)=>{if(!(P instanceof Error&&P.message.includes(bf)))throw P})}async function nl(P){let A=async()=>xf(await St(["openclaw","plugins","inspect",yt,"--runtime","--json"],{stdoutOnly:!0})),q=await A(),V=q==="disabled"&&P;if(V)await Cf();let ee=V?await A():q;if(ee==="loaded")return;throw Error(`${ee===void 0?`The ${yt} plugin's load state could not be verified: OpenClaw's runtime inspect report was unreadable.`:ee==="disabled"?`OpenClaw reports the ${yt} plugin with status "disabled"; ${rn}.`:`OpenClaw reports the ${yt} plugin with status "${ee}".`} Run \`openclaw plugins inspect ${yt} --runtime\` for details.`)}var Tr="openclaw";function wn(P,A){let q=Un(P,A),V=Lt(q);if(!V)return{error:`${A} is missing from ${q}; run install --openclaw`};if(V.isSymbolicLink()||!V.isFile())return{error:`${q} is a symlink or not a regular file; move or remove it`};try{return{content:ol(q,"utf-8")}}catch(ee){return{error:`Failed to read ${q}: ${ee instanceof Error?ee.message:String(ee)}`}}}function il(P){try{return JSON.parse(_t(P))}catch{return}}function Sf(P){let A=wn(P,bn);if("error"in A)return A.error;if(pt(il(A.content),"id")===yt)return;return`${Un(P,bn)} is not a valid ${yt} manifest; run install --openclaw`}function Rf(P){let A=wn(P,Ln);if("error"in A)return A.error;let q=pt(pt(il(A.content),"openclaw"),"extensions");if(Array.isArray(q)&&q.includes(`./${Tt}`))return;return`${Un(P,Ln)} does not point OpenClaw at ${Tt}; run install --openclaw`}function rl(P){return Array.isArray(P)?P.filter((A)=>typeof A==="string"):[]}function Pf(P){let A=Qa(P);if(!Lt(A))return`${yt} is not enabled; ${rn}`;let q=(()=>{try{return JSON.parse(_t(ol(A,"utf-8")))}catch{return}})();if(q===void 0)return`Failed to read ${A}; fix it, then ${rn}`;let V=pt(q,"plugins");if(pt(V,"enabled")===!1)return`plugins.enabled is false in ${A}; no OpenClaw plugin loads`;let ee=pt(pt(pt(V,"entries"),yt),"enabled");if(rl(pt(V,"deny")).includes(yt)||ee===!1)return`${yt} is disabled in ${A}; ${rn}`;let ne=rl(pt(V,"allow"));if(ne.length>0&&!ne.includes(yt))return`plugins.allow in ${A} does not list ${yt}; add it, then ${rn}`;if(ne.includes(yt)||ee===!0)return;return`${yt} is not enabled; ${rn}`}function sl(P){return/^\/\/ version:\s*(.+)$/m.exec(P)?.[1]?.trim()}function Ef(P,A,q){if(q===void 0)return[];let V=wn(q,Tt);if(!(("content"in V)&&sl(V.content)===A))return[];return[Tt,bn,Ln].flatMap((ne)=>{let ce=wn(P,ne),he=wn(q,ne);if("error"in ce||"error"in he||ce.content===he.content)return[];return[`Modified ${ne} occupies ${Un(P,ne)}; run install --openclaw to restore it`]})}function al(P){let A=Hn(P.environment),q=yr(Tr,A);if(q)return q;let V=wn(A,Tt),ne=["error"in V?V.error:V.content.startsWith(_r)?void 0:`Unmanaged ${Tt} occupies ${Un(A,Tt)}; move or remove it`,Sf(A),Rf(A)].filter((xe)=>xe!==void 0),ce="content"in V?sl(V.content):void 0,he=ne.length>0?ne:Ef(A,ce,Vo());if(he.length>0)return{platform:Tr,status:"n/a",configPath:A,errors:he};let ye=ce===wt()?[]:["Installed OpenClaw plugin is outdated; run install --openclaw to update"],be=Pf(P.environment);if(be)return{platform:Tr,status:"disabled",method:"plugin directory",configPath:A,errors:[be,...ye]};return{platform:Tr,status:"configured",method:"plugin directory",configPath:A,errors:ye.length>0?ye:void 0}}import{existsSync as Nf,readFileSync as jf}from"node:fs";import{basename as Mf}from"node:path";import{existsSync as Ir,readFileSync as zo,rmSync as Df}from"node:fs";import{join as Mt}from"node:path";import{pathToFileURL as Af}from"node:url";var Gn="cc-safety-net",on=`${Gn}@latest`,Jo=["opencode.json","opencode.jsonc"],_f=60,Tf=250,ll="CCSafetyNetPlugin",If={stringError:"Unterminated string in OpenCode config",bracketError:"Unmatched plugin array in OpenCode config"};function cl(P){return Mt(P.env.get("XDG_CONFIG_HOME")||Mt(P.home,".config"),"opencode")}function Wo(P){return P.env.get("OPENCODE_CONFIG_DIR")||cl(P)}function Ko(P){return Jo.map((A)=>Mt(Wo(P),A))}function Yo(P){return[...new Set([Wo(P),cl(P)])].flatMap((A)=>Jo.map((q)=>Mt(A,q)))}function dl(P){return Mt(P.env.get("XDG_CACHE_HOME")||Mt(P.home,".cache"),"opencode","packages",on)}function ul(P){Df(dl(P),{recursive:!0,force:!0})}async function pl(P){let A=(await St(["opencode","--version"],{stdoutOnly:!0})).trim(),q=/^(?:opencode\s+)?v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(A),V=Number(q?.[1]),ee=Number(q?.[2]),ne=Number(q?.[3]);if(!q||V!==1&&V!==2||V===1&&(ee<18||ee===18&&ne<29)||V===2&&ee===0&&ne<6)throw Error(`OpenCode 1.18.29+ or 2.0.6+ is required; found ${A||"an unknown version"}.`);if(V===2){for(let ce of Ko(P)){if(!Ir(ce))continue;let he=Zo(zo(ce,"utf-8"),ce);if(["plugin","plugins"].some((be)=>{let xe=pt(he,be);return Array.isArray(xe)&&xe.some((Ie)=>$r(Ie)&&(typeof Ie==="string"?Ie:pt(Ie,"package"))!==on)}))throw Error(`Change the cc-safety-net package spec in ${ce} to ${on}, preserving its options, then retry. Adding another spec would create a duplicate plugin ID.`)}return{commands:[],afterInstall:async()=>{if((await St(["opencode","plugin","add",on],{stdoutOnly:!0})).includes("is already configured in"))await St(["opencode","plugin","update",on]);let he=await gl();if(!/^cc-safety-net\s+\S+\s+cc-safety-net@latest\s*$/m.test(he))throw Error("OpenCode did not load cc-safety-net from cc-safety-net@latest. Run `opencode plugin list` for details.");let ye=["--param",`location[directory]=${process.cwd()}`];await St(["opencode","api","integration.list",...ye]);let be=await St(["opencode","api","plugin.list",...ye],{stdoutOnly:!0}),xe=Xo(be);if(xe)throw Error(xe);if(!fl(be).some(ml))throw Error("OpenCode lists no active cc-safety-net for this directory. Run `opencode api plugin.list` for details.")}}}return ul(P),{commands:[["opencode","plugin","-g","-f",on]],afterInstall:()=>Of(P)}}function fl(P){return $f(P).filter((A)=>pt(A,"id")===Gn||$r(pt(pt(A,"source"),"target"))).map((A)=>pt(A,"state"))}function ml(P){return pt(P,"status")==="active"}function Xo(P){let A=fl(P);if(A.some(ml))return;let q=A.find((V)=>pt(V,"status")==="failed");if(!q)return;return`OpenCode reports cc-safety-net failed: ${String(pt(q,"error")).split(`
`)[0]}`}function $f(P){if(!P)return[];try{let A=pt(JSON.parse(P),"data");return Array.isArray(A)?A:[]}catch{return[]}}async function gl(P=1){let A=await St(["opencode","plugin","list"],{stdoutOnly:!0});if(/^cc-safety-net\s|\scc-safety-net@latest\s*$/m.test(A)||P===_f)return A;return await new Promise((q)=>setTimeout(q,Tf)),gl(P+1)}async function Of(P){let A=Mt(dl(P),"node_modules",Gn),q=Mt(A,"package.json");if(!Ir(q))throw Error(`The OpenCode plugin cache at ${A} is missing its package, so OpenCode would load nothing and fail open. Run \`opencode plugin -g -f ${on}\` for details.`);let V=pt(JSON.parse(zo(q,"utf-8")),"main");if(typeof V!=="string")throw Error(`The cached OpenCode plugin at ${A} declares no "main" entry.`);let ee=Mt(A,V);if(typeof(await import(Af(ee).href))[ll]==="function")return;throw Error(`The cached OpenCode plugin at ${ee} does not export a callable ${ll}, so OpenCode would load nothing and fail open.`)}function Zo(P,A){try{return JSON.parse(_t(P))}catch(q){if(q instanceof SyntaxError)throw Error(`Failed to parse OpenCode config ${A}: ${q.message}`);throw q}}function $r(P){let A=typeof P==="string"?P:pt(P,"package");return typeof A==="string"&&(A===Gn||A.startsWith(`${Gn}@`))}function Qo(P){return["plugin","plugins"].some((A)=>{let q=pt(P,A);return Array.isArray(q)&&q.some($r)})}function Ff(P,A){let V=["plugin","plugins"].flatMap((ee)=>{let ne=ia(P,ee,If);if(!ne)return[];let ce=[],he=0,ye=ne.start+1,be=P.slice(ne.start+1,ne.end).matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|[^"\s{}[\],/]+|[{}[\],]/g);for(let xe of be){if(xe[0].startsWith("//")||xe[0].startsWith("/*"))continue;let Ie=ne.start+1+xe.index;if(he===0)ye=Ie;if(xe[0]==="{"||xe[0]==="[")he++;if(xe[0]==="}"||xe[0]==="]")he--;if(he!==0||xe[0]===",")continue;let Xe=Ie+xe[0].length;if($r(JSON.parse(_t(P.slice(ye,Xe)))))ce.push({start:ye,end:Xe})}return ce}).sort((ee,ne)=>ee.start-ne.start).reverse().reduce((ee,ne)=>{let ce=/^(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*,/.exec(ee.slice(ne.end));if(ce?.[0].includes("/")){let he=ne.end+ce[0].length-1;return ee.slice(0,ne.start)+ee.slice(ne.end,he)+ee.slice(he+1)}return Lr(ee,ne)},P);return Zo(V,A),V}function hl(P){ul(P);let A=Yo(P),q=A.find((ne)=>Ir(ne)),V=[],ee=[];for(let ne of A){if(!Ir(ne))continue;try{let ce=zo(ne,"utf-8");if(!Qo(Zo(ce,ne)))continue;kt(ne,Ff(ce,ne)),ee.push(ne)}catch(ce){V.push(ce instanceof Error?ce.message:String(ce))}}if(V.length>0)throw Error(V.join(`
`));return{path:ee[0]??q??Mt(Wo(P),Jo[0]),alreadyInstalled:ee.length>0}}function kn(P){let A=[];for(let q of P.openCodeVersion?.startsWith("2.")?Ko(P.environment):Yo(P.environment))if(Nf(q))try{let V=jf(q,"utf-8"),ee=_t(V),ne=JSON.parse(ee);if(Qo(ne)){let ce=Xo(P.openCodePluginListOutput);if(ce)return{platform:"opencode",status:"disabled",method:"opencode api plugin.list",configPath:q,errors:[...A,ce]};return{platform:"opencode",status:"configured",method:"plugin array",configPath:q,errors:A.length>0?A:void 0}}}catch(V){A.push(`Failed to parse ${Mf(q)}: ${V instanceof Error?V.message:String(V)}`)}return{platform:"opencode",status:"n/a",errors:A.length>0?A:void 0}}import{join as yl}from"node:path";function ei(P){let A=P.env.get("PI_CODING_AGENT_DIR");return yl(A?en(A,P.home):yl(P.home,".pi","agent"),"settings.json")}function ti(P){if(typeof P!=="string")return!1;return P==="npm:cc-safety-net"||P.startsWith("npm:cc-safety-net@")}function vl(P){let A=ei(P.environment),q=Ft(A);if(q.kind==="unreadable")return{platform:"pi",status:"not-inspected"};if(q.kind==="missing")return{platform:"pi",status:"n/a"};let V=pt(q.value,"packages");if(!Array.isArray(V))return{platform:"pi",status:"n/a"};let ee=V.find((he)=>ti(typeof he==="string"?he:pt(he,"source")));if(ee===void 0)return{platform:"pi",status:"n/a"};let ne=pt(ee,"extensions");if(Array.isArray(ne)&&ne.some((he)=>typeof he==="string"&&he.startsWith("-")))return{platform:"pi",status:"disabled",method:"package config",configPath:A,errors:["npm:cc-safety-net is installed but its extension is disabled in Pi settings"]};return{platform:"pi",status:"configured",method:"package config",configPath:A}}var Hf={amp:Ks,"antigravity-cli":Ys,"claude-code":Qs,codex:ta,"copilot-cli":ha,cursor:Ca,"gemini-cli":Sa,"grok-build":Oa,"hermes-agent":Ja,"kimi-code":Mn,openclaw:al,opencode:kn,pi:vl};function xn(P,A,q){let V={...q,cwd:A,environment:P};return rr.map((ee)=>Uf(Hf[ee](V)))}function Uf(P){if(P.status==="not-inspected")return{platform:P.platform,detected:!1,configured:!1,inspectionStatus:"not-inspected"};return{platform:P.platform,detected:P.status!=="n/a",configured:P.status==="configured",inspectionStatus:P.status!=="n/a"?"verified":P.errors&&P.errors.length>0?"failed":"not-applicable",method:P.method,configPath:P.configPath,configPaths:P.configPaths,errors:P.errors}}import{join as Gf}from"node:path";var Bf=Object.freeze([{command:"git reset --hard",description:"git reset --hard",expectBlocked:!0},{command:"rm -rf /",description:"rm -rf /",expectBlocked:!0},{command:"rm -rf ./node_modules",description:"rm in cwd (safe)",expectBlocked:!1}]),qf=Object.freeze({state:"ready",diagnostics:Object.freeze([]),ruleMetadata:Object.freeze({}),policy:Object.freeze({rules:Object.freeze([]),transparentWrappers:Object.freeze([]),safety:Object.freeze({}),worktreeMode:!1,destructiveCommandProtectionEnabled:!0,destructiveCommandRuleOverrides:Object.freeze({}),destructiveCommandAllowPaths:Object.freeze([]),secretProtection:Object.freeze({enabled:!0,disabledRules:Object.freeze([]),denyPaths:Object.freeze([]),allowPaths:Object.freeze([])})})}),Vf={strict:!1,paranoidRm:!1,paranoidInterpreters:!1,worktreeMode:!1,effectiveLevel:"standard",capabilities:{fail_closed:{enabled:!1,source:"preset",sources:[]},paranoid_rm:{enabled:!1,source:"preset",sources:[]},paranoid_interpreters:{enabled:!1,source:"preset",sources:[]}}};function bl(P){let A=Gf(P.tmpdir,"cc-safety-net-self-test"),q=Bf.map((V)=>{let ee=N(P,d("self-test",{command:V.command},{kind:"command",shell:"auto"},{configCwd:A,executionCwd:A},V.command),{guard:{dependencies:{loadPolicySnapshot:()=>qf,getModes:()=>Vf,findPolicyMutation:()=>null}},audit:{agent:"self-test",getSessionId:()=>{return}}}),ne=V.expectBlocked?"blocked":"allowed",ce=ee.decision.kind==="deny"?"blocked":"allowed";return{command:V.command,description:V.description,expected:ne,actual:ce,passed:ne===ce,reason:ee.decision.kind==="deny"?ee.decision.reason:void 0,ruleId:ee.decision.kind==="deny"?ee.decision.ruleId:void 0}});return{passed:q.filter((V)=>V.passed).length,failed:q.filter((V)=>!V.passed).length,total:q.length,results:q}}function ni(P){let A=xt({label:"doctor",booleans:{json:["--json"],skipUpdateCheck:["--skip-update-check"]}},P);if(Ut(A.errors))return null;return{json:A.flags.json,skipUpdateCheck:A.flags.skipUpdateCheck}}async function Ll(P,A={}){let q=await An(!A.json,()=>{let V=zf(P,A);return{ready:V,finish:()=>V}},()=>Dn(),{loadingMessage:"Checking system status…"});if(A.json)console.log(JSON.stringify(q,null,2));else Jf(q);return q.engineSelfTest.failed>0||q.findings.some((V)=>V.severity==="error")?1:0}async function zf(P,A){let q=A.cwd??process.cwd(),V=await pr((at)=>kn({environment:P,cwd:q,openCodeVersion:at}).status!=="n/a",void 0,q),ee=xn(P,q,{ampPluginListOutput:V.ampPluginListOutput,codexPluginListOutput:V.codexPluginListOutput,copilotCliVersion:V.versions["copilot-cli"],openCodeVersion:V.versions.opencode,openCodePluginListOutput:V.openCodePluginListOutput}),ne=us(P,q),ce=ps(P),he=E(P,{cwd:q}),ye=he.policy,be=R(ye,P.env),xe=H(ye,be.capabilities),Ie=ar(P,7),Xe=qs(P,q),et=A.skipUpdateCheck?{currentVersion:wt(),latestVersion:null,updateAvailable:!1}:await Wt(),Re={hooks:ee,engineSelfTest:bl(P),userConfig:ne.userConfig,projectConfig:ne.projectConfig,configState:Ne(he),effectiveRules:ne.effectiveRules,environment:ce,effectiveSafety:{selectedPreset:ye.safety.level??"standard",level:be.effectiveLevel,capabilities:be.capabilities,ruleOverrides:ye.destructiveCommandRuleOverrides,weakenedRuleOverrides:Object.entries(xe).filter(([,at])=>at.source==="rule_override"&&at.override==="off"&&at.inheritedEnabled&&at.changesInherited).map(([at])=>at),ruleCounts:{stored:Object.keys(ye.destructiveCommandRuleOverrides).length,effective:Object.values(xe).filter((at)=>at.changesInherited).length},...he.policyScopes?{policyScopes:he.policyScopes}:{}},...Xe.length>0?{v2Leftovers:Xe}:{},posture:Rs(P,ne.userConfig.path),activity:Ie,update:et,system:V};return{...Re,findings:ms(Re)}}function Jf(P){console.log(),console.log(hs(P.hooks)),console.log(),console.log(ys(P.engineSelfTest)),console.log(),console.log(vs(P)),console.log(),console.log(bs(P.environment)),console.log(),console.log(Ls(P)),console.log(),console.log(ws(P.findings)),console.log(),console.log(ks(P.activity)),console.log(),console.log(Cs(P.system)),console.log(),console.log(xs(P.update)),console.log(Ss(P))}import{existsSync as Wf}from"node:fs";var Kf=/^[A-Za-z0-9_@%+=:,./-]+$/,wl="Usage: cc-safety-net explain [--json] [--cwd <path>] <command>";function ri(P){let A=xt({label:"explain",booleans:{json:["--json"]},values:{cwd:["--cwd"]},positionals:"tail"},P);if(Ut(A.errors))return console.error(wl),console.error("Pass -- before a command that starts with dashes."),null;if(A.values.cwd!==void 0&&!Wf(A.values.cwd))return console.error(`Error: --cwd path does not exist: ${A.values.cwd}`),null;let q=A.positionals.length===1?A.positionals[0]:A.positionals.map((V)=>Kf.test(V)?V:`'${V.replaceAll("'","'\\''")}'`).join(" ");if(!q)return console.error("Error: No command provided"),console.error(wl),null;return{json:A.flags.json,cwd:A.values.cwd,command:q}}function kl(P){if(P)return{dh:"=",dv:"|",dtl:"+",dtr:"+",dbl:"+",dbr:"+",h:"-",v:"|",tl:"+",tr:"+",bl:"+",br:"+",sh:"="};return{dh:"═",dv:"║",dtl:"╔",dtr:"╗",dbl:"╚",dbr:"╝",h:"─",v:"│",tl:"┌",tr:"┐",bl:"└",br:"┘",sh:"━"}}function xl(P,A){let V=A-18;return[`${P.dtl}${P.dh.repeat(A)}${P.dtr}`,`${P.dv}  Command Analysis${" ".repeat(V)}${P.dv}`,`${P.dbl}${P.dh.repeat(A)}${P.dbr}`]}function oi(P){return JSON.stringify(P)}function Cl(P,A=0){return`[${P.map((V,ee)=>gs(V,ee,A)).join(",")}]`}function Bn(P,A,q=70){let V=P.split(" "),ee=[],ne="";for(let ce of V)if(ne&&ne.length+ce.length+1>q)ee.push(ne),ne=ce;else ne=ne?`${ne} ${ce}`:ce;if(ne)ee.push(ne);return ee.map((ce,he)=>he===0?ce:`${A}${ce}`)}function Sl(P,A,q){let V=[];switch(P.type){case"parse":return null;case"env-strip":return V.push(""),V.push(`STEP ${A} ${q.h} Strip environment variables`),V.push(`  Removed: ${P.envVars.map((ee)=>`${ee}=<redacted>`).join(", ")}`),V.push(`  Tokens:  ${oi(P.output)}`),{lines:V,incrementStep:!0};case"leading-tokens-stripped":return V.push(""),V.push(`STEP ${A} ${q.h} Strip wrappers`),V.push(`  Removed: ${P.removed.join(", ")}`),V.push(`  Tokens:  ${oi(P.output)}`),{lines:V,incrementStep:!0};case"shell-wrapper":return V.push(""),V.push(`STEP ${A} ${q.h} Detect shell wrapper`),V.push(`  Wrapper: ${P.wrapper} -c`),V.push(`  Inner:   ${P.innerCommand}`),{lines:V,incrementStep:!0};case"interpreter":{if(V.push(""),V.push(`STEP ${A} ${q.h} Detect interpreter`),V.push(`  Interpreter: ${P.interpreter}`),V.push(`  Code:        ${P.codeArg}`),P.paranoidBlocked)V.push("  Result:      ✗ BLOCKED (paranoid mode)");return{lines:V,incrementStep:!0}}case"busybox":return V.push(""),V.push(`STEP ${A} ${q.h} Busybox wrapper`),V.push(`  Subcommand: ${P.subcommand}`),{lines:V,incrementStep:!0};case"transparent-wrapper":return V.push(""),V.push(`STEP ${A} ${q.h} Transparent wrapper`),V.push(`  Wrapper: ${P.wrapper}`),V.push(`  Tokens:  ${oi(P.output)}`),{lines:V,incrementStep:!0};case"recurse":return{lines:[],incrementStep:!1};case"rule-check":{if(V.push(""),V.push(`STEP ${A} ${q.h} Match rules`),V.push(`  Rule:   ${P.rule}()`),P.matched)V.push("  Result: MATCHED");else V.push("  Result: No match");return{lines:V,incrementStep:!0}}case"worktree-relaxation":return V.push(""),V.push(`STEP ${A} ${q.h} Worktree relaxation`),V.push(`  Mode:   ${o.worktree.name}`),V.push(`  Git cwd: ${P.gitCwd}`),V.push("  Result: Allowed local discard in linked worktree"),{lines:V,incrementStep:!0};case"temp-root-relaxation":return V.push(""),V.push(`STEP ${A} ${q.h} Temp-root relaxation`),V.push(`  Git cwd: ${P.gitCwd}`),V.push("  Result: Allowed git discard in a temp-root repository"),{lines:V,incrementStep:!0};case"tmpdir-check":return null;case"fallback-scan":{if(P.embeddedCommandFound)return V.push(""),V.push(`STEP ${A} ${q.h} Fallback scan`),V.push(`  Found: ${P.embeddedCommandFound}`),{lines:V,incrementStep:!0};return null}case"custom-rules-check":{if(P.rulesChecked){if(V.push(""),V.push(`STEP ${A} ${q.h} Custom rules`),P.matched)V.push("  Result: MATCHED");else V.push("  Result: No match");return{lines:V,incrementStep:!0}}return null}case"cwd-change":return null;case"dangerous-text":{if(P.matched)return V.push(""),V.push(`STEP ${A} ${q.h} Dangerous text check`),V.push(`  Token:  ${P.token}`),V.push("  Result: MATCHED"),{lines:V,incrementStep:!0};return null}case"strict-unparseable":return V.push(""),V.push(`STEP ${A} ${q.h} Strict mode check`),V.push(`  Command: ${P.rawCommand}`),V.push("  Result:  ✗ UNPARSEABLE"),{lines:V,incrementStep:!0};case"segment-skipped":return null;case"error":return V.push(""),V.push(`ERROR: ${P.message}`),{lines:V,incrementStep:!1};default:return P}}function ii(P,A){let q=kl(A?.asciiOnly??!1),V=58,ee=[],ne=1;ee.push(...xl(q,58)),ee.push("");let ce=P.trace.steps.find((Re)=>Re.type==="error");if(ce&&ce.type==="error"){ee.push("ERROR"),ee.push(`  ${ce.message}`),ee.push(""),ee.push("RESULT"),ee.push(`  Status: ${P.result==="blocked"?dt.red("BLOCKED"):dt.green("ALLOWED")}`),ee.push(""),ee.push("CONFIG");let Re=P.configSource??"none";return ee.push(`  Path: ${Re}`),ee.join(`
`)}let he=P.trace.steps.find((Re)=>Re.type==="parse");if(he&&he.type==="parse"){ee.push("INPUT"),ee.push(`  ${he.input}`),ee.push(""),ee.push(`STEP ${ne} ${q.h} Split shell commands`),ne++;for(let Re=0;Re<he.segments.length;Re++){let at=he.segments[Re];if(at){let ct=Math.random();ee.push(`  Segment ${Re+1}: ${Cl(at,ct)}`)}}}let ye=P.trace.segments,be=ye.length>1;for(let Re of ye){if(be){ee.push("");let ft="";if(he&&he.type==="parse"){let io=he.segments[Re.index];if(io)ft=io.join(" ")}let mt=54,gt=ft,ut=` Segment ${Re.index+1}: `,vt=" ";if(ft){if(ut.length+ft.length+vt.length>mt){let Xd=mt-ut.length-vt.length;gt=`${ft.substring(0,Xd-1)}…`}}let At=ft?`${ut}${gt}${vt}`:` Segment ${Re.index+1} `,Kd=ft?`${ut}${dt.cyan(gt)}${vt}`:At,Hi=58-At.length,Ui=Math.floor(Hi/2),Yd=Hi-Ui;ee.push(`${q.sh.repeat(Ui)}${Kd}${q.sh.repeat(Yd)}`)}if(Re.steps.find((ft)=>ft.type==="segment-skipped")){ee.push(""),ee.push("  (skipped — prior segment blocked)");continue}let ct=!1,lt=!1;for(let ft of Re.steps){let mt=Sl(ft,ne,q);if(mt){if(lt=!0,ft.type==="recurse"){ee.push("");let gt=" RECURSING ",ut=58-gt.length-4;ee.push(`  ${q.tl}${q.h}${gt}${q.h.repeat(ut)}`),ee.push(`  ${q.v}`),ct=!0;continue}for(let gt of mt.lines)if(ct)ee.push(`  ${q.v} ${gt}`);else ee.push(gt);if(mt.incrementStep)ne++}}if(ct)ee.push(`  ${q.v}`),ee.push(`  ${q.bl}${q.h.repeat(56)}`);if(!lt)ee.push(""),ee.push(`  ${dt.green("✓")} Allowed (no matching rules)`)}if(ee.push(""),ee.push("RESULT"),P.result==="blocked"){if(ee.push(`  Status: ${dt.red("BLOCKED")}`),P.customRule){if(ee.push(`  Rule: ${P.customRule.id}`),P.customRule.rulebook)ee.push(`  Rulebook: ${P.customRule.rulebook.name} ${P.customRule.rulebook.version}`);if(P.customRule.source)ee.push(`  Source: ${P.customRule.source}`);if(P.customRule.override)ee.push(`  Override: reason ${P.customRule.override.reason}`)}if(P.reason){let Re=Bn(P.reason,"          ");ee.push(`  Reason: ${Re[0]}`);for(let at=1;at<Re.length;at++)ee.push(Re[at]??"")}}else ee.push(`  Status: ${dt.green("ALLOWED")}`);ee.push(""),ee.push("CONFIG");let xe=P.configSource??"none",Ie=P.configValid?"":" (invalid)";ee.push(`  Path: ${xe}${Ie}`);let Xe=P.safetyPresetScope;ee.push(`  Safety preset: ${P.selectedPreset??"standard"}${Xe?` (${cr(Xe)})`:""}`),ee.push(`  Effective capabilities: ${P.effectiveLevel}`);let et=Object.entries(P.destructiveCommandRuleOverrides??{});if(ee.push(`  Rule customizations: ${et.length}`),P.ruleActivation)ee.push(`  Rule activation: ${P.ruleActivation.id} — ${P.ruleActivation.enabled?"on":"off"} via ${P.ruleActivation.source}`);return ee.join(`
`)}function si(P){return JSON.stringify(P,null,2)}import{resolve as em}from"node:path";var Yf=["AKIA","ASIA","ghp_","gho_","ghu_","ghs_","ghr_","github_pat_","glpat-","xox","npm_","pypi-","rk_","sk-","sk_","gsk_","xai-","pplx-","bastn_","tgp_v1_","flp_","wfr_","fw_","fwp_","tp-","psk-"];function Rl(P){let A=0,q={allocateSegment(){return A++},getNextSegmentIndex(){return A},recordGlobal(V){P.record({kind:"step",scope:"global",step:V})},recordSegment(V,ee=q.currentSegmentIndex){if(ee===void 0)return;P.record({kind:"step",scope:"segment",segmentIndex:ee,step:V})}};return q}function Pl(P={}){let A=[],q=P.maxEvents??512,V={maxTextLength:P.maxTextLength??2048,maxListLength:P.maxListLength??128,maxObjectProperties:P.maxObjectProperties??P.maxListLength??128,maxDepth:P.maxDepth??16},ee,ne=new Set;return{record(ce){if(ee)return;if(!ce||A.length>=q)return;try{A.push(ci(Xf(ce,V,ne)))}catch{}},finish(){if(ee)return ee;return ee=ci({events:Object.freeze(A)}),ee}}}function Xf(P,A,q){if(P.kind!=="step")throw TypeError("invalid trace event");let{scope:V,step:ee}=P;Or(ee,q,A);let ne=ai(ee,A,q);if(V==="global")return{kind:"step",scope:"global",step:ne};if(V!=="segment")throw TypeError("invalid trace event scope");return{kind:"step",scope:"segment",segmentIndex:P.segmentIndex,step:ne}}function Or(P,A,q,V=0,ee=new WeakSet){if(typeof P==="string"){let he=P.slice(0,q.maxTextLength);if(!Ge(he))return;for(let ye of Ze(he))for(let be of ye.match(/[^\s"'()$]+/g)??[])A.add(El(be));return}if(!P||typeof P!=="object"||V>=q.maxDepth||ee.has(P))return;if(ee.add(P),Array.isArray(P)){let he=Math.min(P.length,q.maxListLength);for(let ye=0;ye<he;ye++)Or(P[ye],A,q,V+1,ee);return}let ne=0,ce=new Set;for(let he in P){if(!Object.hasOwn(P,he))continue;if(ne>=q.maxObjectProperties)break;ne++,Or(he,A,q);let ye=li(he,q,A);if(ce.has(ye))continue;ce.add(ye),Or(P[he],A,q,V+1,ee)}}function ai(P,A,q,V=0,ee=new WeakSet){if(typeof P==="string")return li(P,A,q);if(!P||typeof P!=="object")return P;if(V>=A.maxDepth)return;if(ee.has(P))return;if(ee.add(P),Array.isArray(P)){let he=[],ye=Math.min(P.length,A.maxListLength);for(let be=0;be<ye;be++)he.push(ai(P[be],A,q,V+1,ee));return he}let ne={},ce=0;for(let he in P){if(!Object.hasOwn(P,he))continue;if(ce>=A.maxObjectProperties)break;ce++;let ye=li(he,A,q);if(Object.hasOwn(ne,ye))continue;Object.defineProperty(ne,ye,{value:ai(P[he],A,q,V+1,ee),enumerable:!0,configurable:!0,writable:!0})}return ne}function li(P,A,q){let V=P.slice(0,A.maxTextLength),ee=Ge(V)?Ue(V):V,ne=q.size>0?Qf(ee,q):ee;return(Zf(ne)?ke(ne):ne).slice(0,A.maxTextLength)}function Zf(P){return P.includes("PRIVATE KEY")||P.includes("://")||P.includes("eyJ")||P.includes(":")&&/(?:authorization|cookie|x-api-key|api-key|(?:^|\s)(?:-u|--user)(?:\s|=))/i.test(P)||P.length>=14&&Yf.some((A)=>P.includes(A))||P.length>=49&&/\b[a-f0-9]{32}\.[A-Za-z0-9]{16}\b/.test(P)}function Qf(P,A){return P.replace(/[^\s"'()$]+/g,(q)=>A.has(El(q))?"<redacted>":q)}function El(P){let A=2166136261,q=2166136261;for(let V=0;V<P.length;V++)A=Math.imul(A^P.charCodeAt(V),16777619),q=Math.imul(q^P.charCodeAt(P.length-V-1),16777619);return`${A>>>0}:${q>>>0}:${P.length}`}function ci(P){if(P&&typeof P==="object"&&!Object.isFrozen(P)){for(let A of Object.values(P))ci(A);Object.freeze(P)}return P}function qn(P,A={},q){let V=em(A.cwd??process.cwd()),ee=A.policySnapshot??E(q,{cwd:V,userConfigDir:A.userConfigDir}),ne=R(ee.policy,q.env),ce=Fe({policySnapshot:ee,effectiveCapabilities:ne.capabilities,strict:ne.strict,paranoidRm:ne.paranoidRm,paranoidInterpreters:ne.paranoidInterpreters,worktreeMode:ne.worktreeMode}),he={effectiveLevel:ce.effectiveLevel,selectedPreset:ee.policy.safety.level??"standard",...ee.policyScopes?{safetyPresetScope:ee.policyScopes.levelScope}:{},effectiveCapabilities:ce.effectiveCapabilities,destructiveCommandRuleOverrides:ee.policy.destructiveCommandRuleOverrides},{configSource:ye,configValid:be}=nm(q,{cwd:V,userConfigDir:A.userConfigDir});if(!P||!P.trim())return{trace:{steps:[{type:"error",message:"No command provided"}],segments:[]},result:"allowed",configSource:ye,configValid:be,...he};let xe=h(P,"auto");if(xe.status==="limited")throw new y;let Ie=xe.dialect==="powershell"?h(P,"posix"):xe,Xe=st(Ie),et=Pl(),Re=Rl(et);Re.recordGlobal({type:"parse",input:P,segments:Xe.map((At)=>[...At])});let at=d("Bash",{command:P},{kind:"command",shell:"auto"},{configCwd:V,executionCwd:V},P),ct=B(at,{environment:q,trace:Re,dependencies:{loadPolicySnapshot:()=>ee}}),lt=ct.decision.kind==="deny"?ct.decision:null;if(lt&&(ct.stage==="policy-protection"||ct.stage==="secret-protection")){let At=tm(lt);return{trace:{steps:[],segments:[{index:0,steps:[{type:"rule-check",rule:At.rule,matched:!0,reason:lt.reason}]}]},result:"blocked",reason:k(lt.reason),segment:k(Dl(lt,P)),...At.ruleId?{ruleId:k(At.ruleId)}:{},configSource:ye,configValid:be,...he}}let ft=Re.getNextSegmentIndex();if(lt&&ft>0&&ft<Xe.length)Re.recordSegment({type:"segment-skipped",index:ft,reason:"prior-segment-blocked"},ft);let mt=et.finish(),gt=lt?.ruleId??rm(at,ee,ne,q),ut=G.find((At)=>At.id===gt&&At.activationCapability),vt=ut?ce.policy.effectiveDestructiveCommandRules[ut.id]:void 0;return{trace:im(mt),result:lt?"blocked":"allowed",reason:lt?k(lt.reason):void 0,segment:lt?k(Dl(lt,P)):void 0,ruleId:lt?.ruleId?k(lt.ruleId):void 0,customRule:om(sm(lt?.ruleId,ee)),configSource:ye,configValid:be,...he,...ut&&vt?{ruleActivation:{id:ut.id,...vt}}:{}}}function Dl(P,A){return P.evidence?.segment??A}function tm(P){if(P.reason===$e)return{ruleId:"policy-protection",rule:"policy-protection:findPolicyConfigMutationTargetInSemanticFacts"};if(P.reason===Me)return{ruleId:"policy-apply-protection",rule:"policy-apply-protection:findPolicyApplyInvocationInSemanticFacts"};if(P.reason===x)return{ruleId:"git-metadata-protection",rule:"git-metadata-protection:findGitMetadataMutationTargetInSemanticFacts"};return{ruleId:P.ruleId,rule:"secret-protection:findSensitiveTargetInSemanticFacts"}}function nm(P,A){let q=M(A.cwd),V=j(P,A),ee=J(P,{cwd:A.cwd,userConfigDir:A.userConfigDir});try{if(n(ee.projectConfigTarget)!==null){if(Jt(ee.projectConfigTarget).errors.length===0)return{configSource:q,configValid:!0};return{configSource:q,configValid:!1}}}catch(ne){if(ne instanceof r)return{configSource:q,configValid:!1};throw ne}try{if(n(ee.userConfigTarget)!==null){let ne=Jt(ee.userConfigTarget);return{configSource:V,configValid:ne.errors.length===0}}return{configSource:null,configValid:!0}}catch(ne){if(ne instanceof r)return{configSource:V,configValid:!1};throw ne}}function rm(P,A,q,V){let ee=A.policy,ne=Ee({...ee,destructiveCommandProtectionEnabled:!0,destructiveCommandRuleOverrides:{...ee.destructiveCommandRuleOverrides,...Object.fromEntries(G.flatMap((he)=>he.activationCapability?[[he.id,"on"]]:[]))}},A.state==="degraded"?{diagnostics:A.diagnostics,reason:A.reason}:void 0),ce=B(P,{environment:V,dependencies:{loadPolicySnapshot:()=>ne,getModes:()=>({...q,strict:!0,paranoidRm:!0,paranoidInterpreters:!0}),findSensitiveTarget:()=>null}});return ce.decision.kind==="deny"?ce.decision.ruleId:void 0}function om(P){if(!P)return;return{id:k(P.id),...P.rulebook?{rulebook:{name:k(P.rulebook.name),version:k(P.rulebook.version)}}:{},...P.source?{source:k(P.source)}:{},...P.override?{override:{type:"reason",reason:k(P.override.reason)}}:{}}}function im(P){let A=P.events.flatMap((V)=>V.kind==="step"&&V.scope==="global"?[V.step]:[]),q=new Map;for(let V of P.events){if(V.kind!=="step"||V.scope!=="segment")continue;let ee=q.get(V.segmentIndex)??{index:V.segmentIndex,steps:[]};ee.steps.push(V.step),q.set(V.segmentIndex,ee)}return{steps:A,segments:[...q.values()]}}function sm(P,A){let q=P?.replace(/^custom\./,"");if(!q||!A.policy.rules.some((V)=>V.name===q))return;return A.ruleMetadata[q]??Object.freeze({id:q})}function Al(P){return new Promise((A)=>{process.stdout.write(`${P}
`,()=>A())})}async function _l(P,A){let q=ri(A);if(!q)return 1;try{let V=qn(q.command,{cwd:q.cwd},P),ee=!!process.env.NO_COLOR||!process.stdout.isTTY;return await Al(q.json?si(V):ii(V,{asciiOnly:ee})),0}catch(V){let ee=am(V instanceof p?V.cause:V);if(ee===void 0)throw V;if(q.json)return await Al(JSON.stringify({error:ee})),1;return console.error(ee),1}}function am(P){if(P instanceof y)return P.message;if(P instanceof f)return P.message;if(P instanceof s&&a[P.kind].errorCode==="path-canonicalization-limit")return"Path canonicalization work limit exceeded.";return}var Tl="2.4.14",Ot="  ",sn="cc-safety-net";function Il(P){return P.argument?`${P.flags} ${P.argument}`:P.flags}function lm(P){return Math.max(...P.map((A)=>Il(A).length))}function cm(P){return Math.max(...P.map((A)=>A.usage.length))}function dm(P){return Math.max(...P.map((A)=>`${sn} ${A.usage}`.length))}function um(P,A){let q=`${sn} ${P.usage}`;return`${Ot}${q.padEnd(A+2)}${P.description}`}function qt(P,A){return`${Ot}${P.padEnd(Math.max(40,P.length+2))}${A}`}function Cn(P,A=console.log){let q=[];if(q.push(`${sn} ${P.name}`),q.push(""),q.push(`${Ot}${P.description}`),q.push(""),q.push("USAGE:"),q.push(`${Ot}${sn} ${P.usage}`),q.push(""),P.subcommands&&P.subcommands.length>0){q.push("SUBCOMMANDS:");let V=cm(P.subcommands);for(let ee of P.subcommands)q.push(`${Ot}${ee.usage.padEnd(V+2)}${ee.description}`);q.push("")}if(P.options.length>0){q.push("OPTIONS:");let V=lm(P.options);for(let ee of P.options){let ne=Il(ee),ce=ee.default?`${ee.description} (default: ${ee.default})`:ee.description;q.push(`${Ot}${ne.padEnd(V+2)}${ce}`)}q.push("")}if(P.examples&&P.examples.length>0){q.push("EXAMPLES:");for(let V of P.examples)q.push(`${Ot}${V}`)}A(q.join(`
`))}function di(){let P=dm(ir),A=[];A.push(`${sn} v${Tl}`),A.push(""),A.push("Blocks destructive commands and secret access."),A.push(""),A.push("COMMANDS:");for(let q of ir)A.push(um(q,P));A.push(""),A.push("GLOBAL OPTIONS:"),A.push(`${Ot}-h, --help       Show help (use with command for command-specific help)`),A.push(`${Ot}-V, --version    Show version`),A.push(""),A.push("HELP:"),A.push(`${Ot}${sn} help <command>     Show help for a specific command`),A.push(`${Ot}${sn} <command> --help   Show help for a specific command`),A.push(""),A.push("ENVIRONMENT VARIABLES:"),A.push(qt(`${o.level.name}=standard|strict|paranoid`,"Set session safety level")),A.push(qt(`${o.worktree.name}=1`,"Allow local git discards in linked worktrees")),A.push(qt(`${o.debug.name}=1`,"Print diagnostic messages to stderr")),A.push(qt(`${o.auditScope.name}=all|blocked`,"Record all command decisions, or denials only")),A.push(qt("CC_SAFETY_NET_HOME","Override rule config home directory")),A.push(""),A.push("LEGACY ENVIRONMENT VARIABLES (STILL SUPPORTED):"),A.push(qt(`${o.strict.name}=1`,"Force safety.overrides.fail_closed on")),A.push(qt(`${o.paranoid.name}=1`,"Force paranoid_rm and paranoid_interpreters on")),A.push(qt(`${o.paranoidRm.name}=1`,"Force safety.overrides.paranoid_rm on")),A.push(qt(`${o.paranoidInterpreters.name}=1`,"Force safety.overrides.paranoid_interpreters on")),A.push(""),A.push("Documentation:        https://ccsafetynet.com/docs"),console.log(A.join(`
`))}function $l(){console.log(Tl)}function Vn(P,A=console.log){let q=sr(P);if(!q)return!1;if(q.name.toLowerCase()!==P.toLowerCase())return!1;return Cn(q,A),!0}import{existsSync as Br,readFileSync as Ac}from"node:fs";import{join as Gr}from"node:path";import*as Yt from"node:readline";function pm(P){return P==="install"?"Install":"Uninstall"}function fm(P){return P==="install"?"Installing":"Uninstalling"}function mm(P){return P==="install"?"into":"from"}function Nl(P){return P?.available===!0}function gm(P,A){let q=new Set(A);return P.filter((V)=>q.has(V.target)).map((V)=>V.target)}function Ol(P,A,q){if(P.every((V)=>!V.available))return A;return Array.from({length:P.length},(V,ee)=>ee+1).map((V)=>(A+V*q+P.length)%P.length).find((V)=>Nl(P[V]))}function hm(P,A,q){if(q.ctrl&&q.name==="c")return"interrupt";if(q.name==="escape"||A==="q")return"abort";if(P==="install"&&(A==="u"||A==="U"))return"update";if(q.name==="up"||A==="k")return"up";if(q.name==="down"||A==="j")return"down";if(q.name==="space"||A===" ")return"toggle";if(q.name==="return"||q.name==="enter")return"confirm";return null}function ym(P){return{cursor:P.findIndex((A)=>A.available),selected:[]}}function vm(P,A,q){if(q==="confirm"||q==="update"||q==="abort"||q==="interrupt")return{state:P,done:q};if(q==="up")return{state:{...P,cursor:Ol(A,P.cursor,-1)}};if(q==="down")return{state:{...P,cursor:Ol(A,P.cursor,1)}};let V=A[P.cursor];if(!Nl(V))return{state:P};let ee=P.selected.includes(V.target)?P.selected.filter((ne)=>ne!==V.target):gm(A,[...P.selected,V.target]);return{state:{...P,selected:ee}}}var jl="◉",Ml="◯",Hl=">",Ul=" ";function bm(P,A,q,V={}){let ee=V.color!==!1,ne=ee?dt.dim:(ye)=>ye,ce=ee?dt.green:(ye)=>ye,he=ee?dt.bold:(ye)=>ye;return["",`${pm(P)} CC Safety Net ${mm(P)}:`,"",...A.map((ye,be)=>{let xe=q.selected.includes(ye.target),Ie=be===q.cursor,Xe=xe?jl:Ml,et=Ie?Hl:Ul,Re=ye.available?"":` (${ye.unavailableReason??"not installed"})`,at=`${Xe} ${ye.label}${Re}`,ct=!ye.available?ne(at):xe?ce(at):Ie?he(at):at;return`${et} ${ct}`}),"",P==="install"?"Space: select  Enter: confirm  u: update installed  Up/Down: move  q/Esc: cancel":A.some((ye)=>ye.available)?"Space: select  Enter: confirm  Up/Down: move  q/Esc: cancel":`No selectable integrations found for ${P}. q/Esc: close`].join(`
`)}var Fl=["global-hook","plugin"];function Lm(P,A,q={}){let V=q.color!==!1?dt.bold:(ne)=>ne;return["","Install the Kimi Code integration as:","",...[`Global hook — ${A?"already installed; selecting it reports the current state":"write the hook into ~/.kimi-code/config.toml now"}`,"Native Kimi plugin — print the steps to run inside Kimi Code"].map((ne,ce)=>{let he=ce===P,ye=`${he?jl:Ml} ${ne}`;return`${he?Hl:Ul} ${he?V(ye):ye}`}),"","Enter: confirm  Up/Down: move  q/Esc: cancel"].join(`
`)}function Gl(P){let{input:A,output:q}=P;Yt.emitKeypressEvents(A);let V=A.isRaw===!0;A.setRawMode(!0),A.resume();let ee=0,ne=()=>{if(ee===0)return;Yt.moveCursor(q,0,-ee),Yt.cursorTo(q,0),Yt.clearScreenDown(q)},ce=()=>{ne();let he=P.render();q.write(`${he}
`),ee=he.split(`
`).length};return new Promise((he)=>{let ye=(xe)=>{A.off("keypress",be),A.setRawMode(V),A.pause(),ne(),he(xe)};function be(xe,Ie){P.onKey(xe,Ie,{finish:ye,draw:ce})}A.on("keypress",be),ce()})}function Bl(P={}){let A=0;return Gl({input:P.input??process.stdin,output:P.output??process.stdout,render:()=>Lm(A,P.globalHookInstalled===!0),onKey:(q,V,ee)=>{if(V.ctrl&&V.name==="c"){ee.finish(null),(P.onInterrupt??(()=>process.kill(process.pid,"SIGINT")))();return}if(V.name==="escape"||q==="q")return ee.finish(null);if(V.name==="return"||V.name==="enter")return ee.finish(Fl[A]);if(V.name==="up"||V.name==="down"||q==="k"||q==="j")A=(A+1)%Fl.length,ee.draw()}})}function ui(P=process.stdin,A=process.stdout){return Boolean(P.isTTY&&A.isTTY&&typeof P.setRawMode==="function")}function ql(P,A,q={}){let V=q.output??process.stdout,ee=ym(A);return Gl({input:q.input??process.stdin,output:V,render:()=>bm(P,A,ee),onKey:(ne,ce,he)=>{let ye=hm(P,ne,ce);if(!ye)return;let be=vm(ee,A,ye);if(ee=be.state,be.done==="interrupt"){he.finish(null),(q.onInterrupt??(()=>process.kill(process.pid,"SIGINT")))();return}if(be.done==="abort")return he.finish(null);if(be.done==="update")return he.finish("update");if(be.done==="confirm"){if(ee.selected.length===0){V.write("\x07"),he.draw();return}he.finish([...ee.selected]),V.write(`${fm(P)} selected integrations...
`);return}he.draw()}})}import{existsSync as Vl,lstatSync as km,mkdirSync as xm,mkdtempSync as Cm,readdirSync as Sm,readFileSync as Rn,rmSync as Nr}from"node:fs";import{basename as Rm,dirname as Pm,join as Dt}from"node:path";import{fileURLToPath as Em}from"node:url";var pi="// cc-safety-net managed Amp plugin. Do not edit. Reinstall with: npx -y cc-safety-net install --amp",an="cc-safety-net",ln="cc-safety-net/index.ts";import{spawn as wm}from"node:child_process";var fi=(P,A)=>{let q=Qt([...P],process.env);return new Promise((V)=>{let ee=wm(q.cmd,q.args,{cwd:A,stdio:["ignore","pipe","pipe"]}),ne=Uo(ee),ce=!1,he=setTimeout(()=>{ce=!0,ee.kill()},120000);ee.on("error",(ye)=>{clearTimeout(he),V({status:null,errorCode:ye.code,stdout:ne.stdout,stderr:[ye.message,ne.stderr].filter(Boolean).join(`
`)})}),ee.on("close",(ye)=>{clearTimeout(he),V({status:ce?null:ye,errorCode:ce?"ETIMEDOUT":void 0,stdout:ne.stdout,stderr:ne.stderr})})})};var Sn="cc-safety-net.ts",mi=Dt("amp",ln);function Dm(P){return Dt(P.home,".config","amp","plugins","cc-safety-net.ts")}function Am(){let P=Pm(Em(import.meta.url)),A=Dt(P,mi),q=Dt(P,"..",mi),V=Dt(P,"..","..","..","dist",mi);return[A,q,V]}function _m(P=Am()){let A=P.find((q)=>Vl(q)&&km(q).isFile());if(!A)throw Error("Packaged Amp plugin artifact not found. Reinstall cc-safety-net and try again.");return A}function zl(P){try{return JSON.parse(P)}catch{return}}function jr(P){return P.subarray(0,Buffer.byteLength(pi)).toString("utf-8")===pi}async function zn(P,A,q){let V=await P(A,q);if(V.status===0)return V;throw Error([`Failed to run ${A.join(" ")}${V.status===null?"":` (exit ${V.status})`}.`,[V.stdout,V.stderr].filter(Boolean).join(`
`).trim()].filter(Boolean).join(`
`))}async function Jl(P){let A=await P(["amp","plugins","repositories","--json"]);if(A.status===null)throw Error(`${A.errorCode==="ENOENT"?'Amp CLI not found. Install the amp CLI, sign in with "amp login", and rerun install --amp.':`amp plugins repositories --json did not finish (${A.errorCode??"terminated"}). Check that the amp CLI responds and rerun install --amp.`}
${A.stderr}`.trim());if(A.status!==0)throw Error(`Failed to run amp plugins repositories --json (exit ${A.status}). Sign in with "amp login" and rerun install --amp.
${[A.stdout,A.stderr].filter(Boolean).join(`
`)}`.trim());let q=zl(A.stdout),V=(Array.isArray(q)?q:[]).filter((ee)=>pt(ee,"scope")==="user"&&pt(ee,"exists")===!0&&pt(ee,"viewerCanWrite")===!0).map((ee)=>pt(ee,"cloneRef")).find((ee)=>typeof ee==="string"&&ee.length>0);if(!V)throw Error('Your Amp account has no writable Personal Plugins repository. Sign in with "amp login", open Amp once to create it, and rerun install --amp.');return V}async function Wl(P,A,q){let V=Cm(Dt(A.tmpdir,"cc-safety-net-amp-"));try{return await zn(P,["amp","clone","user-plugins",V]),await q(V)}finally{Nr(V,{recursive:!0,force:!0})}}function gi(P){return`rerun ${P==="overwrite"?"install":"uninstall"} --amp`}function Kl(P,A,q){let V=Dt(P,A),ee=Lt(V);if(!ee)return;if(ee.isSymbolicLink()||!ee.isFile())throw Error(`Refusing to ${q} ${A} in your Amp personal plugins repository: not a regular file. Remove it there and ${gi(q)}.`);let ne=Rn(V);if(jr(ne))return ne;throw Error(`Refusing to ${q} unmanaged file ${A} in your Amp personal plugins repository. Remove it there and ${gi(q)}.`)}function Yl(P,A){let q=Dt(P,an),V=Lt(q);if(!V)return;if(V.isSymbolicLink()||!V.isDirectory())throw Error(`Refusing to ${A} ${an} in your Amp personal plugins repository: not a regular directory. Remove it there and ${gi(A)}.`);return Kl(P,ln,A)}function Tm(P){let A=Dt(P,Sn),q=Lt(A);if(!q||q.isSymbolicLink()||!q.isFile())return;let V=Rn(A);return jr(V)?V:void 0}async function Xl(P,A,q,V){if(await zn(P,q,A),(await zn(P,["git","status","--porcelain"],A)).stdout.trim()==="")return!1;return await zn(P,["git","-c","commit.gpgsign=false","-c","user.name=cc-safety-net","-c","user.email=cc-safety-net@localhost","commit","-m",V],A),await zn(P,["git","push","origin","HEAD"],A),!0}function Fr(P,A){Im(P,A),$m(P,A)}function Zl(P,A){if(A==="keep")return;throw Error(`Local Amp plugin ${P} is not a managed copy and masks the personal plugin. Remove it and rerun install --amp.`)}function Im(P,A){let q=Dm(P),V=Lt(q);if(!V)return;if(!V.isSymbolicLink()&&V.isFile()&&jr(Rn(q))){Nr(q);return}Zl(q,A)}function $m(P,A){let q=Dt(P.home,".config","amp","plugins",an),V=Lt(q);if(!V)return;if(!V.isSymbolicLink()&&V.isDirectory()&&Om(q)){Nr(q,{recursive:!0});return}Zl(q,A)}function Om(P){let A=Rm(ln);if(Sm(P).join("\x00")!==A)return!1;let q=Dt(P,A),V=Lt(q);return!!V&&!V.isSymbolicLink()&&V.isFile()&&jr(Rn(q))}function Fm(P){let A=u(P);if(!Vl(A))return"";let q=zl(Rn(A,"utf-8"));if(!q||typeof q!=="object"||Array.isArray(q))return"";return`;globalThis.__CC_SAFETY_NET_EMBEDDED_POLICY__ = ${JSON.stringify(C(q,P.home))};
`}async function Ql(P,A=_m(),q=fi){let V=Buffer.concat([Rn(A),Buffer.from(Fm(P),"utf-8")]),ee=await Jl(q);return Wl(q,P,async(ne)=>{let ce=`${ee}/${an}`,he=Yl(ne,"overwrite"),ye=Kl(ne,Sn,"overwrite");if(he?.equals(V)&&!ye)return Fr(P,"fail"),{path:ce,alreadyInstalled:!0};if(xm(Dt(ne,an),{recursive:!0}),kt(Dt(ne,ln),V),ye)Nr(Dt(ne,Sn));let be=await Xl(q,ne,["git","add","--",ln,...ye?[Sn]:[]],`chore: update cc-safety-net plugin to v${wt()}`);return Fr(P,"fail"),{path:ce,alreadyInstalled:!be}})}async function ec(P,A=fi){let q=await Jl(A);return Wl(A,P,async(V)=>{let ee=Yl(V,"remove"),ne=Tm(V),ce=`${q}/${ne&&!ee?Sn:an}`;if(!ee&&!ne)return Fr(P,"keep"),{path:ce,alreadyInstalled:!1};return await Xl(A,V,["git","rm","--",...ee?[ln]:[],...ne?[Sn]:[]],`chore: remove cc-safety-net plugin v${wt()}`),Fr(P,"keep"),{path:ce,alreadyInstalled:!0}})}import{existsSync as tc,mkdirSync as Nm,readFileSync as jm}from"node:fs";import{dirname as Mm}from"node:path";var hi=jt["antigravity-cli"],cn="cc-safety-net";function dn(P){return Boolean(P)&&typeof P==="object"&&!Array.isArray(P)}function Hr(){return{PreToolUse:[{hooks:[{type:"command",command:hi,timeout:30}]}]}}function nc(P){try{let A=JSON.parse(jm(P,"utf-8"));if(!A||typeof A!=="object"||Array.isArray(A))throw Error("Antigravity hooks config must be a JSON object");return A}catch(A){if(A instanceof SyntaxError)throw Error(`Failed to parse Antigravity hooks config ${P}: ${A.message}`);throw A}}function rc(P){let A=P[cn];if(A===void 0){let V=Hr();return P[cn]=V,{definition:V,preToolUse:V.PreToolUse??[]}}if(!dn(A))throw Error(`Antigravity hooks config entry "${cn}" must be an object`);let q=Array.isArray(A.PreToolUse)?A.PreToolUse:[];return A.PreToolUse=q,{definition:A,preToolUse:q}}function oc(P){if(!Array.isArray(P.PreToolUse))return!1;return P.PreToolUse.some((A)=>dn(A)&&Array.isArray(A.hooks)&&A.hooks.some((q)=>dn(q)&&q.command===hi))}function Hm(P){return Object.values(P).some((A)=>dn(A)&&A.enabled!==!1&&oc(A))}function Um(P){if(P[cn]===void 0)return!1;let A=rc(P);if(A.definition.enabled!==!1||!oc(A.definition))return!1;return A.definition.enabled=!0,!0}function Gm(P){if(P[cn]===void 0){P[cn]=Hr();return}let A=rc(P);A.definition.enabled=!0,A.preToolUse.push(Hr().PreToolUse?.[0]??{hooks:[]})}function Bm(P){let A=!1;for(let q of Object.values(P)){if(!dn(q)||!Array.isArray(q.PreToolUse))continue;q.PreToolUse=q.PreToolUse.flatMap((V)=>{if(!dn(V)||!Array.isArray(V.hooks))return[V];let ee=V.hooks.filter((ne)=>!dn(ne)||ne.command!==hi);if(ee.length!==V.hooks.length)A=!0;return ee.length===0?[]:[{...V,hooks:ee}]})}return A}function Mr(P,A){kt(P,`${JSON.stringify(A,null,2)}
`)}function ic(P){let A=_n(P.home);if(Nm(Mm(A),{recursive:!0}),!tc(A))return Mr(A,{[cn]:Hr()}),{path:A,alreadyInstalled:!1};let q=nc(A);if(Hm(q))return{path:A,alreadyInstalled:!0};if(Um(q))return Mr(A,q),{path:A,alreadyInstalled:!1};return Gm(q),Mr(A,q),{path:A,alreadyInstalled:!1}}function sc(P){let A=_n(P.home);if(!tc(A))return{path:A,alreadyInstalled:!1};let q=nc(A);if(!Bm(q))return{path:A,alreadyInstalled:!1};return Mr(A,q),{path:A,alreadyInstalled:!0}}import{existsSync as qm,readdirSync as Vm,rmSync as zm}from"node:fs";import{join as Jm}from"node:path";function ac(P,A=process.platform,q){if(!qm(P))return;let V=A==="win32"?/^bunx-\d+-cc-safety-net@/:new RegExp(`^bunx-${process.getuid?.()??0}-cc-safety-net@`);Vm(P).filter((ee)=>ee!==q&&V.test(ee)).forEach((ee)=>{zm(Jm(P,ee),{recursive:!0,force:!0})})}import{spawn as Wm}from"node:child_process";var Ht=$t.map((P)=>({target:P.id,flag:P.flag,label:bt(P.id),probeCommand:P.probeCommand}));function yi(P){let A=new Set(P);return Ht.map((q)=>q.target).filter((q)=>A.has(q))}async function lc(P,A){for(let q of P)await A(q)}var Km=5000;function vi(P,A=Km){return new Promise((q)=>{let V=Qt([...P],process.env),ee=Wm(V.cmd,V.args,{env:process.env,stdio:"ignore"}),ne=!1,ce=(ye)=>{if(ne)return;ne=!0,clearTimeout(he),q(ye)},he=setTimeout(()=>{ee.kill(),ce(!1)},A);ee.on("error",()=>ce(!1)),ee.on("close",(ye)=>ce(ye===0))})}function cc(P=vi,A={}){let q=new Set(A.configuredTargets??[]);return Promise.all(Ht.map(async(V)=>({target:V.target,flag:V.flag,label:V.label,...uc(A.action,await P(V.probeCommand),q.has(V.target))})))}function dc(P,A){let q=new Set(A.configuredTargets??[]);return P.map((V)=>({...V,...uc(A.action,V.available,q.has(V.target))}))}function uc(P,A,q){if(P==="uninstall")return q?{available:!0}:{available:!1,unavailableReason:"not installed"};if(P==="install"&&q)return{available:!1,unavailableReason:"already installed"};if(!A)return{available:!1,unavailableReason:"CLI not installed"};return{available:!0}}import{existsSync as pc,readdirSync as Ym,rmSync as Xm}from"node:fs";import{join as Pn}from"node:path";function Ur(P,A=process.platform){let q=Pn(P.env.get("npm_config_cache")||(A==="win32"?Pn(P.env.get("LOCALAPPDATA")||Pn(P.home,"AppData","Local"),"npm-cache"):Pn(P.home,".npm")),"_npx");if(!pc(q))return;Ym(q).filter((V)=>pc(Pn(q,V,"node_modules","cc-safety-net"))).forEach((V)=>{Xm(Pn(q,V),{recursive:!0,force:!0})})}import{existsSync as vc,mkdirSync as Qm,readFileSync as bc}from"node:fs";import{dirname as eg,join as yc}from"node:path";function Zm(P,A){if(P[A]!=="#")return A;let q=P.indexOf(`
`,A+1);return q===-1?P.length:q+1}function bi(P,A,q){let V=new RegExp(`^(\\s*)${A}\\s*=\\s*\\[`),ee=0;for(let ne of P.split(`
`)){if(/^\s*\[/.test(ne))return;let ce=V.exec(ne);if(ce){let he=ee+ce[0].lastIndexOf("[");return{start:he,end:So(P,he,{skipComment:Zm,...q})}}ee+=ne.length+1}return}function fc(P,A,q){let V=P.slice(0,A.end).trimEnd(),ee=oa(P,A.end),ne=ee===""?"     ":`${ee}  `,ce=!V.endsWith("[")&&!V.endsWith(",");return`${V}${ce?",":""}
${ne}${q}${P.slice(A.end)}`}function mc(P,A,q){let V=P.indexOf(q,A.start);if(V===-1||V>A.end)return P;return Lr(P,{start:V,end:V+q.length})}function gc(P,A){let q=new RegExp(`^\\s*${A}\\s*=\\s*\\[\\s*]\\s*(?:#.*)?$`),V=P.split(`
`),ee=V.findIndex((he)=>/^\s*\[/.test(he)),ne=ee===-1?V:V.slice(0,ee),ce=ee===-1?[]:V.slice(ee);return[...ne.filter((he)=>!q.test(he)),...ce].join(`
`)}function hc(P,A,q){let V=new RegExp(`^\\s*\\[\\[${A}]]\\s*$`,"m");return P.split(/(?=^\s*\[)/m).filter((ee)=>!V.test(ee)||!ee.includes(q)).join("").trimEnd()}var Jn=jt["kimi-code"],Li=`[[hooks]]
event = "PreToolUse"
command = "${Jn}"`,Lc=`{ event = "PreToolUse", command = "${Jn}" }`,wc={stringError:"Unterminated string in Kimi Code config",bracketError:"Unmatched hooks array in Kimi Code config"};function kc(P){return yc(P.env.get("KIMI_CODE_HOME")??yc(P.home,".kimi-code"),"config.toml")}function tg(P){let A=bi(P,"hooks",wc);if(A&&P.slice(A.start+1,A.end).trim())return fc(P,A,Lc);let q=gc(P,"hooks").trimEnd();if(q==="")return`${Li}
`;return`${q}

${Li}
`}function xc(P){let A=kc(P);if(Qm(eg(A),{recursive:!0}),!vc(A))return kt(A,`${Li}
`),{path:A,alreadyInstalled:!1};let q=bc(A,"utf-8");if(q.includes(Jn))return{path:A,alreadyInstalled:!0};return kt(A,tg(q)),{path:A,alreadyInstalled:!1}}function Cc(P){let A=kc(P);if(!vc(A))return{path:A,alreadyInstalled:!1};let q=bc(A,"utf-8");if(!q.includes(Jn))return{path:A,alreadyInstalled:!1};let V=bi(q,"hooks",wc),ee=V?mc(q,V,Lc):`${hc(q,"hooks",Jn)}
`;return kt(A,ee),{path:A,alreadyInstalled:!0}}var wi="safety-net@cc-marketplace",Sc=new Set(["claude-code","codex","copilot-cli","gemini-cli","hermes-agent","openclaw","opencode","pi"]),Rc=new Set(["antigravity-cli","cursor","grok-build","hermes-agent","kimi-code"]);function ki(P){return/^\s*safety-net@cc-marketplace[^a-z0-9-][^\n]*installed,/m.test(P??"")}function _c(P){return/^\s*cc-safety-net[^a-z0-9-][^\n]*installed,/m.test(P??"")}function ng(P){return/^Marketplace `cc-marketplace`\s*$/m.test(P??"")}var Tc={"claude-code":{installCommands:(P)=>{let A=br(P,"cc-safety-net@cc-marketplace");return{commands:[...A?[["claude","plugin","marketplace","update","cc-marketplace"],["claude","plugin","update","cc-safety-net@cc-marketplace"]]:[["claude","plugin","marketplace","add","kenryu42/cc-marketplace"],["claude","plugin","marketplace","update","cc-marketplace"],["claude","plugin","install","cc-safety-net@cc-marketplace"]],...xo(P).status==="disabled"?[["claude","plugin","enable","cc-safety-net@cc-marketplace"]]:[]],cleanupCommands:br(P,wi)?[["claude","plugin","uninstall",wi]]:[],update:A}},uninstallCommands:[["claude","plugin","uninstall","cc-safety-net@cc-marketplace"],["claude","plugin","marketplace","remove","cc-marketplace"]]},codex:{installCommands:async(P,A)=>{let q=A??await St(["codex","plugin","list"]),V=_c(q);return{commands:[V||ng(q)?["codex","plugin","marketplace","upgrade","cc-marketplace"]:["codex","plugin","marketplace","add","kenryu42/cc-marketplace"],["codex","plugin","add","cc-safety-net@cc-marketplace"]],cleanupCommands:ki(q)?[["codex","plugin","remove","safety-net@cc-marketplace"]]:[],update:V}},uninstallCommands:[["codex","plugin","remove","cc-safety-net@cc-marketplace"],["codex","plugin","marketplace","remove","cc-marketplace"]],postInstallMessage:ea},"copilot-cli":{installCommands:async()=>{let P=await St(["copilot","plugin","list"]),A=[...ua(P)?[["copilot","plugin","uninstall","copilot-safety-net"]]:[],...pa(P)?[["copilot","plugin","uninstall",la]]:[]];if(ca(P))return{commands:[["copilot","plugin","marketplace","update","cc-marketplace"],["copilot","plugin","update",Nt]],cleanupCommands:A,update:!0};return{commands:[da(await St(["copilot","plugin","marketplace","list"]))?["copilot","plugin","marketplace","update","cc-marketplace"]:["copilot","plugin","marketplace","add","kenryu42/cc-marketplace"],["copilot","plugin","install",Nt]],cleanupCommands:A}},uninstallCommands:[["copilot","plugin","uninstall","cc-safety-net@cc-marketplace"],["copilot","plugin","marketplace","remove","cc-marketplace"]]},"gemini-cli":{installCommands:(P)=>{let A=_o(P);if(A.status==="configured")return{commands:[["gemini","extensions","update","gemini-safety-net"]],update:!0};if(A.status==="disabled")return{commands:[["gemini","extensions","update","gemini-safety-net"],["gemini","extensions","enable","gemini-safety-net"]],update:!0};return{commands:[["gemini","extensions","install","https://github.com/kenryu42/gemini-safety-net","--consent"]]}},uninstallCommands:[["gemini","extensions","uninstall","gemini-safety-net"]]},openclaw:{beforeInstall:qo,installCommands:(P)=>{let A=!Br(Gr(Hn(P),Tt));return{commands:tl(),afterInstall:()=>nl(A)}},uninstallCommands:[["openclaw","plugins","uninstall",yt,"--force"]],postInstallMessage:["Restart the OpenClaw Gateway to apply the change.","If plugins.allow is set in openclaw.json, it must also list cc-safety-net."].join(`
`)},opencode:{installCommands:pl},pi:{installCommands:[["pi","install","npm:cc-safety-net"]],uninstallCommands:[["pi","uninstall","npm:cc-safety-net"]]}};function Ic(P,A=(q)=>q){try{let q=JSON.parse(A(Ac(P,"utf-8")));if(!q||typeof q!=="object"||Array.isArray(q))throw Error(`Settings file ${P} must be a JSON object`);return q}catch(q){if(q instanceof SyntaxError)throw Error(`Failed to parse ${P}: ${q.message}`);throw q}}function rg(P){let A=Gr(In(P),"settings.json");if(!Br(A))return;let q=Ic(A,_t),V=q.enabledPlugins;if(!V||typeof V!=="object"||Array.isArray(V))return;if(V[Nt]!==!1)return;let ee=Ac(A,"utf-8"),ne=ee.replace(new RegExp(`("${Nt}"\\s*:\\s*)false`),"$1true");return V[Nt]=!0,kt(A,ne!==ee?ne:`${JSON.stringify(q,null,2)}
`),`Enabled ${Nt} plugin in ${A}`}function og(P){let A=ei(P);if(!Br(A))return;let q=Ic(A);if(!Array.isArray(q.packages))return;let V=q.packages.find((ee)=>!!ee&&typeof ee==="object"&&!Array.isArray(ee)&&ti(ee.source)&&("extensions"in ee));if(!V)return;return delete V.extensions,kt(A,`${JSON.stringify(q,null,2)}
`),`Enabled npm:cc-safety-net extensions in ${A}`}function Pc(P,A){let q=xt({label:A,booleans:Object.fromEntries(Ht.map((ne)=>[ne.target,[ne.flag]]))},P),V=q.errors[0];if(V)throw Error(V);let ee=Ht.filter((ne)=>q.flags[ne.target]).map((ne)=>ne.target);if(ee.length!==1)throw Error(`Choose exactly one ${A} target: ${Ht.map((ne)=>ne.flag).join(", ")}`);return ee[0]}async function $c(P,A=hn){let[q,V,ee]=await Promise.all([A(["amp","plugins","list"],30000),A(["codex","plugin","list"],30000),A(["copilot","--binary-version"])]);return{codexPluginListOutput:V,hooks:xn(P,process.cwd(),{ampPluginListOutput:q,codexPluginListOutput:V,copilotCliVersion:ee})}}async function ig(P,A,q=hn){let V=await $c(P,q);return V.hooks.filter((ee)=>A==="install"?ee.configured:ee.detected||ee.inspectionStatus==="not-inspected").filter((ee)=>ee.platform!=="codex"||!ki(V.codexPluginListOutput)||_c(V.codexPluginListOutput)).map((ee)=>ee.platform)}function sg(P,A,q,V){if(q.length>0)return{finish:async()=>[Pc(q,A)]};if(!V.selectTargets&&!ui(V.input,V.output))return{finish:async()=>[Pc(q,A)]};let ee=V.detectConfiguredTargets??(()=>ig(P,A,V.fetchVersion)),ne=Promise.all([cc(V.probeTargets),ee()]);return{ready:ne,finish:async()=>{let[ce,he]=await ne,ye=dc(ce,{action:A,configuredTargets:he}),be=V.selectTargets?await V.selectTargets(A,Dc(A,ye)):await ql(A,Dc(A,ye),{input:V.input,output:V.output});if(be==="update")return be;if(!be||be.length===0)return null;return yi(be)}}}async function ag(P,A,q=!1,V){let ee=Tc[P];ee.beforeInstall?.(A);let ne=typeof ee.installCommands==="function"?await ee.installCommands(A,V):{commands:ee.installCommands};return await Go(ne.commands),await Ka(ne.cleanupCommands??[]),await ne.afterInstall?.(),[`${ne.update||q?"Updated":"Installed"} ${bt(P)} integration`,ee.postInstallMessage].filter(Boolean).join(`
`)}async function lg(P){let A=Tc[P];if(!A.uninstallCommands)throw Error(`${bt(P)} uninstall is not supported`);return await Go(A.uninstallCommands),`Uninstalled ${bt(P)} integration`}function cg(P){let A=hl(P);return A.alreadyInstalled?`Uninstalled OpenCode plugin from ${A.path}`:`OpenCode plugin not installed in ${A.path}`}var Oc={"antigravity-cli":{install:ic,uninstall:sc},cursor:{install:ka,uninstall:xa},"grok-build":{install:Ia,uninstall:$a},"kimi-code":{install:xc,uninstall:Cc}};function dg(P,A,q,V=!1){if(P==="install"&&!V)Ur(q);let ee=Oc[A][P](q),ne=bt(A),ce=P!=="install"?"Uninstalled":V?"Updated":"Installed";return P==="install"&&ee.alreadyInstalled?V?`${ne} hook up to date in ${ee.path}`:`${ne} hook already installed in ${ee.path}`:P==="uninstall"&&!ee.alreadyInstalled?`${ne} hook not installed in ${ee.path}`:`${ce} ${ne} hook ${P==="install"?"in":"from"} ${ee.path}`}var Fc={amp:{install:Ql,uninstall:ec,restartNote:'Amp personal plugins apply to every Amp session, including Orb threads. Restart Amp or run "plugins: reload" to apply the change.'},"hermes-agent":{install:Ma,uninstall:Ha,afterInstall:async(P)=>{let A=Mo(P);return await St(["hermes","plugins","enable",It,"--no-allow-tool-override"]),!A},beforeUninstall:async(P)=>{jo(P);try{await St(["hermes","plugins","disable",It])}catch(A){console.warn(`${A instanceof Error?A.message:String(A)}
Removing the plugin files anyway; ${It} may still be listed in the Hermes config.`)}},restartNote:"Restart Hermes to apply the change."}};async function ug(P,A,q,V=!1){let ee=Fc[A];if(P==="uninstall")await ee.beforeUninstall?.(q);let ne=P==="install"?await ee.install(q):await ee.uninstall(q),ce=P==="install"&&await ee.afterInstall?.(q),he=bt(A),ye=!ce&&(P==="install"&&ne.alreadyInstalled||P==="uninstall"&&!ne.alreadyInstalled);return[ye?P==="install"?`${he} plugin ${V?"up to date":"already installed"} at ${ne.path}`:`${he} plugin not installed at ${ne.path}`:`${P!=="install"?"Uninstalled":V?"Updated":"Installed"} ${he} plugin ${P==="install"?"at":"from"} ${ne.path}`,ye?void 0:ee.restartNote].filter(Boolean).join(`
`)}var pg={"copilot-cli":{afterInstall:rg},"hermes-agent":{beforeInstall:(P,A)=>{if(!A)Ur(P)}},openclaw:{beforeUninstall:qo},pi:{afterInstall:og}};function fg(P){return P in Oc}function mg(P){return P in Fc}var Ec=["Install CC Safety Net as a native Kimi Code plugin:","","  1. Start Kimi Code and run: /plugins install https://github.com/kenryu42/cc-safety-net","     Confirm the trust prompt; it defaults to cancel.","  2. Run /reload, or start a new session.","","Note: Kimi Code hooks are fail-open. When the hook process cannot start, crashes, or times","out, Kimi Code allows the tool call."].join(`
`);function gg(P){if(Mn({environment:P,cwd:process.cwd()}).status!=="configured")return Ec;return[Ec,"",dt.red(["CAUTION: the global Kimi Code hook is installed and will run alongside the plugin.","After the plugin is active, remove it with: cc-safety-net uninstall --kimi-code"].join(`
`))].join(`
`)}function Dc(P,A){return A.map((q)=>P==="install"&&q.target==="kimi-code"&&q.unavailableReason==="already installed"?{...q,available:!0,unavailableReason:void 0,label:`${q.label} (global hook installed)`}:q)}function hg(P,A){if(P.selectKimiInstallMethod)return P.selectKimiInstallMethod();if(!ui(P.input,P.output))return Promise.resolve("global-hook");return Bl({input:P.input,output:P.output,globalHookInstalled:Mn({environment:A,cwd:process.cwd()}).status==="configured"})}async function Nc(P,A,q,V=!1,ee){let ne=pg[A];if(P==="install")ne?.beforeInstall?.(q,V);if(P==="uninstall")ne?.beforeUninstall?.(q);if(fg(A))return dg(P,A,q,V);if(mg(A))return ug(P,A,q,V);if(P==="uninstall")return A==="opencode"?cg(q):lg(A);return[await ag(A,q,V,ee),await ne?.afterInstall?.(q)].filter(Boolean).join(`
`)}function yg(P){let A=xt({label:"update"},P).errors[0];if(A)throw Error(A)}async function vg(P,A=hn){let q=await $c(P,A),V=Gr(In(P),"installed-plugins");return{targets:yi([...q.hooks.filter((ne)=>ne.platform!=="copilot-cli"&&ne.detected).map((ne)=>ne.platform),...[wr,aa,sa].flatMap((ne)=>Br(Gr(V,...ne))?["copilot-cli"]:[]),...br(P,wi)?["claude-code"]:[],...ki(q.codexPluginListOutput)?["codex"]:[]]),codexPluginListOutput:q.codexPluginListOutput}}async function bg(P){let A=c(),q=P.output??process.stdout,V=(P.scriptPath??process.argv[1]??"").split(/[\\/]/),ee=V.find((et)=>/^bunx-\d+-/.test(et)),ne=ee!==void 0||V.includes("_npx")?null:(P.checkLatestVersion??Wt)(),ce=async()=>{let et=ne&&await ne;if(et?.updateAvailable)q.write(`
Update available: cc-safety-net ${et.currentVersion} → ${et.latestVersion}. Update this CLI with your package manager, e.g. \`npm i -g cc-safety-net@latest\` for a global install.
`)},he=vg(A,P.fetchVersion??hn).then(async(et)=>{let Re=new Set(et.targets);return{targets:et.targets,codexPluginListOutput:et.codexPluginListOutput,available:new Map(await Promise.all(Ht.filter((at)=>Re.has(at.target)&&Sc.has(at.target)).map(async(at)=>[at.target,await vi(at.probeCommand)])))}}),ye=await An(P.showBanner??!0,()=>({ready:he,finish:()=>he}),()=>Dn({input:P.input??process.stdin,output:q}),{loadingMessage:"Checking installed integrations…",output:q}),be=await Promise.resolve().then(()=>(ac(A.tmpdir,process.platform,ee),null)).catch((et)=>Wn(et));if(ye.targets.length===0){if(q.write("No installed integrations found. Run `cc-safety-net install` to set one up.\n"),be!==null)console.error(be);return await ce(),be===null?0:1}let xe=ye.targets.some((et)=>Rc.has(et))?await Promise.resolve().then(()=>(Ur(A),null)).catch((et)=>Wn(et)):null,Ie=await gr(Promise.all(ye.targets.map((et)=>{if(Sc.has(et)&&!ye.available.get(et))return Promise.resolve({message:`${bt(et)} not found; skipped`,failed:!1});if(xe!==null&&Rc.has(et))return Promise.resolve({message:xe,failed:!0});return Nc("install",et,A,!0,ye.codexPluginListOutput).then((Re)=>({message:Re,failed:!1}),(Re)=>({message:Wn(Re),failed:!0}))})),{loadingMessage:`Updating ${ye.targets.length} integration${ye.targets.length===1?"":"s"}…`,output:q}),Xe=be===null?Ie:[...Ie,{message:be,failed:!0}];return Xe.forEach((et)=>et.failed?console.error(et.message):q.write(`${et.message}
`)),await ce(),Xe.some((et)=>et.failed)?1:0}function xi(P,A={}){return Promise.resolve().then(()=>yg(P)).then(()=>bg(A)).catch((q)=>(console.error(Wn(q)),1))}async function Kn(P,A,q={}){try{let V=c(),ee=await An(!0,()=>sg(V,P,A,q),()=>Dn({input:q.input??process.stdin,output:q.output??process.stdout}),{loadingMessage:P==="install"?"Checking available integrations…":"Checking installed integrations…",output:q.output??process.stdout});if(!ee)return(q.output??process.stdout).write(`Cancelled: nothing was ${P}ed.
`),0;if(ee==="update")return(q.runUpdate??(()=>xi([],{fetchVersion:q.fetchVersion,input:q.input,output:q.output,showBanner:!1})))();let ne=q.output??process.stdout;return await lc(ee,async(ce)=>{if(ce==="kimi-code"&&P==="install"){let ye=await hg(q,V);if(ye===null){ne.write(`Cancelled: Kimi Code integration was not installed.
`);return}if(ye==="plugin"){ne.write(`${gg(V)}
`);return}}let he=await gr(Nc(P,ce,V),{loadingMessage:`${P==="install"?"Installing":"Uninstalling"} ${bt(ce)} integration…`,output:ne});ne.write(`${he}
`)}),0}catch(V){return console.error(Wn(V)),1}}function Wn(P){let A=P instanceof Error?P.message:String(P),q=typeof P==="object"&&P!==null&&"code"in P?P.code:null;if(q==="EACCES"||q==="EPERM")return`${A}
Check file permissions for the target config file and parent directory.`;if(q==="ENOENT")return`${A}
Check that the target config path and parent directory exist.`;if(q==="ENOTDIR")return`${A}
Check that every parent path component is a directory.`;return A}import{mkdirSync as Sg}from"node:fs";import{dirname as Rg}from"node:path";import{createInterface as Pg}from"node:readline";import{existsSync as Mc,readFileSync as Lg}from"node:fs";function un(P,A){let q=Ye(P,A);return{policy:q.policy,errors:ie(qe(q.issues,Je,(V)=>V.kind==="custom")," "," ")}}function Yn(P,A){return un(P,A).errors}function jc(P,A){return{"safety.level":P.safety.level,...Ci("safety.overrides",P.safety.overrides),"workflow.worktree_mode":String(P.workflow.worktree_mode),"destructive_command_protection.enabled":String(P.destructive_command_protection.enabled),...Ci("destructive_command_protection.overrides",P.destructive_command_protection.overrides),"destructive_command_protection.allow_paths":Si(P.destructive_command_protection.allow_paths),"secret_protection.enabled":String(P.secret_protection.enabled),...Ci("secret_protection.overrides",P.secret_protection.overrides),"secret_protection.deny_paths":Si(P.secret_protection.deny_paths),"secret_protection.allow_paths":Si(P.secret_protection.allow_paths),...A?{"audit.retention_days":String(P.audit.retention_days)}:{}}}function qr(P,A,q){let V=jc(P,q),ee=jc(A,q);return[...new Set([...Object.keys(V),...Object.keys(ee)])].flatMap((ne)=>V[ne]===ee[ne]?[]:[{field:ne,before:V[ne],after:ee[ne]}])}function Xn(P,A){let q=u(P,A);if(!Mc(q))return{baseline:C(globalThis.__CC_SAFETY_NET_EMBEDDED_POLICY__,P.home),diagnostics:[]};let V=pn(q),ee=un(V.value,P.home);return{baseline:ee.policy,diagnostics:V.errors.length>0?V.errors:ee.errors}}function pn(P){if(!Mc(P))return{errors:[`${P}: file not found`]};try{return{value:JSON.parse(Lg(P,"utf-8")),errors:[]}}catch(A){let q=A instanceof Error?A.message:String(A);return{errors:[`${P}: ${A instanceof SyntaxError?`Invalid JSON: ${q}`:q}`]}}}function Vr(P,A){let q=wg(P)?P:{};return{version:A.version,...Object.fromEntries(["safety","workflow","destructive_command_protection","secret_protection"].filter((V)=>q[V]!==void 0).map((V)=>[V,q[V]]))}}function Ci(P,A){return Object.fromEntries(Object.entries(A).flatMap(([q,V])=>V===void 0?[]:[[`${P}.${q}`,String(V)]]))}function Si(P){return P.length===0?"(none)":P.join(", ")}function wg(P){return!!P&&typeof P==="object"&&!Array.isArray(P)}import{chmodSync as kg,existsSync as Hc,mkdirSync as xg,readFileSync as Uc}from"node:fs";import{dirname as Cg}from"node:path";function Gc(P,A={}){let q=u(P,A);if(!Hc(q))return{path:q,exists:!1,raw:"",policy:W(),errors:[]};let V=Uc(q,"utf-8");if(!V.trim())return{path:q,exists:!0,raw:V,policy:W(),errors:["Config file is empty"]};try{let ee=un(JSON.parse(V),P.home);return{path:q,exists:!0,raw:V,policy:ee.policy,errors:ee.errors}}catch(ee){return{path:q,exists:!0,raw:V,policy:W(),errors:[`Invalid JSON: ${ee instanceof Error?ee.message:String(ee)}`]}}}function Vt(P,A,q={}){let V=u(P,q),ee=un(A,P.home);if(ee.errors.length>0)return{path:V,policy:W(),errors:ee.errors};let ne=ee.policy;return xg(Cg(V),{recursive:!0,mode:448}),g(re(V),`${JSON.stringify(ne,null,2)}
`,384),kg(V,384),{path:V,policy:ne,errors:[]}}function Bc(P,A){let q=un(A,P.home);if(q.errors.length>0)return{errors:q.errors};return{preview:Ae(q.policy,P.env),errors:[]}}function qc(P,A={}){let q=u(P,A);if(!Hc(q))return Vt(P,X,A);let V=Uc(q,"utf-8");if(!V.trim())return Vt(P,X,A);try{return Vt(P,C(JSON.parse(V),P.home),A)}catch{return Vt(P,X,A)}}var Vc=new Set(["check","apply"]),zc="(unset)";async function Wc(P,A,q={}){let V=xt({label:"policy",booleans:{global:["-g","--global"]},positionals:"list"},A),ee=V.positionals[0],ne=[...V.errors,...ee&&!Vc.has(ee)?[`Unknown policy subcommand: ${ee}`]:[],...ee&&Vc.has(ee)&&!V.positionals[1]?[`policy ${ee} requires a file`]:[],...V.positionals.slice(2).map((Re)=>`Unexpected policy argument: ${Re}`)];if(ne.length>0){for(let Re of ne)console.error(Re);return 1}let ce=V.positionals[1];if(!ee||!ce)return Cn(or,console.error),1;let he=V.flags.global?u(P):b(q.cwd??process.cwd()),ye=pn(ce),be=[...ye.errors,...Yn(ye.value,P.home).map((Re)=>`${ce}: ${Re}`),...!V.flags.global&&Ag(ye.value)&&ye.value.audit!==void 0?[`${ce}: audit settings are user scope only; remove the audit section from a project proposal`]:[]];if(be.length>0){for(let Re of be)console.error(Re);return 1}let xe=C(ye.value,P.home);if(console.log(`Scope: ${V.flags.global?"user":"project"} (${he})`),console.log(`Proposal: ${ce}`),V.flags.global)Jc(C(pn(he).value,P.home),xe,!0);if(!V.flags.global){let Re=Xn(P).baseline;console.log("Effective policy (user + project merged):"),Jc(Z(Re,ae(pn(he).value,P.home).policy).policy,Z(Re,ae(ye.value,P.home).policy).policy,!1)}if(ee==="check")return 0;let Ie=q.input??process.stdin,Xe=q.output??process.stdout;if(!Ie.isTTY||!Xe.isTTY)return console.error("policy apply confirms interactively; run this yourself in a terminal:"),console.error(`  cc-safety-net policy apply ${ce}${V.flags.global?" --global":""}`),1;if(!await Eg(`Apply this policy to ${he}? [y/N] `,Ie,Xe))return console.log("Cancelled; nothing was written."),0;return Dg(P,he,ye.value,xe,V.flags.global),console.log(`Policy applied: ${he}`),0}function Eg(P,A,q){let V=Pg({input:A,output:q,terminal:!1});return new Promise((ee)=>{V.once("close",()=>ee(!1)),V.question(P,(ne)=>{ee(/^y(es)?$/i.test(ne.trim())),V.close()})})}function Dg(P,A,q,V,ee){if(ee){Vt(P,V);return}Sg(Rg(A),{recursive:!0}),Pt(A,Vr(q,V))}function Jc(P,A,q){let V=qr(P,A,q);if(V.length===0){console.log("No changes.");return}console.log(`Changes (${V.length}):`);for(let ee of V)console.log(`  ${ee.field}: ${ee.before??zc} -> ${ee.after??zc}`)}function Ag(P){return!!P&&typeof P==="object"&&!Array.isArray(P)}import{join as Bh}from"node:path";var Kc="# Custom Rules Reference\n\nAgent reference for generating CC Safety Net rulebook configuration.\n\n## Config Locations\n\n| Scope | Config path | Rulebook path | Priority |\n|-------|-------------|---------------|----------|\n| User | `~/.cc-safety-net/rules/rule.json` | `~/.cc-safety-net/rules/<rulebook-name>/rulebook.json` | First |\n| Project | `.cc-safety-net/rules/rule.json` | `.cc-safety-net/rules/<rulebook-name>/rulebook.json` | Second |\n| GitHub source | Listed in a local `rule.json` | Vendored into the consumer's `<rulebook-name>/rulebook.json` by `rule add` | Source order |\n\nEvery rulebook is a live file: the runtime reads it on each tool call, so an edit applies to the next command with no publishing step.\n\nUser scope is evaluated before project scope; within a scope, sources apply in `rules` array order. A duplicate active rulebook name keeps the first claim and ignores the later rulebook with a warning, so a user-scoped name shadows a project-scoped one.\n\nUse `cc-safety-net rule init` to create an inert local config. Use `--global` for user scope. Use `cc-safety-net rule init --example` to also create an inactive example rulebook. `CC_SAFETY_NET_HOME` overrides the `~/.cc-safety-net` user root.\n\nLegacy inline `.safety-net.json` and `~/.cc-safety-net/config.json` files are not loaded at runtime. Convert them with `cc-safety-net rule migrate`.\n\n## rule.json Schema\n\n```json\n{\n  \"version\": 1,\n  \"rules\": [\"project-rules\", \"owner/repo#main/team-rules\"],\n  \"overrides\": {\n    \"project-rules/block-docker-system-prune\": {\n      \"reason\": \"Use targeted Docker cleanup commands.\"\n    },\n    \"team-rules/block-npm-global\": \"off\"\n  },\n  \"transparent_wrappers\": [\"rtk\"]\n}\n```\n\n- `version`: Required. Must be `1`.\n- `$schema`: Optional. `cc-safety-net rule verify` inserts it into a valid `rule.json` that lacks it.\n- `rules`: Optional array of rulebook source strings. Missing `rules` is treated as `[]`.\n- `overrides`: Optional object keyed by `<rulebook-name>/<rule-name>`.\n- `overrides` values are either `\"off\"` to disable a rule or an object with a required `reason` (replacement block reason) and an optional `intent` (one of `hard_stop`, `use_alternative`, `scope_down`, `manual_only`, `stop_and_explain`).\n- A project override cannot target a user-scoped rule: only that override is ignored, the user rule keeps its configured state, and `rule verify` reports the diagnostic as a failure.\n- `transparent_wrappers`: Optional array of command names that transparently execute a visible child command.\n- Transparent wrappers have no built-in defaults. Configure only wrappers you intentionally trust, such as `\"rtk\"`.\n- Use `cc-safety-net rule wrapper add rtk` to configure RTK without manually editing `rule.json`.\n\n## Rulebook Sources\n\n- Local sources are bare rulebook names such as `project-rules`; the rulebook file is `.cc-safety-net/rules/project-rules/rulebook.json`.\n- Run `cc-safety-net rule add owner/repo` to add every rulebook currently present on the repository's default branch.\n- Use `--only` to select one or more rulebooks while preserving their order: `cc-safety-net rule add owner/repo --only aws gcloud`.\n- Use `--ref` to select a branch, tag, or commit instead of the default branch: `cc-safety-net rule add owner/repo --ref v2 --only aws`.\n- GitHub sources are stored in canonical form as `owner/repo#ref/<rulebook-name>`. That form remains valid in `rule.json` and as direct CLI input.\n- GitHub refs may contain `/`-separated path segments, such as `feature/rulebook-v2`.\n- The GitHub source name, the repository directory name, and the rulebook `name` must match exactly.\n- Rulebook source strings must be unique in a config.\n\n## rulebook.json Schema\n\n```json\n{\n  \"rulebook_version\": 1,\n  \"name\": \"project-rules\",\n  \"version\": \"1.0.0\",\n  \"description\": \"Project-specific CC Safety Net rules.\",\n  \"author\": \"project\",\n  \"allowed_commands\": [\"docker\"],\n  \"rules\": [\n    {\n      \"name\": \"block-docker-system-prune\",\n      \"command\": \"docker\",\n      \"subcommand\": \"system\",\n      \"block_args\": [\"prune\"],\n      \"reason\": \"Use targeted cleanup instead.\"\n    }\n  ],\n  \"tests\": [\n    {\n      \"command\": \"docker system prune\",\n      \"expect\": \"blocked\",\n      \"rule\": \"block-docker-system-prune\"\n    },\n    {\n      \"command\": \"docker ps\",\n      \"expect\": \"allowed\"\n    }\n  ]\n}\n```\n\n### Rulebook Fields\n\n| Field | Required | Constraints |\n|-------|----------|-------------|\n| `rulebook_version` | Yes | Must be `1` or `2` |\n| `name` | Yes | `^[a-zA-Z][a-zA-Z0-9_-]{0,63}$` |\n| `version` | Yes | Non-empty string |\n| `description` | No | Free text; not type-checked at runtime |\n| `author` | No | Free text; not type-checked at runtime |\n| `allowed_commands` | Yes | Unique command names matching `^[a-zA-Z][a-zA-Z0-9_-]*$` |\n| `rules` | Yes | Array of rule objects |\n| `tests` | No | Array of fixtures |\n\n### Rule Fields\n\n| Field | Required | Constraints |\n|-------|----------|-------------|\n| `name` | Yes | Unique within the rulebook (case-insensitive); same pattern as rulebook `name` |\n| `command` | Yes | Must be listed in `allowed_commands`; basename only, not path |\n| `subcommand` | No | Same pattern as `command`; omit to match any subcommand |\n| `intent` | No | One of `hard_stop`, `use_alternative`, `scope_down`, `manual_only`, `stop_and_explain` |\n| `block_args` | Yes | Non-empty array of non-empty strings |\n| `reason` | Yes | Non-empty string, max 256 chars |\n\n### Rule Fields (`rulebook_version` 2)\n\nVersion 2 replaces `subcommand` and `block_args` with an exact-token `match` object. Version 1 rulebooks keep their fields and their behavior; a client that does not support version 2 rejects the rulebook instead of applying broader version 1 semantics.\n\n```json\n{\n  \"name\": \"block-terraform-apply-destroy\",\n  \"command\": \"terraform\",\n  \"match\": {\n    \"command_path\": [\"apply\"],\n    \"any_args\": [\"-destroy\", \"--destroy\"]\n  },\n  \"reason\": \"Review a destroy plan first with 'terraform plan -destroy'.\",\n  \"intent\": \"use_alternative\"\n}\n```\n\n| Field | Required | Constraints |\n|-------|----------|-------------|\n| `name` | Yes | Same as version 1 |\n| `command` | Yes | Same as version 1 |\n| `match.command_path` | Yes | Non-empty array of non-empty command words |\n| `match.any_args` | No | Non-empty array of unique non-empty argument tokens |\n| `match.exclude_args` | No | Non-empty array of unique non-empty argument tokens |\n| `intent` | No | Same as version 1 |\n| `reason` | Yes | Same as version 1 |\n\n### Matching Behavior (`rulebook_version` 2)\n\n- **Command**: Normalized to lowercase basename, as in version 1.\n- **Command path**: After recognized global options and their values are skipped, the next command words must equal `command_path` exactly. AWS, gcloud, and Azure CLI value-taking global options are built in; Terraform's `-chdir=dir` is `=`-joined and is skipped with its own token.\n- **Unrecognized options**: A token starting with `-` that is not a recognized global option is skipped without consuming a value, so an unlisted value-taking option with a separate value (`--newflag value`) makes the rule miss. This fails open deliberately; document such gaps in the rulebook.\n- **`any_args`**: At least one listed token must appear literally among the arguments.\n- **`exclude_args`**: Any listed token appearing literally among the arguments prevents the match, which is how a safe preview such as `aws s3 rm --dryrun` stays allowed.\n- **No short-option expansion**: Arguments compare as exact tokens, so list every accepted spelling (`\"-destroy\"` and `\"--destroy\"`).\n- **Literal and case-sensitive**: No regex, glob, or substring matching. The first matching rule wins.\n- Release channels are separate rules: `gcloud beta compute instances delete` needs its own `command_path`.\n\n### Test Fixture Fields\n\n| Field | Required | Constraints |\n|-------|----------|-------------|\n| `command` | Yes | Non-empty shell command string |\n| `expect` | Yes | `\"blocked\"` or `\"allowed\"` |\n| `rule` | Required for blocked fixtures | Rule name expected to block the command |\n\nFixtures are optional documentation of intended behavior. Version 1 fixtures are shape-validated only. Version 2 fixtures are evaluated against the rulebook's own rules when a source is fetched by `rule add` or `rule update`, and by `rule verify`; a failing fixture rejects that source before it is written. Loading a rulebook does not re-evaluate fixtures. CC Safety Net never executes fixture commands; they are analyzer inputs only.\n\n## Matching Behavior\n\nThe subcommand, argument, and option rules below describe `rulebook_version` 1 rules; version 2 rules match as described in Matching Behavior (`rulebook_version` 2). Execution order and transparent wrappers apply to both.\n\n- **Command**: Normalized to lowercase basename with any trailing `.exe` removed (`/usr/bin/git` → `git`).\n- **Subcommand**: The first command token after recognized Git and Docker global options and their values; `--` ends option parsing. An unrecognized option without `=` may consume the following token as its value.\n- **Arguments**: Each `block_args` value is compared literally against every command token, including expanded short options. The command is blocked if **any** item matches.\n- **Short options**: Expanded (`-Ap` matches `-A`).\n- **Long options**: Exact match (`--all-files` does not match `--all`).\n- **Execution order**: Built-in rules first, then custom rulebooks. Custom rules only add restrictions.\n- **Transparent wrappers**: A configured wrapper such as `rtk` lets `rtk git commit` be analyzed as `git commit` only when `git` is protected by built-in analyzers or active custom rules. `rtk -- git commit` is also supported.\n\n## Workflow\n\n1. Run `cc-safety-net rule init` or create `rule.json` manually.\n2. Optionally run `cc-safety-net rule init --example` to create an inactive example rulebook.\n3. Use `cc-safety-net rule wrapper add rtk` for trusted transparent wrappers.\n4. Run `cc-safety-net rule add <source>` after creating or choosing a rulebook source; add `--only <rulebook...>` or `--ref <ref>` for repository selection. The command adds the selected sources and syncs them.\n5. Edit a local rulebook whenever you like: the edit is enforced on the next command, so there is nothing to run afterwards.\n6. Run `cc-safety-net rule update [source]` to re-fetch remote sources and rewrite the vendored copies; the command prints what changed. A source with an ordinary update failure keeps its vendored copy while the other selected sources still update. Resource-limit failures remain fatal for the whole update.\n7. Run `cc-safety-net rule verify` to validate config, local rulebooks, and shareable GitHub-source rulebook directories in the current repository (it does not fetch remote content).\n8. Run `cc-safety-net rule list` to inspect active rulebooks and transparent wrappers.\n\nA missing or invalid rulebook file makes that source inactive, and an unreadable or invalid `rule.json` makes every source in its scope inactive. Inactive sources stop applying their rules while other custom rules and all built-in protections stay active. Fix the file named in the diagnostic, or run `cc-safety-net rule update` when a remote source has not been vendored yet. Run `cc-safety-net status` to see degraded sources.\n";function zr(P,A){if(!P.ok){ed(P);return}Zc(P,A)}function Xc(P,A,q){if(P.ok)console.log(q);if(!P.add){zr(P,`Added rulebook source: ${A}`);return}if(!P.ok){ed(P);return}if(P.add.added.length>0)console.log(`Added ${P.add.added.length} ${P.add.added.length===1?"rulebook":"rulebooks"} from ${P.add.source} at ${P.add.ref}:`),P.add.added.forEach((V)=>{console.log(`  - ${V}`)});if(P.add.alreadyConfigured.length>0)console.log(`Rulebooks already configured from ${P.add.source} at ${P.add.ref}: ${P.add.alreadyConfigured.join(", ")}`);if(P.add.commits.length>0)console.log(`Vendored at ${P.add.commits.map((V)=>V.slice(0,7)).join(", ")}.`);Zc(P,"Rule config updated.")}function Zc(P,A){for(let q of P.changes??[])console.log(q);console.log(A),console.log(""),_g(P.entries)}function _g(P){if(P.length===0){console.log("Active rulebooks: (none)");return}console.log(`Active rulebooks (${P.length}):`);for(let A of P)console.log(`  - ${A.name} ${A.version} (${Tg(A.ruleCount)})`),console.log(`    Source: ${A.spec}`)}function Tg(P){return`${P} ${P===1?"rule":"rules"}`}function Qc(P){fn("Active sources",P.rulebooks,(A)=>[`[${A.source}] ${A.name} ${A.version}`,`  Source: ${A.spec}`]),fn("Active rules",P.rules,(A)=>[`[${$g(P,A.name)}] ${A.name}`,...Ig(A),`  Reason: ${A.reason}`]),fn("Disabled rules",Yc(P,"off"),(A)=>[A.key]),fn("Reason overrides",Yc(P,"reason"),(A)=>[A.key,`  Reason: ${A.value.reason}`]),fn("Transparent wrappers",P.transparent_wrappers,(A)=>[A]),fn("Issues",P.errors,(A)=>[A]),fn("Warnings",P.warnings,(A)=>[A])}function fn(P,A,q){if(A.length===0){console.log(`${P}: (none)`);return}console.log(`${P} (${A.length}):`);for(let V of A){let[ee,...ne]=q(V);console.log(`  - ${ee}`);for(let ce of ne)console.log(`    ${ce}`)}}function Ig(P){if(!P.match)return[`  Command: ${P.subcommand?`${P.command} ${P.subcommand}`:P.command}`,`  Block args: ${P.block_args.join(", ")}`];return[`  Command: ${[P.command,...P.match.command_path].join(" ")}`,...P.match.any_args?[`  Any args: ${P.match.any_args.join(", ")}`]:[],...P.match.exclude_args?[`  Exclude args: ${P.match.exclude_args.join(", ")}`]:[]]}function $g(P,A){return P.rulebooks.find((q)=>q.rules.includes(A))?.source??"project"}function Yc(P,A){return Object.entries({...P.userConfig?.overrides,...P.projectConfig?.overrides}).filter((q)=>{if(A==="off")return q[1]==="off";return!!q[1]&&typeof q[1]==="object"}).map(([q,V])=>({key:q,value:V}))}function ed(P){for(let A of P.errors)console.error(A)}import{dirname as xd,join as eo}from"node:path";import{join as Ai,resolve as zg}from"node:path";function Ri(P){let A=m(P);if(A.errors.length>0)return{ok:!1,result:{ok:!1,errors:A.errors,entries:[]}};return{ok:!0,config:A.config??it}}function td(P){Pt(P,{version:1,rules:[],overrides:{},transparent_wrappers:[]})}function nd(P){Pt(P,{rulebook_version:1,name:"example-rules",version:"1.0.0",description:"Project-specific CC Safety Net rules.",author:"project",allowed_commands:["docker"],rules:[{name:"block-docker-system-prune",command:"docker",subcommand:"system",block_args:["prune"],reason:"Use targeted cleanup instead."}],tests:[{command:"docker system prune",expect:"blocked",rule:"block-docker-system-prune"}]})}import{dirname as Yr}from"node:path";var Og="custom.";function Jr(P){if(P.rulebook_version!==2)return[];let A=P.rules.map((q)=>({name:q.name,command:q.command,block_args:[],match:q.match,reason:q.reason,intent:q.intent}));return(P.tests??[]).flatMap((q,V)=>{let ee=Pi(h(q.command));if(ee.length===0)return[`tests[${V}]: could not parse fixture command: ${q.command}`];let ne=ee.reduce((ce,he)=>ce??_(he,A)?.id.slice(Og.length),void 0);if(q.expect==="blocked"){if(ne===q.rule)return[];let ce=ne?`"${ne}" matched first`:"no rule matched";return[`tests[${V}]: expected "${q.rule}" to block "${q.command}" but ${ce}`]}return ne?[`tests[${V}]: expected "${q.command}" to be allowed but "${ne}" matched`]:[]})}function Pi(P){return P.nodes.flatMap((A)=>{if(A.kind==="group"||A.kind==="function")return Pi(A.body);if(A.kind!=="command")return[];let q=ge(Q(A.dialect,A.words)).words.map(t);return[...q.length>0?[q]:[],...A.nested.flatMap((V)=>Pi(V))]})}var Wr=Object.freeze({concurrency:4,maxRequests:131,maxResponseBytes:67108864});function Kr(P={}){return{requests:0,responseBytes:0,maxRequests:P.maxRequests??Wr.maxRequests,maxResponseBytes:P.maxResponseBytes??Wr.maxResponseBytes}}function zt(P){return{controller:new AbortController,budget:Kr(),resolveUrl:P}}function rd(P){return P instanceof Error&&P.message==="Rule synchronization exceeds CC Safety Net's safe resource limits."}function od(P){if(P.requests>=P.maxRequests)throw Error("Rule synchronization exceeds CC Safety Net's safe resource limits.");P.requests++}function id(P,A){if(A>P.maxResponseBytes-P.responseBytes)throw P.responseBytes+=A,Error("Rule synchronization exceeds CC Safety Net's safe resource limits.");P.responseBytes+=A}var ld=Object.freeze({timeoutMs:15000,metadataBytes:524288,commitBytes:262144,treeBytes:16777216,rawBytes:4194304});async function sd(P,A,q=v(Yr(Yr(A)),"rules policy"),V=zt()){if(S(P))return Mg(P,V);return jg(P,A,q)}async function cd(P,A,q,V,ee,ne){if(!S(P))return sd(P,A,q,V);let ce=ee?null:Fg(P,A,q);if(ce)return ce;if(!ee&&!ne)throw Error(`${P} is not vendored; run rule update ${P} to vendor it`);return sd(P,A,q,V)}function Fg(P,A,q=v(Yr(Yr(A)),"rules policy")){let V=I(P),ee=O(A,V.name),ne=n(i(q,ee));if(ne===null)return null;let ce=se(Ei(ne,`Invalid rulebook ${ee}.`));if(ce.name!==V.name)throw Error(`rulebook name "${ce.name}" in ${ee} must match "${V.name}"`);return{spec:P,rulebook:ce,content:ne}}async function dd(P,A={}){if(!K(P))throw Error(`Invalid GitHub repository source: ${P}`);let[q,V]=P.split("/");if(!q||!V)throw Error(`Invalid GitHub repository source: ${P}`);if(A.ref!==void 0&&!oe(A.ref))throw Error(`GitHub rulebook refs must use valid path segments: ${A.ref}`);let ee=A.operation??zt(),ne=A.ref??await Ng(q,V,P,ee),ce=await pd(q,V,ne,P,ee),he=await Xr(`https://api.github.com/repos/${q}/${V}/git/trees/${ce}?recursive=1`,"tree",ee),ye=he.response;if(!ye.ok)throw Error(`Failed to inspect ${P}: GitHub tree returned ${ye.status}`);let be=JSON.parse(he.content);if(!Array.isArray(be?.tree))throw Error(`Failed to inspect ${P}: unexpected GitHub tree response`);let xe=be.tree,Ie=[...new Set(xe.flatMap((Xe)=>{if(!Xe||typeof Xe!=="object")return[];let et=Xe;if(et.type!=="blob"||typeof et.path!=="string")return[];let Re=et.path.match(rt);return Re?.[1]?[Re[1]]:[]}))].sort();if(Ie.length===0)throw Error(`No rulebooks found in ${P} under ${de}/`);return{source:P,owner:q,repo:V,ref:ne,commit:ce,names:Ie}}async function Ng(P,A,q,V){let ee=await Xr(`https://api.github.com/repos/${P}/${A}`,"metadata",V),ne=ee.response;if(!ne.ok)throw Error(`Failed to inspect ${q}: GitHub returned ${ne.status}`);let he=JSON.parse(ee.content)?.default_branch;if(typeof he!=="string"||he==="")throw Error(`Failed to inspect ${q}: missing default branch`);if(!oe(he))throw Error(`GitHub returned an invalid default branch: ${he}`);return he}function jg(P,A,q){ot(P);let V=O(A,P),ee=n(i(q,V));if(ee===null)throw Error(`Rulebook source not found: ${P}`);let ne=ud(Ei(ee,"Invalid local rulebook source."));if(ne.name!==P)throw Error(`rulebook name "${ne.name}" must match local source "${P}"`);return{spec:P,rulebook:ne,content:ee}}async function Mg(P,A){let q=I(P),V=await pd(q.owner,q.repo,q.ref,P,A),ee=await Xr(`https://raw.githubusercontent.com/${q.owner}/${q.repo}/${V}/${q.path}`,"raw",A),ne=ee.response;if(!ne.ok)throw Error(`Failed to fetch ${P}: GitHub raw returned ${ne.status}`);let ce=ee.content,he=ud(Ei(ce,"Invalid GitHub rulebook response."));if(he.name!==q.name)throw Error(`rulebook name "${he.name}" must match GitHub source "${q.name}"`);return{spec:P,rulebook:he,content:ce}}function ud(P){let A=se(P),q=Jr(A);if(q.length>0)throw Error(q.join("; "));return A}function Ei(P,A){try{return JSON.parse(P)}catch{throw Error(A)}}async function pd(P,A,q,V,ee){let ne=await Xr(`https://api.github.com/repos/${P}/${A}/commits/${encodeURIComponent(q)}`,"commit",ee),ce=ne.response;if(!ce.ok)throw Error(`Failed to resolve ${V}: GitHub returned ${ce.status}`);let he=JSON.parse(ne.content);if(typeof he?.sha!=="string"||he.sha==="")throw Error(`Failed to resolve commit for ${V}`);return he.sha}async function Hg(P,A,q={}){if(q.signal?.aborted)throw q.signal.reason;let V=q.budget??Kr(),ee=new AbortController,ne=()=>ee.abort(q.signal?.reason);q.signal?.addEventListener("abort",ne,{once:!0});let ce=!1,he=setTimeout(()=>{if(ee.signal.aborted)return;ce=!0,ee.abort()},q.timeoutMs??ld.timeoutMs);try{if(q.signal?.aborted)throw q.signal.reason;od(V);let ye=await fetch(P,{signal:ee.signal,redirect:"error"});if(!ye.ok)return fd(ye),{response:ye,content:""};return{response:ye,content:await Ug(ye,A,V,()=>ee.abort())}}catch(ye){if(ce)throw Error("GitHub request timed out",{cause:ye});if(q.signal?.aborted)throw q.signal.reason;throw ye}finally{clearTimeout(he),q.signal?.removeEventListener("abort",ne)}}function Xr(P,A,q){return Hg(q.resolveUrl?.(P)??P,A,{budget:q.budget,signal:q.controller.signal})}async function Ug(P,A,q=Kr(),V){let ee=ld[`${A}Bytes`],ne=Number(P.headers.get("content-length"));if(Number.isFinite(ne)&&ne>ee)throw fd(P),Error(`GitHub ${A} response exceeds ${ee} bytes`);if(!P.body)return"";let ce=P.body.getReader(),he=[],ye=0;while(!0){let be=await ce.read();if(be.done)break;try{id(q,be.value.byteLength)}catch(xe){throw V?.(),ad(ce),xe}if(ye+=be.value.byteLength,ye>ee)throw V?.(),ad(ce),Error(`GitHub ${A} response exceeds ${ee} bytes`);he.push(Buffer.from(be.value))}return Buffer.concat(he,ye).toString("utf-8")}function fd(P){if(!P.body)return;md(()=>P.body?.cancel())}function ad(P){md(()=>P.cancel())}function md(P){try{Promise.resolve(P()).catch(()=>{})}catch{}}var Gg=/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(.+)$/;function gd(P,A){let q=vd(P.rules,A);if(q.length>0)return{ok:!0,specs:q};return yd(P.rules,A)}function hd(P,A){let q=vd(P,A);if(q.length>0)return{ok:!0,specs:q};let V=qg(P,A);if(V.length>0)return{ok:!0,specs:V};let ee=Vg(P,A);if(!ee.ok)return ee;if(ee.specs.length>0)return{ok:!0,specs:ee.specs};return yd(P,A)}function yd(P,A){let q=P.filter((V)=>Di(V)?.name===A);if(q.length===1)return{ok:!0,specs:q};return Bg(A,q)}function Bg(P,A){return{ok:!1,result:{ok:!1,errors:A.length===0?[`No configured rulebook matches ${P}`]:[`Ambiguous rulebook match ${P}: ${A.join(", ")}`],entries:[]}}}function vd(P,A){return P.filter((q)=>q===A)}function qg(P,A){let q=A.match(Gg),V=q?.[1],ee=q?.[2],ne=q?.[3];if(!V||!ee||!ne||!oe(ne))return[];return bd(P,(ce)=>ce.owner===V&&ce.repo===ee&&ce.ref===ne)}function Vg(P,A){if(!K(A))return{ok:!0,specs:[]};let[q,V]=A.split("/"),ee=bd(P,(ce)=>ce.owner===q&&ce.repo===V);if(new Set(ee.map((ce)=>Di(ce)?.ref).filter((ce)=>!!ce)).size<2)return{ok:!0,specs:ee};return{ok:!1,result:{ok:!1,errors:[`Multiple refs are configured for ${A}. Use an explicit ref:`,`  cc-safety-net rule remove ${A}#<ref>`],entries:[]}}}function Di(P){try{return I(P)}catch{return null}}function bd(P,A){return P.filter((q)=>{let V=Di(q);return V?A(V):!1})}async function Qr(P,A={}){let q=_i(A);return Jg(P,q,await Zr(P,q,zt()))}function Jg(P,A,q){if(!q.ok)return q;let V=Et(P,A),ee=[...new Set(U(V.configPath,V.filesystemScope))];if(ee.length===0)return q;return{ok:!1,errors:ee,entries:q.entries}}async function Zr(P,A,q,V={},ee=new Set,ne=new Set){try{let ce=Et(P,A),he=Ri(ce.configTarget);if(!he.ok)return he.result;let ye=he.config,be=A.only?gd(ye,A.only):{ok:!0,specs:ye.rules};if(!be.ok)return be.result;let xe=new Set([...A.refresh?be.specs:[],...ee]),Ie=(ut)=>cd(ut,ce.configDir,ce.filesystemScope,q,xe.has(ut),!A.refresh||xe.has(ut)),Xe=await oh(ye.rules,A.refresh?(ut)=>Ie(ut).then((vt)=>({ok:!0,item:vt})).catch((vt)=>{if(rd(vt))throw vt;return{ok:!1,spec:ut,message:vt instanceof Error?vt.message:String(vt)}}):async(ut)=>({ok:!0,item:await Ie(ut)}),q),et=Xe.filter((ut)=>!ut.ok),Re=Xe.filter((ut)=>ut.ok).map((ut)=>ut.item),at=Re.flatMap((ut)=>Wg(ut,ye.rules)),ct=Re.flatMap((ut)=>Kg(ut,ne,ce)),lt=new Set([...at,...ct].map((ut)=>ut.spec)),ft=[...et,...at,...ct],mt=[],gt=Xg(mt,()=>Re.flatMap((ut)=>lt.has(ut.spec)||ft.length>0&&ne.has(ut.spec)?[]:Yg(ut,ce,V,mt)));return{ok:ft.length===0,errors:ft.map((ut)=>`Failed to update ${ut.spec}: ${ut.message}`),entries:Re.map(Qg),changes:gt}}catch(ce){return Qn(ce)}}function Wg(P,A){if(!S(P.spec))return[];let q=Pe(P.spec),V=A.filter((ee)=>ee!==P.spec&&Pe(ee).toLowerCase()===q.toLowerCase());if(V.length===0)return[];return[{ok:!1,spec:P.spec,message:`rulebook name "${q}" is also claimed by ${V.join(", ")}; rename one of them`}]}function Kg(P,A,q){if(!A.has(P.spec)||!S(P.spec))return[];let V=O(q.configDir,P.rulebook.name),ee=n(i(q.filesystemScope,V));if(ee===null||ee===P.content)return[];return[{ok:!1,spec:P.spec,message:`${V} already exists and no configured source claims it; remove or rename the file, then re-run rule add`}]}function Yg(P,A,q,V){if(!S(P.spec))return[];let ee=O(A.configDir,P.rulebook.name),ne=i(A.filesystemScope,ee),ce=n(ne);if(ce===P.content)return[];return V?.push({target:ne,previous:ce}),g(ne,P.content,void 0,q._testAfterPolicyRename),Zg(P,ce)}function Xg(P,A){try{return A()}catch(q){for(let V of[...P].reverse()){if(V.previous===null){F(V.target);continue}g(V.target,V.previous)}throw q}}function Zg(P,A){if(A===null)return[`Vendored ${P.spec} (${P.rulebook.version})`];let q=me(A),V="problem"in q?null:q.rulebook,ee=new Map(V?.rules.map((ce)=>[ce.name,JSON.stringify(ce)])??[]),ne=new Set(P.rulebook.rules.map((ce)=>ce.name));return[`Updated ${P.spec} (${V?.version??"unreadable"} -> ${P.rulebook.version})`,...[...ne].filter((ce)=>!ee.has(ce)).map((ce)=>`  + ${ce}`),...[...ee.keys()].filter((ce)=>!ne.has(ce)).map((ce)=>`  - ${ce}`),...P.rulebook.rules.filter((ce)=>{let he=ee.get(ce.name);return he!==void 0&&he!==JSON.stringify(ce)}).map((ce)=>`  ~ ${ce.name}`)]}function Qg(P){return{spec:P.spec,name:P.rulebook.name,version:P.rulebook.version,ruleCount:P.rulebook.rules.length}}async function Ld(P,A,q={}){return eh(P,A,sh(q),zt())}async function eh(P,A,q,V,ee={}){let ne=null,ce=!1;try{let he=Et(P,q),ye=n(he.configTarget);ne={target:he.configTarget,content:ye};let be=Ri(he.configTarget);if(!be.ok)return be.result;let xe=be.config,Ie=K(A);th(A,q,Ie);let Xe=Ie?await dd(A,{ref:q.ref,operation:V}):null,et=Xe?nh(Xe,q.rulebooks):[],Re=Xe?et.map((mt)=>rh(xe.rules,Xe,mt)??`${A}#${Xe.ref}/${mt}`):[A],at=Re.filter((mt)=>!xe.rules.includes(mt)),ct=[...xe.rules,...at];if(ct.length>pe)return ih();if(ct.length!==xe.rules.length)ce=!0,Pt(he.configTarget,{version:1,rules:ct,overrides:xe.overrides??{},transparent_wrappers:xe.transparent_wrappers??[]},void 0,ee._testAfterPolicyRename);let lt=await Zr(P,q,V,ee,new Set(at),new Set(at));if(!lt.ok)Zn(he.configTarget,ye);if(!lt.ok||!Xe)return lt;let ft=et.filter((mt,gt)=>at.includes(Re[gt]??""));return{...lt,add:{source:A,ref:Xe.ref,selected:et,added:ft,alreadyConfigured:et.filter((mt)=>!ft.includes(mt)),commits:at.length>0?[Xe.commit]:[]}}}catch(he){if(ce&&ne)try{Zn(ne.target,ne.content)}catch(ye){return Qn(ye)}return Qn(he)}}function th(P,A,q){if(!q&&A.rulebooks!==void 0)throw Error("--only can only select rulebooks from an owner/repo source");if(!q&&A.ref)throw Error(`--ref can only select a ref for an owner/repo source: ${P}`);if(A.rulebooks?.length===0)throw Error("--only requires at least one rulebook name");let V=A.rulebooks?.filter((ee)=>!l.test(ee))??[];if(V.length>0)throw Error(`Invalid rulebook names: ${V.join(", ")}`)}function nh(P,A){let q=A?[...new Set(A)]:P.names,V=q.filter((ee)=>!P.names.includes(ee));if(V.length>0)throw Error(`Rulebooks not found in ${P.source} at ${P.ref}: ${V.join(", ")}
Available rulebooks: ${P.names.join(", ")}`);return q}function rh(P,A,q){let V=`${A.source}#${A.ref}/${q}`;if(P.includes(V))return V;let ee=`${A.source}#${A.commit}/${q}`;return P.find((ne)=>ne===ee)}async function oh(P,A,q=zt()){if(P.length>pe)throw Error(fe);let V=[],ee=0,ne,ce=Array.from({length:Math.min(P.length,Wr.concurrency)},async()=>{while(!ne){let he=ee;if(he>=P.length)return;ee++;try{V[he]=await A(P[he],he,q.controller.signal)}catch(ye){if(!ne)ne={value:ye},ee=P.length,q.controller.abort(ye);return}}});if(await Promise.all(ce),ne)throw ne.value;return V}function ih(){return{ok:!1,errors:[fe],entries:[]}}function _i(P){return{cwd:P.cwd,userConfigDir:P.userConfigDir,userConfigPath:P.userConfigPath,projectConfigPath:P.projectConfigPath,global:P.global,only:P.only,refresh:P.refresh}}function sh(P){return{..._i(P),ref:P.ref,rulebooks:P.rulebooks}}function ah(P){return{..._i(P),deleteSource:P.deleteSource}}async function wd(P,A,q={}){try{return await lh(P,A,ah(q),{})}catch(V){return Qn(V)}}async function lh(P,A,q,V){let ee=Et(P,q),ne=m(ee.configTarget);if(ne.errors.length>0)return{ok:!1,errors:ne.errors,entries:[]};if(!ne.config)return{ok:!1,errors:[`No config found at ${ee.configPath}`],entries:[]};let ce=hd(ne.config.rules,A);if(!ce.ok)return ce.result;let he=q.deleteSource?ch(ee.configDir,ce.specs,ee.filesystemScope):{ok:!0,dirs:[]};if(!he.ok)return he.result;let ye=n(ee.configTarget);if(ye===null)return Qn(Error("Rules config is unavailable."));try{Pt(ee.configTarget,{version:1,rules:ne.config.rules.filter((Ie)=>!ce.specs.includes(Ie)),overrides:ne.config.overrides??{},transparent_wrappers:ne.config.transparent_wrappers??[]},void 0,V._testAfterPolicyRename)}catch(Ie){throw Zn(ee.configTarget,ye),Ie}let be=await Zr(P,q,zt(),V);if(!be.ok)return Zn(ee.configTarget,ye),be;let xe=dh(he.dirs,V,ee.filesystemScope);if(!xe.ok){Zn(ee.configTarget,ye);let Ie=await Zr(P,q,zt(),V);if(!Ie.ok)return{ok:!1,errors:[...xe.result.errors,...Ie.errors],entries:Ie.entries};return xe.result}return be}function ch(P,A,q){let V=A.flatMap((he)=>l.test(he)?[]:["--delete-source can only delete local rulebook sources"]),ee=A.map((he)=>Ai(P,he)),ne=V.length>0?[]:ee.flatMap((he)=>kd(he,q)),ce=[...V,...ne];return ce.length>0?{ok:!1,result:{ok:!1,errors:ce,entries:[]}}:{ok:!0,dirs:ee}}function kd(P,A){let q=zg(P),V=i(A,q),ee=le(V);if(!ee)return[`Local rulebook source directory not found: ${P}`];let ne=ee.find((ce)=>ce.name==="rulebook.json");if(!ne)return[`Local rulebook source directory is missing rulebook.json: ${P}`];if(ne.kind!=="file")throw new r(A.label);if(n(i(A,Ai(q,"rulebook.json"))),ee.length>1)return[`Local rulebook source directory contains extra files: ${P}. delete manually if you really want to remove the directory.`];return[]}function dh(P,A,q){let V=P.flatMap((ee)=>{try{if(!le(i(q,ee)))return[];let ne=kd(ee,q);if(ne.length>0)return ne;return uh(ee,A,q),[]}catch(ne){return[`Failed to delete local rulebook source ${ee}: ${ne instanceof Error?ne.message:String(ne)}`]}});return V.length>0?{ok:!1,result:{ok:!1,errors:V,entries:[]}}:{ok:!0}}function uh(P,A,q){if(A._testDeleteLocalSourceDir){A._testDeleteLocalSourceDir(P);return}F(i(q,Ai(P,ue))),nt(i(q,P))}function Zn(P,A){if(A===null){F(P);return}g(P,A)}function Qn(P){return{ok:!1,errors:[P instanceof Error?P.message:String(P)],entries:[]}}var ph=".safety-net.json",fh="~/.cc-safety-net/config.json";async function Rd(P,A){return[await Cd(P,{legacyPath:Hs({cwd:A.cwd}),configPath:M(A.cwd),defaultRulebookName:"project-rules",migratedFrom:ph,cleanup:A.cleanup,syncOptions:{cwd:A.cwd}}),await Cd(P,{legacyPath:lr(P),configPath:j(P),defaultRulebookName:"user-rules",migratedFrom:fh,cleanup:A.cleanup,syncOptions:{cwd:A.cwd,global:!0}})].every((V)=>V)?0:1}async function Cd(P,A){let q=Et(P,A.syncOptions),V=i(q.filesystemScope,A.legacyPath),ee=n(V);if(ee===null)return console.log(`No legacy config found at ${A.legacyPath}`),!0;let ne=gh(ee);if(!ne.ok){for(let et of ne.errors)console.error(et);return!1}let ce=m(q.configTarget);if(ce.errors.length>0){for(let et of ce.errors)console.error(et);return!1}let he=ce.config??{version:1,rules:[],overrides:{},transparent_wrappers:[]},ye=hh(xd(A.configPath),he.rules,A.defaultRulebookName,A.migratedFrom,q.filesystemScope),be=eo(xd(A.configPath),ye,"rulebook.json"),xe=i(q.filesystemScope,be),Ie=[Sd(q.configTarget),Sd(xe)],Xe=await mh(P,A,q.configTarget,xe,ye,ne.config.rules,he.rules.includes(ye)?he.rules:[...he.rules,ye],he.overrides??{},he.transparent_wrappers??[]);if(!Xe.ok){bh(Ie);for(let et of Xe.errors)console.error(et);return!1}if(!A.cleanup)return console.log(`Migrated legacy config at ${A.legacyPath}. Legacy file is no longer used.`),!0;if(!vh(q.configTarget,xe,ye,A.migratedFrom,ne.config.rules))return console.error(`Migration cleanup verification failed for ${A.legacyPath}`),!1;return F(V),console.log(`Deleted legacy config at ${A.legacyPath}`),!0}async function mh(P,A,q,V,ee,ne,ce,he,ye){try{return Pt(q,{version:1,rules:ce,overrides:he,transparent_wrappers:ye}),Pt(V,yh(ee,A.migratedFrom,ne)),await Qr(P,A.syncOptions)}catch(be){return{ok:!1,errors:[be instanceof Error?be.message:String(be)]}}}function gh(P){try{let A=JSON.parse(P),q=uo(A);if(q.errors.length>0)return{ok:!1,errors:q.errors};return{ok:!0,config:{version:1,rules:A.rules??[]}}}catch{return{ok:!1,errors:["Invalid JSON"]}}}function hh(P,A,q,V,ee){let ne=A.find((ce)=>Lh(i(ee,eo(P,ce,"rulebook.json")))===V);if(ne)return ne;if(n(i(ee,eo(P,q,"rulebook.json")))===null)return q;for(let ce=2;;ce++){let he=`${q}-${ce}`;if(n(i(ee,eo(P,he,"rulebook.json")))===null)return he}}function yh(P,A,q){return{rulebook_version:1,name:P,version:"1.0.0",description:"Migrated CC Safety Net rules.",author:"project",migrated_from:A,allowed_commands:[...new Set(q.map((V)=>V.command))],rules:q,tests:q.map((V)=>({command:[V.command,V.subcommand,V.block_args[0]].filter(Boolean).join(" "),expect:"blocked",rule:V.name}))}}function vh(P,A,q,V,ee){if(!m(P).config?.rules.includes(q))return!1;try{let ce=n(A);if(ce===null)return!1;let he=JSON.parse(ce);return he.migrated_from===V&&JSON.stringify(he.rules)===JSON.stringify(ee)}catch{return!1}}function Sd(P){return{target:P,content:n(P)}}function bh(P){for(let A of P){if(A.content===null){F(A.target);continue}g(A.target,A.content)}}function Lh(P){let A=n(P);if(A===null)return null;try{let q=JSON.parse(A);return typeof q.migrated_from==="string"?q.migrated_from:null}catch{return null}}import{mkdir as wh,readFile as kh,writeFile as xh}from"node:fs/promises";import{dirname as Ch,join as Sh}from"node:path";var Rh=86400000,Ph=604800000;async function Ed(P,A=Date.now()){if(P.env.get("CC_SAFETY_NET_NO_UPDATE_CHECK"))return null;let q=je(P);if(!q)return null;let V=Sh(q,".cc-safety-net","update-check.json"),ee=await Eh(V,A);if(!ee.lastCheck||A-ee.lastCheck>Rh){let he=await Wt();if(ee.lastCheck=A,he.latestVersion)ee.latestVersion=he.latestVersion;if(!await Pd(V,ee))return null;if(he.error)return null}let ne=ee.latestVersion,ce=wt();if(!ne||!yo(ne,ce))return null;if(ee.notifiedVersion===ne&&ee.notifiedAt!==void 0&&A-ee.notifiedAt<Ph)return null;if(ee.notifiedVersion=ne,ee.notifiedAt=A,!await Pd(V,ee))return null;return`UPDATE_AVAILABLE: cc-safety-net v${ne} is available (running v${ce}). Ask the user once whether to run \`npx -y cc-safety-net@latest update\`; continue the current task either way and do not raise this again.`}async function Eh(P,A){let q=await kh(P,"utf8").then((ne)=>JSON.parse(ne)).catch(()=>{return});if(!q||typeof q!=="object"||Array.isArray(q))return{};let V=q,ee=(ne)=>typeof ne==="number"&&Number.isFinite(ne)&&ne<=A?ne:void 0;return{lastCheck:ee(V.lastCheck),latestVersion:typeof V.latestVersion==="string"?V.latestVersion:void 0,notifiedVersion:typeof V.notifiedVersion==="string"?V.notifiedVersion:void 0,notifiedAt:ee(V.notifiedAt)}}async function Pd(P,A){return wh(Ch(P),{recursive:!0,mode:448}).then(()=>xh(P,JSON.stringify(A),{mode:384})).then(()=>!0).catch(()=>!1)}import{join as Dh,resolve as Ti}from"node:path";var Dd="CC Safety Net Config",Ah="═".repeat(Dd.length),_h="https://raw.githubusercontent.com/kenryu42/cc-safety-net/main/assets/cc-safety-net.schema.json",Th=new Set(["rule.json","rule.lock","cache"]);function Ad(P,A={}){try{return Ih(P,A)}catch(q){if(q instanceof r)return console.error(q.message),1;throw q}}function Ih(P,A){let q=A.cwd??process.cwd(),V=J(P,{cwd:q}),ee=lr(P),ne=cs(q),ce=Ti(q,de),he=i(V.userScope,ee),ye=i(V.projectScope,ne),be=!1,xe=!1,Ie=[],Xe=[],et=$h(i(V.projectScope,ce));if(Fh(),n(V.userConfigTarget)!==null){let Re=Jt(V.userConfigTarget);if(Re.errors.push(...U(V.userConfigPath,V.userScope)),Ie.push({scope:"User",path:V.userConfigPath,result:Re,schema:"rules",target:V.userConfigTarget}),Re.errors.length>0)be=!0}if(n(he)!==null)if(xe=!0,n(V.userConfigTarget)!==null)Xe.push(to("user","cleanup"));else{let Re=po(he);if(Ie.push({scope:"User",path:ee,result:Re,schema:"legacy",inactive:!0,target:he}),Xe.push(to("user",Re.errors.length>0?"fix-or-delete":"migrate")),Re.errors.length>0)be=!0}if(n(V.projectConfigTarget)!==null){let Re=Jt(V.projectConfigTarget);if(Re.errors.push(...U(V.projectConfigPath,V.projectScope)),Ie.push({scope:"Project",path:Ti(V.projectConfigPath),result:Re,schema:"rules",target:V.projectConfigTarget}),Re.errors.length>0)be=!0;if(n(ye)!==null)xe=!0,Xe.push(to("project","cleanup"))}else if(n(ye)!==null){xe=!0,be=!0;let Re=po(ye);Ie.push({scope:"Project",path:Ti(ne),result:Re,schema:"legacy",inactive:!0,target:ye}),Xe.push(to("project",Re.errors.length>0?"fix-or-delete":"migrate"))}if(et?.result.errors.length)be=!0;if(Ie.length===0&&!et)return console.log(`
No config files found. Using built-in rules only.`),0;for(let Re of Ie)if(Re.inactive)jh(Re.scope,Re.path,Re.result);else if(Re.result.errors.length>0)Mh(Re.scope,Re.path,Re.result.errors);else{if(Re.schema==="rules"&&Gh(Re.target))console.log(`
Added $schema to ${Re.scope.toLowerCase()} config.`);Nh(Re.scope,Re.path,Re.result,Re.schema)}for(let Re of Xe)console.error(`
${dt.red(Re)}`);if(et)if(et.result.errors.length>0)Uh(et.path,et.result.errors);else Hh(et.path,et.result);if(be)return console.error(`
Config validation failed.`),1;return console.log(xe?`
Configs valid with warnings.`:`
All configs valid.`),0}function to(P,A){let q=`legacy ${P} config`;if(A==="cleanup")return`Warning: Legacy ${P} config is no longer needed. Run \`npx -y cc-safety-net rule migrate --cleanup\` to clean it up safely.`;if(A==="migrate")return`Warning: Legacy ${P} config is ignored by CC Safety Net. Run \`npx -y cc-safety-net rule migrate\`.`;return`Warning: Legacy ${P} config is no longer supported. Fix or delete the ${q}, then run \`npx -y cc-safety-net rule migrate\`.`}function $h(P){if(le(P)===null)return null;let A=Oh(P);if(A.ruleNames.size===0&&A.errors.length===0)return null;return{path:P.path,result:A}}function Oh(P){let A=[],q=new Set,V=(le(P)??[]).filter((ee)=>!Th.has(ee.name)).sort((ee,ne)=>ee.name.localeCompare(ne.name));if(V.length===0)return{errors:A,ruleNames:q};for(let ee of V){if(!l.test(ee.name)){A.push(`rulebook directory names must match ${l}: ${ee.name}`);continue}if(ee.kind!=="directory"){A.push(`${ee.name} must be a rulebook directory`);continue}let ne=i(P.scope,Dh(P.path,ee.name,"rulebook.json")),ce=n(ne);if(ce===null){A.push(`${ee.name}/rulebook.json is required`);continue}try{let he;try{he=JSON.parse(ce)}catch{A.push(`${ee.name}/rulebook.json: invalid JSON`);continue}let ye=se(he);if(ye.name!==ee.name){A.push(`rulebook name "${ye.name}" must match folder "${ee.name}"`);continue}let be=Jr(ye);if(be.length>0){A.push(...be.map((xe)=>`${ee.name}/rulebook.json: ${xe}`));continue}q.add(ee.name)}catch(he){A.push(he instanceof Error?`${ee.name}/rulebook.json: ${he.message}`:`${ee.name}/rulebook.json: ${String(he)}`)}}return{errors:A,ruleNames:q}}function Fh(){console.log(Dd),console.log(Ah)}function Nh(P,A,q,V){if(console.log(`
✓ ${P} config: ${A}`),console.log(`  Schema: ${V==="rules"?"rulebook sources":"legacy inline rules"}`),q.ruleNames.size>0){console.log(`  ${V==="rules"?"Sources":"Rules"}:`);let ee=1;for(let ne of q.ruleNames)console.log(`    ${ee}. ${ne}`),ee++}else console.log(`  ${V==="rules"?"Sources":"Rules"}: (none)`)}function jh(P,A,q){if(console.error(`
✗ Legacy ${P.toLowerCase()} config: ${A}`),console.error("  Schema: legacy inline rules"),console.error("  Status: ignored by CC Safety Net"),q.errors.length>0){console.error("  Errors:");let V=1;for(let ee of q.errors)for(let ne of ee.split("; "))console.error(`    ${V}. ${ne}`),V++;return}if(q.ruleNames.size>0){console.error("  Rules:");let V=1;for(let ee of q.ruleNames)console.error(`    ${V}. ${ee}`),V++;return}console.error("  Rules: (none)")}function Mh(P,A,q){_d(`${P} config`,A,q)}function Hh(P,A){console.log(`
✓ GitHub source rules: ${P}`),console.log("  Rulebooks:");let q=1;for(let V of A.ruleNames)console.log(`    ${q}. ${V}`),q++}function Uh(P,A){_d("GitHub source rules",P,A)}function _d(P,A,q){console.error(`
✗ ${P}: ${A}`),console.error("  Errors:");let V=1;for(let ee of q)for(let ne of ee.split("; "))console.error(`    ${V}. ${ne}`),V++}function Gh(P){try{let A=n(P);if(A===null)return!1;let q=JSON.parse(A);if(q.$schema)return!1;return g(P,JSON.stringify({$schema:_h,...q},null,2)),!0}catch(A){if(A instanceof r)throw A;return!1}}var Td=new Set(["init","add","remove","update","sync","list","wrapper","migrate","doc","verify"]),qh=new Set(["add","remove","list"]),Vh="cc-safety-net/rulebooks";async function Id(P,A){try{return await zh(P,A)}catch(q){if(q instanceof r)return console.error(q.message),1;throw q}}async function zh(P,A){let q=Wh(A),V=q.help?Jh(q.positionals):null;if(V)return Cn(V),0;if(q.errors.length>0){for(let he of q.errors)console.error(he);return 1}let ee=q.positionals[0];if(!ee)return Cn(gn,console.error),1;let ne=q.positionals[1],ce={global:q.global};if(ee==="init"){let he=Et(P,ce);Zh(he.configTarget);let ye=Bh(he.configDir,"example-rules","rulebook.json"),be=i(he.filesystemScope,ye);if(q.example&&n(be)===null)nd(be);let xe=U(he.configPath,he.filesystemScope);for(let Ie of xe)console.error(Ie);if(xe.length>0)return 1;return console.log("Rule config initialized."),0}if(ee==="add"){let he=$d(q);if(!he)return console.error("rule add requires a source (pass --only <rulebook...> to select from cc-safety-net/rulebooks)"),1;let ye=Et(P,ce),be=await Ld(P,he,{...ce,ref:q.ref,rulebooks:q.only.length>0?q.only:void 0});return Xc(be,he,`Scope: ${q.global?"user":"project"} (${ye.configDir})`),be.ok?0:1}if(ee==="remove"){if(!ne)return console.error("rule remove requires a source"),1;let he=await wd(P,ne,{...ce,deleteSource:q.deleteSource});return zr(he,`Removed rulebook source: ${ne}`),he.ok?0:1}if(ee==="update"){let he=await Qr(P,{...ce,only:ne,refresh:!0});return zr(he,"Rule config updated."),he.ok?0:1}if(ee==="sync")return Bs(P,{global:q.global});if(ee==="list"){let he=Y(P,{cwd:process.cwd()});return Qc(he),he.errors.length>0?1:0}if(ee==="wrapper")return Qh(P,q);if(ee==="migrate")return Rd(P,{cleanup:q.cleanup,cwd:process.cwd()});if(ee==="doc"){console.log(Kc);let he=await Ed(P);if(he)console.error(he);return 0}if(ee==="verify")return Ad(P);return 1}function Jh(P){if(P.length===0)return gn;let A=gn.subcommands.filter((V)=>V.usage.split(" ")[0]===P[0]);if(A.length===0)return null;if(P.length===1&&A.length>1)return{name:`rule ${P[0]}`,description:`Subcommands of rule ${P[0]}`,usage:`rule ${P[0]} <subcommand>`,subcommands:A,options:[]};let q=P.length===1?A[0]:A.find((V)=>V.usage.split(" ")[1]===P[1]);if(!q)return null;return{name:`rule ${P[0]}`,description:q.description,usage:`rule ${q.usage}`,options:P[0]==="add"?ao:[],examples:P[0]==="add"?lo:void 0}}function Wh(P){let A=xt({label:"rule",booleans:{global:["-g","--global"],cleanup:["--cleanup"],deleteSource:["--delete-source"],example:["--example"]},values:{ref:["--ref"]},lists:{only:["--only"]},positionals:"list"},P),q={...A.flags,ref:A.values.ref,only:A.lists.only??[],help:A.help,positionals:A.positionals,errors:A.errors};return Kh(q),q}function Kh(P){let[A]=P.positionals;if(A&&!Td.has(A))P.errors.push(`Unknown rule subcommand: ${A}`);if(P.deleteSource&&A!=="remove")if(A&&Td.has(A))P.errors.push(`Unknown option for rule ${A}: --delete-source`);else P.errors.push("--delete-source is only valid with 'rule remove'");if(P.cleanup&&A!=="migrate")P.errors.push(er(A,"--cleanup"));if(P.example&&A!=="init")P.errors.push(er(A,"--example"));if(P.ref&&A!=="add")P.errors.push(er(A,"--ref"));if(P.only.length>0&&A!=="add")P.errors.push(er(A,"--only"));if(A==="add")Yh(P);if(A==="migrate"){if(P.global)P.errors.push(er(A,"--global"));if(P.positionals.length>1)P.errors.push(`Unexpected rule migrate argument: ${P.positionals[1]}`)}else if(A==="wrapper")Xh(P);else if(P.positionals.length>2)P.errors.push(`Unexpected rule argument: ${P.positionals[2]}`);if(A==="list"&&P.global)P.errors.push("Unknown option for rule list: --global")}function $d(P){if(P.positionals[1])return P.positionals[1];if(P.ref||P.only.length>0)return Vh;return}function Yh(P){let A=$d(P);if(!A)return;if((P.ref||P.only.length>0)&&!K(A)){if(P.ref)P.errors.push(`--ref can only select a ref for an owner/repo source: ${A}`);if(P.only.length>0)P.errors.push("--only can only select rulebooks from an owner/repo source");return}if(P.ref&&!oe(P.ref))P.errors.push(`--ref must use valid path segments: ${P.ref}`);let q=P.only.filter((V)=>!l.test(V));if(q.length>0)P.errors.push(`Invalid rulebook names: ${q.join(", ")}`)}function er(P,A){return P?`Unknown option for rule ${P}: ${A}`:`Unknown option for rule: ${A}`}function Xh(P){let A=P.positionals[1],q=P.positionals[2];if(!A){P.errors.push("rule wrapper requires add, remove, or list");return}if(!qh.has(A)){P.errors.push(`Unknown rule wrapper action: ${A}`);return}if(A==="list"){if(q)P.errors.push(`Unexpected rule wrapper argument: ${q}`);return}if(!q){P.errors.push(`rule wrapper ${A} requires a command`);return}if(P.positionals.length>3)P.errors.push(`Unexpected rule wrapper argument: ${P.positionals[3]}`)}function Zh(P){if(n(P)===null){td(P);return}let A=m(P);if(!A.config)return;Pt(P,{version:1,rules:A.config.rules,overrides:A.config.overrides??{},transparent_wrappers:A.config.transparent_wrappers??[]})}async function Qh(P,A){let q=A.positionals[1],V=A.positionals[2],ee=Et(P,{global:A.global}).configTarget;if(q==="list"){let ye=m(ee);if(ye.errors.length>0){for(let be of ye.errors)console.error(be);return 1}return ey(ye.config?.transparent_wrappers??[]),0}if(!V||!w.test(V))return console.error("transparent wrapper must match command pattern"),1;if(Le(V))return console.error(`reserved command "${V}" cannot be a wrapper`),1;let ne=m(ee);if(ne.errors.length>0){for(let ye of ne.errors)console.error(ye);return 1}let ce=ne.config??{version:1,rules:[],overrides:{},transparent_wrappers:[]},he=q==="add"?[...new Set([...ce.transparent_wrappers??[],V])]:(ce.transparent_wrappers??[]).filter((ye)=>ye!==V);return Pt(ee,{version:1,rules:ce.rules,overrides:ce.overrides??{},transparent_wrappers:he}),console.log(q==="add"?`Added transparent wrapper: ${V}`:`Removed transparent wrapper: ${V}`),0}function ey(P){if(P.length===0){console.log("Transparent wrappers: (none)");return}console.log(`Transparent wrappers (${P.length}):`);for(let A of P)console.log(`  - ${A}`)}import{sep as sy}from"node:path";import{existsSync as ty,readFileSync as ny}from"node:fs";import{join as ry}from"node:path";async function oy(P){if(P.isTTY)return null;return(await We(P).catch(()=>null))?.trim()||null}function iy(P){let A=P.env.get("CLAUDE_SETTINGS_PATH");if(A)return A;return ry(vr(P),"settings.json")}function Ii(P){let A=iy(P);if(!ty(A))return!1;try{let q=ny(A,"utf-8"),V=JSON.parse(q);if(!V.enabledPlugins)return!1;let ee="cc-safety-net@cc-marketplace";if(!(ee in V.enabledPlugins))return!1;return V.enabledPlugins[ee]===!0}catch(q){if(L(o.debug,P.env))console.error(`CC Safety Net debug: failed to read Claude settings: ${A}: ${q instanceof Error?q.message:String(q)}`);return!1}}async function $i(P,A=process.stdin){let q=Ii(P),V;if(!q)V="\uD83D\uDEE1️ CC Safety Net ❌";else{let ne=E(P,{cwd:process.cwd()}),ce=ne.policy,he=R(ce,P.env),ye=Object.values(H(ce,he.capabilities)).some((Ie)=>Ie.changesInherited),be={standard:"✅",strict:"\uD83D\uDD12",paranoid:"\uD83D\uDC41️",custom:"\uD83D\uDD27"}[ye?"custom":he.effectiveLevel],xe=(ne.policyScopes?.weakenings.length??0)>0?"\uD83D\uDD3B":"";V=`\uD83D\uDEE1️ CC Safety Net ${be}${he.worktreeMode?"\uD83C\uDF33":""}${xe}${ne.state==="degraded"?"⚠️":""}`}let ee=await oy(A);if(ee&&!ee.startsWith("{"))console.log(`${ee} | ${V}`);else console.log(V)}function Od(P){let A=E(P,{cwd:process.cwd()}),q=A.policy,V=R(q,P.env),ee=!!process.env.NO_COLOR||!process.stdout.isTTY,ne=Math.min(process.stdout.columns||80,100),ce=ee?"ok":"✔",he=ee?"OFF":"✘",ye=(at,ct)=>{let lt=`  ${at.padEnd(13)}${ct}`;return(lt.length>ne?`${lt.slice(0,ne-1)}…`:lt).replaceAll(he,dt.red(he))},be=Object.values(H(q,V.capabilities)).some((at)=>at.changesInherited),xe=(at)=>at===P.home||at.startsWith(`${P.home}${sy}`)?`~${at.slice(P.home.length)}`:at,Ie={ready:dt.green,degraded:dt.yellow}[A.state],Xe=A.policyScopes?.weakenings??[],et=[...Ii(P)?[]:["plugin cc-safety-net@cc-marketplace is disabled in Claude Code; nothing is enforced in Claude Code until it is re-enabled. Other integrations are not affected."],...A.diagnostics],Re=ee?"-":"·";console.log([`${ee?"":"\uD83D\uDEE1️  "}CC Safety Net — ${Ie(A.state)}`,"",ye("Protection",`destructive ${q.destructiveCommandProtectionEnabled?ce:he}   secrets ${q.secretProtection.enabled?ce:he}`),ye("Level",be?`${V.effectiveLevel} (customised)`:V.effectiveLevel),ye("Rules",q.rules.length===0?"none active":`${q.rules.length} active`),ye("Policy",xe(u(P))),...A.policyScopes?[ye("Project",xe(b(process.cwd())))]:[],...V.worktreeMode?[ye("Worktree","relaxations active")]:[],"",...Xe.length===0?[]:["  Project policy",...Xe.flatMap((at)=>Bn(at,"      ",ne-6).map((ct,lt)=>lt===0?`    ${ct}`:ct)),""],...et.length===0?["  Everything configured is active."]:["  Not active",...et.flatMap((at)=>Bn(at,"      ",ne-6).map((ct,lt)=>lt===0?`    ${Re} ${ct}`:ct)),"","  Full report: cc-safety-net doctor"]].join(`
`))}import{spawn as zd}from"node:child_process";import{randomBytes as hy}from"node:crypto";import{existsSync as yy}from"node:fs";import{createServer as vy}from"node:http";import{Writable as by}from"node:stream";var no=500;function ay(P){let A=P.filter((ee)=>ee.decision!=="allow"),q=P.filter((ee)=>ee.decision==="allow"),V=Math.min(A.length,Math.max(no-q.length,Math.ceil(no/2)));return[...A.slice(0,V),...q.slice(0,no-V)]}function Fd(P,A,q=D(P)){if(q)z(P,q);let V=(ct)=>new Date(ct.getFullYear(),ct.getMonth(),ct.getDate()).getTime(),ee=V(new Date),ne=new Date(ee);ne.setDate(ne.getDate()-(A-1));let ce=ne.getTime(),he=[],ye={count:0};for(let ct of q?Xt(q,ye):[])for(let lt of mn(ct,ye)){let ft=new Date(lt.ts).getTime();if(!Number.isFinite(ft))continue;if(ft>=ce)he.push(lt)}he.sort((ct,lt)=>new Date(lt.ts).getTime()-new Date(ct.ts).getTime());let be=Array.from({length:A},()=>0),xe=Array.from({length:A},()=>0),Ie={},Xe={},et={},Re=0,at=0;for(let ct of he){let lt=ct.agent||"unknown";Ie[lt]=(Ie[lt]??0)+1;let ft=Math.round((ee-V(new Date(ct.ts)))/86400000),mt=A-1-ft,gt=ft>=0&&ft<A;if(gt)xe[mt]=(xe[mt]??0)+1;if(ct.decision!=="allow"){if(Re++,ct.ruleId)Xe[ct.ruleId]=(Xe[ct.ruleId]??0)+1;let ut=so(ct.segment||ct.command);if(ut)et[ut]=(et[ut]??0)+1;if(ct.failureStage)at++;if(gt)be[mt]=(be[mt]??0)+1}}return{days:A,logsDir:q,homeDir:P.home,totalInWindow:he.length,truncated:he.length>no,unreadable:ye.count,counts:{blocked:Re,allowed:he.length-Re,agents:Ie,blockedByDay:be,analyzedByDay:xe,rules:Xe,commands:et,errors:at},entries:ay(he).sort((ct,lt)=>new Date(lt.ts).getTime()-new Date(ct.ts).getTime())}}import{spawn as ly}from"node:child_process";import{existsSync as cy,statSync as Nd}from"node:fs";import{delimiter as dy,join as uy}from"node:path";var py=120000,ro="Choose the project folder",fy=`try
  return POSIX path of (choose folder with prompt "${ro}")
on error number -128
  return ""
end try`,my=`Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '${ro}'
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }`,jd=[{binary:"zenity",args:["--file-selection","--directory",`--title=${ro}`]},{binary:"kdialog",args:["--getexistingdirectory",".","--title",ro]}],Md=(P,A)=>(A.PATH??"").split(dy).some((q)=>{if(q.length===0)return!1;try{let V=Nd(uy(q,P));return V.isFile()&&(V.mode&73)!==0}catch{return!1}});function Oi(P,A){if(P==="darwin"||P==="win32")return!0;if(P!=="linux")return!1;if(!A.DISPLAY&&!A.WAYLAND_DISPLAY)return!1;return jd.some((q)=>Md(q.binary,A))}function gy(P,A){if(P==="darwin")return{cmd:"osascript",args:["-e",fy]};if(P==="win32")return{cmd:"powershell.exe",args:["-NoProfile","-STA","-Command",my]};let q=jd.find((V)=>Md(V.binary,A));return q?{cmd:q.binary,args:q.args}:null}function Fi(P=process.platform,A=process.env){let q=gy(P,A);if(!q)return Promise.resolve({error:"No folder dialog is available on this system"});return new Promise((V)=>{let ee=ly(q.cmd,q.args,{env:A,stdio:["ignore","pipe","pipe"]}),ne="",ce=!1,he=(be)=>{if(ce)return;ce=!0,clearTimeout(ye),V(be)},ye=setTimeout(()=>{ee.kill(),he({error:"The folder dialog timed out"})},py);ee.stdout.on("data",(be)=>{ne+=be.toString()}),ee.on("error",()=>he({error:`Could not open the folder dialog (${q.cmd})`})),ee.on("close",()=>{let be=ne.trim().replace(/\/+$/,"");if(!be)return he({cancelled:!0});if(!cy(be)||!Nd(be).isDirectory())return he({error:"That selection is not a folder on disk"});he({path:be})})})}var Hd=`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CC Safety Net</title>
  <link rel="icon" href="data:image/svg+xml,%3C%3Fxml%20version%3D%221.0%22%20encoding%3D%22UTF-8%22%3F%3E%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221254%22%20height%3D%221254%22%20viewBox%3D%2254%2023%201140%201140%22%20role%3D%22img%22%20aria-label%3D%22Safety%20net%20logo%20mesh%20variant%22%3E%0A%20%20%3Cdefs%3E%0A%20%20%20%20%3CradialGradient%20id%3D%22spot-0%22%20cx%3D%2250%25%22%20cy%3D%2250%25%22%20r%3D%2250%25%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%23f8fafc%22%20stop-opacity%3D%220.68%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%2256%25%22%20stop-color%3D%22%23f8fafc%22%20stop-opacity%3D%220.29%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22%23f8fafc%22%20stop-opacity%3D%220%22%2F%3E%0A%20%20%20%20%3C%2FradialGradient%3E%0A%20%20%20%20%3CradialGradient%20id%3D%22spot-1%22%20cx%3D%2250%25%22%20cy%3D%2250%25%22%20r%3D%2250%25%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%237dd3fc%22%20stop-opacity%3D%220.58%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%2256%25%22%20stop-color%3D%22%237dd3fc%22%20stop-opacity%3D%220.24%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22%237dd3fc%22%20stop-opacity%3D%220%22%2F%3E%0A%20%20%20%20%3C%2FradialGradient%3E%0A%20%20%20%20%3CradialGradient%20id%3D%22spot-2%22%20cx%3D%2250%25%22%20cy%3D%2250%25%22%20r%3D%2250%25%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%2364748b%22%20stop-opacity%3D%220.7%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%2256%25%22%20stop-color%3D%22%2364748b%22%20stop-opacity%3D%220.29%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22%2364748b%22%20stop-opacity%3D%220%22%2F%3E%0A%20%20%20%20%3C%2FradialGradient%3E%0A%20%20%20%20%3CradialGradient%20id%3D%22spot-3%22%20cx%3D%2250%25%22%20cy%3D%2250%25%22%20r%3D%2250%25%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%230f172a%22%20stop-opacity%3D%220.9%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%2256%25%22%20stop-color%3D%22%230f172a%22%20stop-opacity%3D%220.38%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22%230f172a%22%20stop-opacity%3D%220%22%2F%3E%0A%20%20%20%20%3C%2FradialGradient%3E%0A%20%20%20%20%3ClinearGradient%20id%3D%22edge%22%20x1%3D%2214%25%22%20y1%3D%228%25%22%20x2%3D%2288%25%22%20y2%3D%2294%25%22%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%23ffffff%22%20stop-opacity%3D%220.7%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%2250%25%22%20stop-color%3D%22%23bae6fd%22%20stop-opacity%3D%220.24%22%2F%3E%0A%20%20%20%20%20%20%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22%231e293b%22%20stop-opacity%3D%220.86%22%2F%3E%0A%20%20%20%20%3C%2FlinearGradient%3E%0A%20%20%20%20%3Cmask%20id%3D%22net-mask%22%20maskUnits%3D%22userSpaceOnUse%22%3E%0A%20%20%20%20%20%20%3Crect%20width%3D%221254%22%20height%3D%221254%22%20fill%3D%22black%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-46.32%22%20y%3D%22-47.38%22%20width%3D%2292.63%22%20height%3D%2294.75%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(628.75%20127.25)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-66.82%22%20y%3D%22-41.01%22%20width%3D%22133.64%22%20height%3D%2282.02%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(713.75%20230.25)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.95%22%20y%3D%22-134.00%22%20width%3D%2279.90%22%20height%3D%22267.99%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(588.00%20275.50)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-65.05%22%20width%3D%2279.20%22%20height%3D%22130.11%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(444.50%20320.50)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.29%22%20y%3D%22-40.31%22%20width%3D%22266.58%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(759.75%20369.25)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-77.07%22%20y%3D%22-39.24%22%20width%3D%22154.15%22%20height%3D%2278.49%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(533.25%20407.25)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-67.10%22%20y%3D%22-39.74%22%20width%3D%22134.21%22%20height%3D%2279.48%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(895.22%20413.86)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.84%22%20y%3D%22-134.04%22%20width%3D%2279.68%22%20height%3D%22268.08%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(401.36%20461.24)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-74.60%22%20width%3D%2279.20%22%20height%3D%22149.20%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(812.25%20500.25)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-77.43%22%20width%3D%2279.20%22%20height%3D%22154.86%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(625.75%20500.75)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.24%22%20y%3D%22-67.18%22%20width%3D%2278.49%22%20height%3D%22134.35%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(263.25%20505.75)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.28%22%20y%3D%22-40.02%22%20width%3D%22266.56%22%20height%3D%2280.04%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(941.36%20551.76)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-54.80%22%20y%3D%22-53.74%22%20width%3D%22109.60%22%20height%3D%22107.48%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(1096.75%20593.25)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-77.43%22%20y%3D%22-40.31%22%20width%3D%22154.86%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(719.75%20594.25)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-51.97%22%20y%3D%22-54.45%22%20width%3D%22103.94%22%20height%3D%22108.89%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(155.25%20594.75)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-76.37%22%20y%3D%22-40.31%22%20width%3D%22152.74%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(534.50%20595.50)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-135.12%22%20y%3D%22-40.16%22%20width%3D%22270.23%22%20height%3D%2280.32%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(307.96%20634.94)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-40.02%22%20y%3D%22-70.64%22%20width%3D%2280.05%22%20height%3D%22141.27%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(989.66%20680.72)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-38.90%22%20y%3D%22-77.27%22%20width%3D%2277.80%22%20height%3D%22154.54%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(442.49%20687.00)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.95%22%20y%3D%22-77.43%22%20width%3D%2279.90%22%20height%3D%22154.86%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(628.50%20689.00)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.40%22%20y%3D%22-134.46%22%20width%3D%2278.80%22%20height%3D%22268.92%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(853.69%20727.31)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-69.65%22%20y%3D%22-38.18%22%20width%3D%22139.30%22%20height%3D%2276.37%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(353.25%20771.75)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-78.44%22%20y%3D%22-39.44%22%20width%3D%22156.88%22%20height%3D%2278.88%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(720.61%20782.02)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.77%22%20y%3D%22-39.86%22%20width%3D%22267.53%22%20height%3D%2279.71%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(493.85%20820.81)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.24%22%20y%3D%22-66.82%22%20width%3D%2278.49%22%20height%3D%22133.64%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(806.50%20868.00)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-40.02%22%20y%3D%22-133.39%22%20width%3D%2280.05%22%20height%3D%22266.79%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(666.35%20914.10)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-67.18%22%20y%3D%22-39.60%22%20width%3D%22134.35%22%20height%3D%2279.20%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(540.00%20960.00)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-49.85%22%20y%3D%22-49.50%22%20width%3D%2299.70%22%20height%3D%2298.99%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(627.25%201064.75)%20rotate(-45.00)%22%20fill%3D%22white%22%2F%3E%0A%20%20%20%20%3C%2Fmask%3E%0A%20%20%3C%2Fdefs%3E%0A%20%20%3Cg%3E%0A%20%20%20%20%3Cg%20mask%3D%22url(%23net-mask)%22%3E%0A%20%20%20%20%20%20%3Crect%20width%3D%221254%22%20height%3D%221254%22%20fill%3D%22%2307090d%22%2F%3E%0A%20%20%20%20%20%20%3Ccircle%20cx%3D%22360%22%20cy%3D%22240%22%20r%3D%22430%22%20fill%3D%22url(%23spot-0)%22%2F%3E%0A%20%20%20%20%20%20%3Ccircle%20cx%3D%22820%22%20cy%3D%22300%22%20r%3D%22430%22%20fill%3D%22url(%23spot-1)%22%2F%3E%0A%20%20%20%20%20%20%3Ccircle%20cx%3D%22760%22%20cy%3D%22830%22%20r%3D%22500%22%20fill%3D%22url(%23spot-2)%22%2F%3E%0A%20%20%20%20%20%20%3Ccircle%20cx%3D%22300%22%20cy%3D%22780%22%20r%3D%22390%22%20fill%3D%22url(%23spot-3)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20width%3D%221254%22%20height%3D%221254%22%20fill%3D%22url(%23edge)%22%20opacity%3D%220.18%22%2F%3E%0A%20%20%20%20%3C%2Fg%3E%0A%20%20%20%20%3Cg%20fill%3D%22none%22%20stroke%3D%22url(%23edge)%22%20stroke-width%3D%2214%22%20stroke-linejoin%3D%22round%22%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-46.32%22%20y%3D%22-47.38%22%20width%3D%2292.63%22%20height%3D%2294.75%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(628.75%20127.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-66.82%22%20y%3D%22-41.01%22%20width%3D%22133.64%22%20height%3D%2282.02%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(713.75%20230.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.95%22%20y%3D%22-134.00%22%20width%3D%2279.90%22%20height%3D%22267.99%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(588.00%20275.50)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-65.05%22%20width%3D%2279.20%22%20height%3D%22130.11%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(444.50%20320.50)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.29%22%20y%3D%22-40.31%22%20width%3D%22266.58%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(759.75%20369.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-77.07%22%20y%3D%22-39.24%22%20width%3D%22154.15%22%20height%3D%2278.49%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(533.25%20407.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-67.10%22%20y%3D%22-39.74%22%20width%3D%22134.21%22%20height%3D%2279.48%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(895.22%20413.86)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.84%22%20y%3D%22-134.04%22%20width%3D%2279.68%22%20height%3D%22268.08%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(401.36%20461.24)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-74.60%22%20width%3D%2279.20%22%20height%3D%22149.20%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(812.25%20500.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-77.43%22%20width%3D%2279.20%22%20height%3D%22154.86%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(625.75%20500.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.24%22%20y%3D%22-67.18%22%20width%3D%2278.49%22%20height%3D%22134.35%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(263.25%20505.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.28%22%20y%3D%22-40.02%22%20width%3D%22266.56%22%20height%3D%2280.04%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(941.36%20551.76)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-54.80%22%20y%3D%22-53.74%22%20width%3D%22109.60%22%20height%3D%22107.48%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(1096.75%20593.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-77.43%22%20y%3D%22-40.31%22%20width%3D%22154.86%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(719.75%20594.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-51.97%22%20y%3D%22-54.45%22%20width%3D%22103.94%22%20height%3D%22108.89%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(155.25%20594.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-76.37%22%20y%3D%22-40.31%22%20width%3D%22152.74%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(534.50%20595.50)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-135.12%22%20y%3D%22-40.16%22%20width%3D%22270.23%22%20height%3D%2280.32%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(307.96%20634.94)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-40.02%22%20y%3D%22-70.64%22%20width%3D%2280.05%22%20height%3D%22141.27%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(989.66%20680.72)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-38.90%22%20y%3D%22-77.27%22%20width%3D%2277.80%22%20height%3D%22154.54%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(442.49%20687.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.95%22%20y%3D%22-77.43%22%20width%3D%2279.90%22%20height%3D%22154.86%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(628.50%20689.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.40%22%20y%3D%22-134.46%22%20width%3D%2278.80%22%20height%3D%22268.92%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(853.69%20727.31)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-69.65%22%20y%3D%22-38.18%22%20width%3D%22139.30%22%20height%3D%2276.37%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(353.25%20771.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-78.44%22%20y%3D%22-39.44%22%20width%3D%22156.88%22%20height%3D%2278.88%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(720.61%20782.02)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.77%22%20y%3D%22-39.86%22%20width%3D%22267.53%22%20height%3D%2279.71%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(493.85%20820.81)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.24%22%20y%3D%22-66.82%22%20width%3D%2278.49%22%20height%3D%22133.64%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(806.50%20868.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-40.02%22%20y%3D%22-133.39%22%20width%3D%2280.05%22%20height%3D%22266.79%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(666.35%20914.10)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-67.18%22%20y%3D%22-39.60%22%20width%3D%22134.35%22%20height%3D%2279.20%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(540.00%20960.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-49.85%22%20y%3D%22-49.50%22%20width%3D%2299.70%22%20height%3D%2298.99%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(627.25%201064.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%3C%2Fg%3E%0A%20%20%20%20%3Cg%20fill%3D%22none%22%20stroke%3D%22%23ffffff%22%20stroke-opacity%3D%220.2%22%20stroke-width%3D%225%22%20stroke-linejoin%3D%22round%22%20transform%3D%22translate(-10%20-14)%22%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-46.32%22%20y%3D%22-47.38%22%20width%3D%2292.63%22%20height%3D%2294.75%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(628.75%20127.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-66.82%22%20y%3D%22-41.01%22%20width%3D%22133.64%22%20height%3D%2282.02%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(713.75%20230.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.95%22%20y%3D%22-134.00%22%20width%3D%2279.90%22%20height%3D%22267.99%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(588.00%20275.50)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-65.05%22%20width%3D%2279.20%22%20height%3D%22130.11%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(444.50%20320.50)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.29%22%20y%3D%22-40.31%22%20width%3D%22266.58%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(759.75%20369.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-77.07%22%20y%3D%22-39.24%22%20width%3D%22154.15%22%20height%3D%2278.49%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(533.25%20407.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-67.10%22%20y%3D%22-39.74%22%20width%3D%22134.21%22%20height%3D%2279.48%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(895.22%20413.86)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.84%22%20y%3D%22-134.04%22%20width%3D%2279.68%22%20height%3D%22268.08%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(401.36%20461.24)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-74.60%22%20width%3D%2279.20%22%20height%3D%22149.20%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(812.25%20500.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.60%22%20y%3D%22-77.43%22%20width%3D%2279.20%22%20height%3D%22154.86%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(625.75%20500.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.24%22%20y%3D%22-67.18%22%20width%3D%2278.49%22%20height%3D%22134.35%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(263.25%20505.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.28%22%20y%3D%22-40.02%22%20width%3D%22266.56%22%20height%3D%2280.04%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(941.36%20551.76)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-54.80%22%20y%3D%22-53.74%22%20width%3D%22109.60%22%20height%3D%22107.48%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(1096.75%20593.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-77.43%22%20y%3D%22-40.31%22%20width%3D%22154.86%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(719.75%20594.25)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-51.97%22%20y%3D%22-54.45%22%20width%3D%22103.94%22%20height%3D%22108.89%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(155.25%20594.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-76.37%22%20y%3D%22-40.31%22%20width%3D%22152.74%22%20height%3D%2280.61%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(534.50%20595.50)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-135.12%22%20y%3D%22-40.16%22%20width%3D%22270.23%22%20height%3D%2280.32%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(307.96%20634.94)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-40.02%22%20y%3D%22-70.64%22%20width%3D%2280.05%22%20height%3D%22141.27%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(989.66%20680.72)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-38.90%22%20y%3D%22-77.27%22%20width%3D%2277.80%22%20height%3D%22154.54%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(442.49%20687.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.95%22%20y%3D%22-77.43%22%20width%3D%2279.90%22%20height%3D%22154.86%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(628.50%20689.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.40%22%20y%3D%22-134.46%22%20width%3D%2278.80%22%20height%3D%22268.92%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(853.69%20727.31)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-69.65%22%20y%3D%22-38.18%22%20width%3D%22139.30%22%20height%3D%2276.37%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(353.25%20771.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-78.44%22%20y%3D%22-39.44%22%20width%3D%22156.88%22%20height%3D%2278.88%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(720.61%20782.02)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-133.77%22%20y%3D%22-39.86%22%20width%3D%22267.53%22%20height%3D%2279.71%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(493.85%20820.81)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-39.24%22%20y%3D%22-66.82%22%20width%3D%2278.49%22%20height%3D%22133.64%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(806.50%20868.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-40.02%22%20y%3D%22-133.39%22%20width%3D%2280.05%22%20height%3D%22266.79%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(666.35%20914.10)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-67.18%22%20y%3D%22-39.60%22%20width%3D%22134.35%22%20height%3D%2279.20%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(540.00%20960.00)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%20%20%3Crect%20x%3D%22-49.85%22%20y%3D%22-49.50%22%20width%3D%2299.70%22%20height%3D%2298.99%22%20rx%3D%2212.00%22%20ry%3D%2212.00%22%20transform%3D%22translate(627.25%201064.75)%20rotate(-45.00)%22%2F%3E%0A%20%20%20%20%3C%2Fg%3E%0A%20%20%3C%2Fg%3E%0A%3C%2Fsvg%3E%0A">
  <script>
    (() => {
      const stored = localStorage.getItem('cc-safety-net-theme');
      if (stored === 'light' || stored === 'dark') document.documentElement.style.colorScheme = stored;
    })();
  </script>
  <style>
:root {
  color-scheme: light dark;

  --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  --bg: light-dark(#f3f4f6, #0c0e11);
  --surface: light-dark(#ffffff, #16191d);
  --surface-2: light-dark(#f6f7f9, #1c2025);
  --btn-hover-fill: light-dark(#e9ebef, #282c33);
  --field-bg: light-dark(#ffffff, #101317);

  --ink: light-dark(#171a1f, #e7eaed);
  --muted: light-dark(#5b626c, #99a1ac);
  --meta: light-dark(#6b7280, #838b95);

  --border: light-dark(#e3e6ea, #292d33);
  --border-strong: light-dark(#cfd4da, #363b42);

  --switch-track: light-dark(#8b929c, #626973);
  --switch-track-hover: #767d87;
  --switch-knob: #ffffff;

  --focus-ring: var(--ink);

  --accent: light-dark(#166534, #3fb950);
  --safe: #14532d;
  --safe-hover: #0f3d20;
  --danger: #7f1d1d;
  --danger-hover: #641414;

  --star: light-dark(#b7791f, #f2c94c);

  --ok-fg: light-dark(#15803d, #4ade80);
  --ok-bg: light-dark(#edfaf1, #10251a);
  --ok-border: light-dark(#b7e4c7, #1f5133);

  --err-fg: light-dark(#b42318, #ff8078);
  --err-bg: light-dark(#fef2f1, #2b1512);
  --err-border: light-dark(#f2c9c4, #5c2620);

  --warn-fg: light-dark(#b45309, #fbbf24);
  --warn-bg: light-dark(#fefaf0, #2a2008);
  --warn-border: light-dark(#f2ddb0, #5c4a1d);

  --master: light-dark(#1d4ed8, #4c8dff);
  --master-fg: light-dark(#1e40af, #9ec3ff);
  --master-bg: light-dark(#eef4fe, #101a2b);
  --master-border: light-dark(#c5d6f6, #23446e);

  --strict-fg: light-dark(#1e40af, #9ec3ff);
  --strict-bg: light-dark(#eef4fe, #101a2b);
  --strict-border: light-dark(#c5d6f6, #23446e);
  --paranoid-fg: light-dark(#6b21a8, #d8b4fe);
  --paranoid-bg: light-dark(#faf5ff, #21152c);
  --paranoid-border: light-dark(#e4ccf4, #513064);

  --radius-sm: 6px;
  --radius: 8px;
  --radius-lg: 12px;

  --topbar-h: 58px;

  font-family: var(--font-sans);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-size: 13px;
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
}

.app-shell {
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px 14px;
  background: var(--surface);
  border-right: 1px solid var(--border);
}

.brand {
  padding: 0 10px;
}

h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.brand-logo {
  display: flex;
  color: var(--ink);
}

.brand-home {
  display: flex;
  color: inherit;
}

.brand-logo svg {
  width: auto;
  height: 30px;
}

.sidenav {
  display: grid;
  gap: 2px;
}

.sidenav a {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: var(--radius);
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.sidenav a:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.sidenav a[aria-current='page'] {
  background: var(--btn-hover-fill);
  color: var(--ink);
}

.sidenav svg {
  width: 15px;
  height: 15px;
  flex: none;
}

.sidebar-foot {
  margin-top: auto;
  display: grid;
  gap: 10px;
  padding: 0 10px;
}

.sidebar-links {
  display: grid;
  gap: 5px;
  font-size: 12px;
}

.sidebar-links a {
  color: var(--meta);
  text-decoration: none;
}

.sidebar-links a:hover {
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.sidebar-links a:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
}

.content {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.app-foot {
  display: none;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  min-height: var(--topbar-h);
  padding: 12px 28px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.topbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: 1;
  max-width: 1040px;
  margin: 0 auto;
}

.topbar-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.app-status {
  display: inline-flex;
  align-items: center;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.25;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
}

.app-status:empty {
  display: none;
}

.app-status.ok {
  color: var(--ok-fg);
  border-color: var(--ok-border);
  background: var(--ok-bg);
}

.app-status.error {
  color: var(--err-fg);
  border-color: var(--err-border);
  background: var(--err-bg);
}

.dirty-chip {
  padding: 6px 12px;
  border: 1px solid var(--warn-border);
  border-radius: 999px;
  background: var(--warn-bg);
  color: var(--warn-fg);
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
}

.view-search {
  display: flex;
  align-items: center;
  flex: 1 1 240px;
  min-width: 180px;
  max-width: 380px;
}

.topbar-search {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 440px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

button:not(:disabled),
select,
label.row:not(.row-disabled),
label.rule-control,
input[type='checkbox']:not(:disabled),
input[type='radio']:not(:disabled) {
  cursor: pointer;
}

button {
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 8px 14px;
  background: var(--surface);
  color: var(--ink);
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

button:hover:not(:disabled) {
  background: var(--surface-2);
  border-color: var(--muted);
}

#theme-toggle,
#raw-copy,
#activity-refresh,
#integrations-refresh,
#rules-refresh,
#tester-run,
#reset-rule-customizations,
#reset-secret-customizations,
.rule-example-button {
  border-color: transparent;
}

#theme-toggle:hover:not(:disabled),
#raw-copy:hover:not(:disabled),
#activity-refresh:hover:not(:disabled),
#integrations-refresh:hover:not(:disabled),
#rules-refresh:hover:not(:disabled),
#tester-run:hover:not(:disabled),
#reset-rule-customizations:hover:not(:disabled),
#reset-secret-customizations:hover:not(:disabled),
.rule-example-button:hover:not(:disabled) {
  background: var(--btn-hover-fill);
  border-color: transparent;
}

button:disabled {
  opacity: 0.6;
  cursor: progress;
}

button.primary {
  background: var(--safe);
  border-color: var(--safe);
  color: #fff;
}

button.primary:hover:not(:disabled) {
  background: var(--safe-hover);
  border-color: var(--safe-hover);
}

button.danger {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}

button.danger:hover:not(:disabled) {
  background: var(--danger-hover);
  border-color: var(--danger-hover);
}

#theme-toggle {
  display: inline-flex;
  align-items: center;
  align-self: flex-end;
  gap: 7px;
  color: var(--muted);
}

#theme-toggle:hover {
  color: var(--ink);
}

#theme-toggle svg {
  width: 15px;
  height: 15px;
}

button.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  color: var(--muted);
}

button.icon-button:hover:not(:disabled) {
  color: var(--ink);
}

button.icon-button.copied {
  color: var(--ok-fg);
}

button.icon-button.copied:hover:not(:disabled) {
  color: var(--ok-fg);
}

button.icon-button svg {
  width: 16px;
  height: 16px;
}

:where(button, input, textarea):focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

main {
  width: 100%;
  max-width: 1040px;
  margin: 0 auto;
  padding: 24px 28px 48px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.view {
  display: grid;
  gap: 18px;
}

.view[hidden] {
  display: none;
}

.view-head .panel-sub {
  margin-top: 0;
}

.policy-savebar {
  position: sticky;
  top: var(--topbar-h);
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.savebar-actions {
  display: flex;
  gap: 8px;
}

.retention-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 12.5px;
  font-weight: 600;
}

.retention-row input {
  width: 84px;
  text-align: right;
}

.retention-note {
  margin: 8px 0 0;
  font-size: 12px;
}

.tiles-window {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 11.5px;
  font-weight: 600;
}

.tiles-window:empty {
  display: none;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}

.tiles:empty {
  display: none;
}

.tile {
  display: grid;
  grid-template-columns: 1fr minmax(0, 168px);
  grid-template-areas:
    'value spark'
    'label spark';
  align-items: center;
  gap: 3px 16px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.tile strong {
  grid-area: value;
  align-self: end;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.tile span {
  grid-area: label;
  align-self: start;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--muted);
}

.view-all-link {
  align-self: center;
  padding: 8px 14px;
  border-radius: var(--radius);
  color: var(--muted);
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: none;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.view-all-link:hover {
  background: var(--btn-hover-fill);
  color: var(--ink);
}

.protection-warning {
  border-color: var(--err-border);
  background: color-mix(in srgb, var(--err-bg) 60%, var(--surface));
}

.dual-panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}

@media (max-width: 720px) {
  .dual-panels {
    grid-template-columns: 1fr;
  }
}

#top-rules,
#top-commands {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2px;
}

.top-rule,
.top-command {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 7px 10px;
  border-color: transparent;
  background: transparent;
  border-radius: var(--radius-sm);
  text-align: left;
}

.top-rule:hover:not(:disabled),
.top-command:hover:not(:disabled) {
  background: var(--btn-hover-fill);
  border-color: transparent;
}

.top-rule .rule-id,
.top-command .rule-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.guard-errors {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--warn-border);
  border-radius: var(--radius);
  background: var(--warn-bg);
  color: var(--warn-fg);
  font-size: 12.5px;
  font-weight: 600;
  text-align: left;
}

.activity-controls {
  display: grid;
  gap: 10px;
  margin-bottom: 14px;
}

.activity-controls-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.activity-days {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 650;
  color: var(--muted);
}

.activity-refresh {
  margin-left: auto;
}

@keyframes activity-refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

.activity-refresh.spinning svg {
  animation: activity-refresh-spin 0.6s linear infinite;
}

.integrations-refresh,
.rules-refresh {
  margin-left: auto;
}

.integrations-refresh.spinning svg,
.rules-refresh.spinning svg {
  animation: activity-refresh-spin 0.6s linear infinite;
}

#integrations-list {
  display: grid;
  gap: 8px;
}

.integration-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.integration-info {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.integration-row .status {
  grid-column: 1 / -1;
}

.integration-row button.primary,
.integration-row button.danger {
  min-width: 88px;
  background: transparent;
  border-color: transparent;
  color: var(--ink);
}

.integration-row button.primary:hover:not(:disabled),
.integration-row button.danger:hover:not(:disabled) {
  color: #fff;
}

#rules-composer-panel .field + .field,
.rules-composer-actions {
  margin-top: 14px;
}

.rules-path-row {
  display: flex;
  gap: 8px;
}

.rules-path-row input {
  flex: 1 1 auto;
  min-width: 0;
}

.rules-path-row button {
  flex: none;
}

#rules-project-path[readonly] {
  border-color: var(--border);
  color: var(--muted);
}

.rules-composer-actions {
  display: flex;
  justify-content: flex-end;
}

#rules-list,
#rules-diagnostics {
  display: grid;
  gap: 8px;
}

.rulebook-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.rulebook-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
  color: var(--muted);
}

.rulebook-rule {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 3px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.rulebook-head code,
.rulebook-rule code {
  font-family: var(--font-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.rulebook-rule .rule-id {
  color: var(--muted);
}

.rulebook-rule p {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}

.rulebook-rule.rules-focus {
  margin: 0 -8px;
  padding: 10px 8px;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

select {
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 8px 10px;
  background: var(--field-bg);
  color: var(--ink);
  font: inherit;
}

.chip-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.chip-row:empty {
  display: none;
}

button.chip {
  padding: 4px 11px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}

button.chip[aria-pressed='true'] {
  background: var(--master-bg);
  border-color: var(--master-border);
  color: var(--master-fg);
}

.chip-count {
  font-variant-numeric: tabular-nums;
}

button.filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 11px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: var(--master-bg);
  border-color: var(--master-border);
  color: var(--master-fg);
}

button.filter-pill code {
  font-family: var(--font-mono);
}

.filter-pill-x {
  opacity: 0.7;
}

.feed-list {
  display: grid;
  gap: 8px;
}

.feed-item {
  display: grid;
  gap: 7px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.feed-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--meta);
}

.feed-meta time {
  margin-left: auto;
  white-space: nowrap;
}

.feed-copy,
.feed-report {
  width: 26px;
  height: 26px;
  margin: -4px 0;
  border: 0;
  background: transparent;
}

.feed-copy:hover:not(:disabled),
.feed-report:hover:not(:disabled) {
  background: transparent;
}

.feed-copy svg,
.feed-report svg {
  width: 14px;
  height: 14px;
}

.feed-copy.copied svg {
  width: 12px;
  height: 12px;
}

.feed-meta .rule-id {
  font-family: var(--font-mono);
  color: var(--muted);
  overflow-wrap: anywhere;
}

#tester-result .rule-id {
  font-family: var(--font-mono);
}

button.rule-id {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  text-align: left;
}

button.rule-id:hover {
  color: var(--ink);
  text-decoration: underline;
}

.decision-badge {
  padding: 1px 8px;
  border: 1px solid;
  border-radius: 999px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.decision-badge.deny {
  color: var(--err-fg);
  background: var(--err-bg);
  border-color: var(--err-border);
}

.decision-badge.allow {
  color: var(--ok-fg);
  background: var(--ok-bg);
  border-color: var(--ok-border);
}

.decision-badge.error {
  color: var(--warn-fg);
  background: var(--warn-bg);
  border-color: var(--warn-border);
}

.agent-badge {
  padding: 1px 8px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--muted);
  font-weight: 600;
}

.feed-command,
.rule-example-popover code {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-family: var(--font-mono);
  font-size: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.feed-command {
  padding: 8px 10px;
  max-width: 85ch;
  max-height: 7.2em;
  overflow: hidden;
}

.feed-command.clamped {
  mask-image: linear-gradient(180deg, #000 calc(100% - 1.6em), transparent);
}

.feed-command.expanded {
  max-height: none;
  mask-image: none;
}

.feed-toggle {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.feed-block {
  align-self: center;
  font-size: 11px;
}

.feed-day-sep {
  padding-top: 6px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.tile-spark {
  grid-area: spark;
  display: flex;
  align-items: stretch;
  gap: 2px;
  width: 100%;
  height: 40px;
}

.spark-col {
  position: relative;
  display: flex;
  align-items: flex-end;
  flex: 1 1 0;
  min-width: 1px;
}

.spark-bar {
  width: 100%;
  background: var(--accent);
  border-radius: 1px;
}

.spark-bar.spark-zero {
  background: var(--border-strong);
}

.spark-col::after {
  content: attr(data-count);
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  color: var(--ink);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.spark-col:hover::after,
.spark-col:focus-visible::after {
  opacity: 1;
}

.spark-col:focus-visible {
  border-radius: var(--radius-sm);
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.feed-reason {
  margin: 0;
  max-width: 85ch;
  font-size: 12px;
}

.activity-count {
  margin: 12px 0 0;
  font-size: 12px;
}

.activity-count:empty {
  display: none;
}

.info-rows {
  display: grid;
  gap: 10px;
}

.info-row {
  display: grid;
  gap: 3px;
}

.info-row > span {
  font-size: 12px;
  font-weight: 650;
  color: var(--muted);
}

.info-row code {
  font-family: var(--font-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.danger-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.danger-row strong {
  font-size: 13px;
}

.danger-row p {
  margin: 4px 0 0;
  font-size: 12px;
}

.status {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-wrap;
}

.status:empty {
  display: none;
}

.protection-banner {
  padding: 10px 14px;
  border: 1px solid var(--err-fg);
  border-radius: var(--radius);
  background: var(--err-bg);
  color: var(--err-fg);
  font-weight: 600;
}

.status.ok {
  color: var(--ok-fg);
  background: var(--ok-bg);
  border-color: var(--ok-border);
}

.status.error {
  color: var(--err-fg);
  background: var(--err-bg);
  border-color: var(--err-border);
}

.health-strip strong {
  color: var(--ink);
  font-weight: 650;
}

.recovery {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px;
  border: 1px solid var(--err-border);
  border-radius: var(--radius);
  background: var(--surface);
}

.recovery[hidden] {
  display: none;
}

.recovery strong {
  display: block;
  font-size: 13px;
}

.recovery p {
  margin: 4px 0 0;
}

.muted {
  color: var(--muted);
  line-height: 1.45;
}

.confirm-dialog {
  width: min(420px, calc(100vw - 32px));
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--ink);
}

.rule-example-popover {
  position: fixed;
  inset: auto;
  width: min(360px, calc(100vw - 24px));
  margin: 0;
  padding: 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 4px 8px rgb(0 0 0 / 18%);
}

.rule-example-popover::backdrop {
  background: transparent;
}

.rule-example-popover > * {
  display: block;
}

.rule-example-label {
  margin-bottom: 3px;
  color: var(--muted);
  font-size: 11px;
}

.rule-example-popover strong {
  margin-bottom: 10px;
  font-size: 13px;
}

.rule-example-popover code {
  padding: 9px 10px;
}

.confirm-dialog::backdrop {
  background: rgb(0 0 0 / 48%);
}

.confirm-dialog form {
  display: grid;
  gap: 12px;
  padding: 18px;
}

.confirm-dialog h2 {
  margin: 0;
}

.confirm-dialog p {
  margin: 0;
}

.dialog-detail {
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  overflow-wrap: anywhere;
}

.dialog-detail code {
  font-family: var(--font-mono);
  font-size: 12px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.report-dialog {
  width: min(680px, calc(100vw - 32px));
}

.confirm-dialog:has(.dialog-rows:not([hidden])) {
  width: min(620px, calc(100vw - 32px));
}

.dialog-rows {
  max-height: 46vh;
  overflow: auto;
}

.diff-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  text-align: left;
}

.diff-table th {
  padding: 4px 8px;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-weight: 600;
}

.diff-table td {
  padding: 5px 8px;
  border-bottom: 1px solid var(--border);
  overflow-wrap: anywhere;
  vertical-align: top;
}

.diff-table code {
  font-family: var(--font-mono);
  font-size: 11.5px;
}

.diff-before {
  color: var(--muted);
  text-decoration: line-through;
}

.diff-after {
  color: var(--ink);
  font-weight: 650;
}

.diff-warning {
  margin: 8px 0 0;
  padding: 7px 10px;
  border-left: 3px solid var(--warn-border);
  border-radius: var(--radius-sm);
  background: var(--warn-bg);
  color: var(--warn-fg);
  font-size: 12px;
}

.view-head-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.project-draft-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid var(--master-border);
  border-radius: var(--radius);
  background: var(--master-bg);
}

.project-draft-bar[hidden] {
  display: none;
}

.project-draft-target strong {
  display: block;
  font-size: 13px;
}

.project-draft-target code {
  font-family: var(--font-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.project-draft-target p {
  margin: 4px 0 0;
  font-size: 12px;
}

.project-chip {
  flex: none;
  align-self: center;
  margin-left: auto;
  padding: 2px 9px;
  border: 1px solid var(--master-border);
  border-radius: 999px;
  background: var(--master-bg);
  color: var(--master-fg);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.project-chip.inherited {
  border-color: var(--border);
  background: var(--surface-2);
  color: var(--muted);
  font-weight: 600;
}

.rule-row > .project-chip {
  grid-column: 1 / -1;
  justify-self: end;
  margin-left: 0;
}

.project-field-line {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
}

.project-chip-slot:empty {
  display: none;
}

.row:has(.project-chip.inherited) strong {
  color: var(--muted);
}

.report-field {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}

.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.panel-title {
  min-width: 0;
}

.raw-json-head {
  flex-wrap: nowrap;
}

.raw-json-head .panel-title {
  flex: 1 1 auto;
}

.raw-json-head #raw-copy {
  flex: none;
}

.panel-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: -4px 0;
  padding: 4px 6px 4px 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: inherit;
  font-weight: inherit;
}

.panel-toggle:hover {
  background: transparent;
  color: var(--ink);
}

.panel-chevron {
  width: 8px;
  height: 8px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(45deg) translateY(-1px);
  transition: transform 0.15s ease;
}

.panel-toggle[aria-expanded='false'] .panel-chevron,
:is(.rule-tier-head, .tier-collapse)[aria-expanded='false'] .panel-chevron {
  transform: rotate(-45deg);
}

h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.panel-sub {
  margin: 4px 0 0;
  font-size: 12.5px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 8px;
}

label.row {
  display: flex;
  gap: 12px;
}

label.row,
.rule-row {
  align-items: flex-start;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

label.row:hover {
  border-color: var(--border-strong);
  background: var(--surface-2);
}

label.row.row-disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

label.row.row-disabled:hover {
  border-color: var(--border);
  background: var(--surface);
}

:is(label.row, .rule-control) input[type='checkbox'] {
  appearance: none;
  -webkit-appearance: none;
  position: relative;
  margin: 1px 0 0;
  width: 34px;
  height: 20px;
  flex: none;
  border: 1px solid var(--switch-track);
  border-radius: 999px;
  background: var(--switch-track);
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease;
}

:is(label.row, .rule-control) input[type='checkbox']::before {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--switch-knob);
  box-shadow: 0 1px 2px rgb(0 0 0 / 30%);
  transition: transform 0.18s ease;
}

:is(label.row, .rule-control) input[type='checkbox']:checked {
  background: var(--accent);
  border-color: var(--accent);
}

:is(label.row, .rule-control) input[type='checkbox']:checked::before {
  transform: translateX(14px);
}

:is(label.row, .rule-control):hover input[type='checkbox']:not(:checked) {
  border-color: var(--switch-track-hover);
  background: var(--switch-track-hover);
}

label.row.safety-override-row {
  display: grid;
  gap: 8px;
}

label.row.safety-override-row select {
  width: 100%;
}

:is(label.row, .rule-control) span {
  display: block;
  min-width: 0;
}

:is(label.row, .rule-control) strong {
  font-weight: 650;
  font-size: 13px;
}

:is(label.row, .rule-control) .rule-id {
  display: block;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted);
  margin-top: 2px;
  word-break: break-all;
}

:is(label.row, .rule-control) small {
  display: block;
  margin-top: 4px;
  font-size: 11.5px;
  color: var(--muted);
  line-height: 1.45;
}

#destructive-command > label.row {
  margin-bottom: 16px;
}

.preset-status {
  margin-bottom: 10px;
  font-weight: 700;
}

#safety-preset-status:empty {
  display: none;
}

.preset-status.customized {
  color: var(--master-fg);
}

.preset-standard {
  --preset-fg: var(--ok-fg);
  --preset-bg: var(--ok-bg);
  --preset-border: var(--ok-border);
}

.preset-strict {
  --preset-fg: var(--strict-fg);
  --preset-bg: var(--strict-bg);
  --preset-border: var(--strict-border);
}

.preset-paranoid {
  --preset-fg: var(--paranoid-fg);
  --preset-bg: var(--paranoid-bg);
  --preset-border: var(--paranoid-border);
}

#safety-level label.row:has(input:checked),
#safety-level label.row:has(input:checked):hover {
  border-color: var(--preset-border);
  background: var(--preset-bg);
  accent-color: var(--preset-fg);
}

#safety-level label.row:has(input:checked) strong {
  color: var(--preset-fg);
}

.panel-head-action {
  flex: none;
}

.rule-tier {
  overflow: clip;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
}

.rule-tier + .rule-tier,
#destructive-command-rules + .rule-tier {
  margin-top: 10px;
}

.rule-tier-enforced {
  border-color: var(--ok-border);
}

.rule-tier-strict {
  border-color: var(--strict-border);
}

.rule-tier-paranoid {
  border-color: var(--paranoid-border);
}

.rule-tier-head {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  padding: 9px 10px;
  border: 0;
  border-radius: 0;
  background: var(--surface-2);
  color: var(--ink);
  text-align: left;
}

.rule-tier-head:hover:not(:disabled) {
  background: var(--surface-2);
}

.tier-collapse {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  align-self: stretch;
  gap: 12px;
  margin: -9px -10px;
  padding: 9px 10px;
  border: 0;
  border-radius: 0;
  background: none;
  color: inherit;
  text-align: left;
}

.tier-switch {
  appearance: none;
  -webkit-appearance: none;
  position: relative;
  width: 30px;
  height: 16px;
  flex: none;
  padding: 0;
  border: 0;
  background: none;
}

.tier-switch::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  width: 100%;
  height: 6px;
  transform: translateY(-50%);
  border-radius: 999px;
  background: var(--switch-track);
  transition: background-color 0.18s ease;
}

.tier-switch::before {
  content: '';
  position: absolute;
  z-index: 1;
  top: 0;
  left: 0;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--switch-knob);
  box-shadow: 0 1px 2px rgb(0 0 0 / 30%);
  transition: transform 0.18s ease;
}

.tier-switch:checked::after {
  background: color-mix(in srgb, var(--accent) 45%, transparent);
}

.tier-switch:checked::before {
  transform: translateX(14px);
  background: var(--accent);
}

.rule-tier-enforced .rule-tier-head,
.rule-tier-enforced .rule-tier-head:hover:not(:disabled) {
  background: var(--ok-bg);
  color: var(--ok-fg);
}

.rule-tier-strict .rule-tier-head,
.rule-tier-strict .rule-tier-head:hover:not(:disabled) {
  background: var(--strict-bg);
  color: var(--strict-fg);
}

.rule-tier-paranoid .rule-tier-head,
.rule-tier-paranoid .rule-tier-head:hover:not(:disabled) {
  background: var(--paranoid-bg);
  color: var(--paranoid-fg);
}

.tier-label {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 1px;
}

.tier-label small,
.tier-counts {
  color: inherit;
  font-size: 11px;
}

.tier-counts {
  flex: none;
  font-weight: 500;
  text-align: right;
}

.tier-counts .count-off {
  color: var(--warn-fg);
}

.tier-content {
  padding: 12px;
  border-top: 1px solid var(--border);
}

.rule-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}

.rule-row:hover {
  border-color: var(--border-strong);
  background: var(--surface-2);
}

.rule-row.row-disabled {
  background: var(--surface);
}

.rule-control {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: flex-start;
  gap: 12px;
}

.rule-row.row-disabled .rule-control {
  cursor: not-allowed;
  opacity: 0.62;
}

.rule-example-button {
  position: relative;
  display: inline-flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  line-height: 1;
}

.rule-example-button::before {
  content: '';
  position: absolute;
  inset: -9px;
}

.rule-example-button:hover:not(:disabled) {
  color: var(--ink);
}

.inherit-button {
  grid-column: 1 / -1;
  justify-self: end;
  padding: 5px 8px;
  font-size: 11px;
}

label.row.master {
  align-items: center;
  padding: 12px 14px;
  border-color: var(--err-border);
  background: color-mix(in srgb, var(--err-bg) 60%, var(--surface));
}

label.row.master:hover {
  border-color: color-mix(in srgb, var(--err-fg) 34%, var(--err-border));
  background: var(--err-bg);
}

label.row.master:not(:has(input:checked)) {
  border-left: 3px solid var(--err-fg);
}

label.row.master:has(input:checked) {
  border-color: var(--master-border);
  background: color-mix(in srgb, var(--master-bg) 72%, var(--surface));
}

label.row.master:has(input:checked):hover {
  border-color: color-mix(in srgb, var(--master) 42%, var(--master-border));
  background: var(--master-bg);
}

label.row.master strong {
  font-size: 15px;
}

label.row.master input[type='checkbox'] {
  margin: 0;
  width: 44px;
  height: 24px;
}

label.row.master input[type='checkbox']:checked {
  background: var(--master);
  border-color: var(--master);
}

label.row.master input[type='checkbox']::before {
  width: 18px;
  height: 18px;
}

label.row.master input[type='checkbox']:checked::before {
  transform: translateX(20px);
}

.master-badge {
  flex: none;
  margin-left: auto;
  padding: 2px 9px;
  border: 1px solid var(--err-border);
  border-radius: 999px;
  background: var(--err-bg);
  color: var(--err-fg);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

label.row.master:has(input:checked) .master-badge {
  border-color: var(--master-border);
  background: var(--master-bg);
  color: var(--master-fg);
}

.state-active {
  color: var(--ok-fg);
  font-weight: 700;
}

.state-disabled {
  color: var(--err-fg);
  font-weight: 700;
}

.destructive-command-group + .destructive-command-group {
  margin-top: 24px;
}

.destructive-command-group h3 {
  margin: 0 0 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
}

.empty {
  margin: 0;
  padding: 16px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  color: var(--muted);
  text-align: center;
}

#secret {
  display: grid;
  gap: 14px;
}

.field {
  display: grid;
  gap: 4px;
}

.field-toggle .panel-toggle {
  justify-self: start;
  margin: -2px 0;
  padding: 2px 6px 2px 0;
  font-weight: 650;
}

#safety-level + .field,
.foldable-field-content + .field {
  margin-top: 14px;
}

#safety-overrides,
#workflow {
  margin-top: 4px;
}

.foldable-field-content {
  display: grid;
  gap: 4px;
}

.foldable-field-content > p {
  margin: 0;
  font-size: 12px;
}

.paths-content:not([hidden]) {
  display: grid;
  gap: 10px;
}

.paths-content > p.muted {
  margin: 0;
  font-size: 12px;
}

.field > span {
  font-size: 13px;
  font-weight: 650;
}

.field small {
  font-size: 11.5px;
  color: var(--muted);
  font-weight: 400;
  line-height: 1.45;
}

input[type='search'],
input[type='text'],
textarea {
  width: 100%;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 9px 11px;
  background: var(--field-bg);
  color: var(--ink);
  font: inherit;
  transition: border-color 0.15s ease;
}

input[type='search']:hover,
input[type='text']:hover,
textarea:hover {
  border-color: var(--muted);
}

input[type='search']:focus,
input[type='text']:focus,
textarea:focus {
  border-color: var(--muted);
  outline: none;
}

input[type='text']:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.tester-row {
  display: flex;
  gap: 8px;
}

.tester-row input[type='text'] {
  flex: 1 1 auto;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 12.5px;
}

.tester-row button {
  flex: none;
  align-self: center;
}

#tester-result {
  margin-top: 12px;
}

.tester-segment {
  margin-top: 6px;
}

.paths-add {
  display: flex;
  gap: 8px;
}

.paths-add input[type='text'] {
  flex: 1 1 auto;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 12.5px;
}

.paths-add button {
  flex: none;
  align-self: center;
}

.paths-hint {
  margin: -6px 0 0;
  color: var(--err-fg);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.paths-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}

.path-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.path-item code {
  flex: 1 1 auto;
  min-width: 0;
  padding: 9px 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: 12.5px;
  overflow-wrap: anywhere;
}

.path-item button:hover:not(:disabled) {
  color: var(--err-fg);
  border-color: var(--err-border);
  background: var(--err-bg);
}

.path-item.row-disabled {
  opacity: 0.62;
}

.path-item.row-disabled button {
  cursor: not-allowed;
}

.path-item button {
  flex: none;
}

textarea {
  min-height: 96px;
  resize: vertical;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.55;
}

#raw {
  min-height: 280px;
}

.star-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1 0 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.star-pitch {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  color: var(--ink);
  font-size: 12.5px;
  line-height: 1.45;
}

.star-pitch strong {
  font-variant-numeric: tabular-nums;
}

.star-mechanism {
  display: block;
  margin-top: 2px;
  color: var(--meta);
  font-size: 11.5px;
}

#star-slot {
  display: inline-flex;
  flex: none;
}

.star-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: none;
  white-space: nowrap;
  padding: 8px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  border-color: var(--border-strong);
  color: var(--muted);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.star-cta:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--star) 45%, var(--border-strong));
  background: var(--surface-2);
  color: var(--ink);
}

.star-cta:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.star-icon {
  display: inline-flex;
  width: 15px;
  height: 15px;
  color: var(--star);
}

.star-icon svg {
  width: 15px;
  height: 15px;
}

.star-count {
  display: inline-flex;
  align-items: center;
  align-self: stretch;
  border-left: 1px solid var(--border-strong);
  padding-left: 8px;
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.star-cta.starred:disabled {
  opacity: 1;
  cursor: default;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    /* !important: reduced-motion must win over every class-level transition */
    transition: none !important;
  }

  .activity-refresh.spinning svg,
  .integrations-refresh.spinning svg,
  .rules-refresh.spinning svg {
    animation: none;
  }
}

@media (max-width: 900px) {
  .tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .app-shell {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto 1fr;
  }

  .sidebar {
    z-index: 100;
    height: var(--topbar-h);
    flex-direction: row;
    align-items: center;
    gap: 14px;
    padding: 0 16px;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .brand-logo svg {
    height: 20px;
  }

  .topbar {
    position: static;
    z-index: auto;
  }

  .topbar.has-search {
    position: sticky;
    top: var(--topbar-h);
    z-index: 95;
  }

  .policy-savebar {
    top: calc(var(--topbar-h) * 2);
  }

  .brand {
    flex: none;
    padding: 0;
  }

  main {
    flex: 1;
  }

  .app-foot {
    display: flex;
    justify-content: center;
    gap: 28px;
    padding: 16px;
    border-top: 1px solid var(--border);
    font-size: 12px;
  }

  .app-foot a {
    color: var(--meta);
    text-decoration: none;
  }

  .app-foot a:hover {
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .sidenav {
    display: flex;
    flex: 1;
    justify-content: flex-end;
    gap: 2px;
  }

  .sidenav a {
    padding: 15px 7px;
  }

  .sr-only-collapse {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .sidebar-foot {
    display: none;
  }
}

@media (max-width: 640px) {
  .topbar {
    padding: 10px 16px;
  }

  .topbar-row {
    flex-wrap: wrap;
  }

  .topbar.has-search .topbar-row {
    flex-wrap: nowrap;
  }

  main {
    padding: 18px 16px 40px;
  }

  .topbar-search {
    max-width: none;
  }

  .panel {
    padding: 16px;
  }

  .star-row {
    flex-wrap: wrap;
  }

  .star-row .star-cta,
  .star-row #star-slot {
    flex: 1 1 100%;
    justify-content: center;
  }

  .panel-head {
    flex-direction: column;
  }

  .raw-json-head,
  .panel-head:has(.view-all-link) {
    flex-direction: row;
    align-items: center;
  }

  .grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .rule-tier-head,
  .tier-collapse {
    flex-wrap: wrap;
  }

  .rule-row {
    align-items: start;
  }

  .tier-counts {
    flex: 1 1 100%;
    padding-left: 20px;
    text-align: left;
  }

  .inherit-button {
    align-self: flex-start;
  }
}

@media (min-width: 1440px) {
  body[data-view='overview'] main,
  body[data-view='overview'] .topbar-row {
    max-width: 1200px;
  }
}

[hidden] {
  display: none;
}

  </style>
</head>
<body>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <h1 class="brand-logo"><a class="brand-home" href="#overview" title="Overview"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 512" role="img" aria-label="CC Safety Net">
  <path d="M 1439 165 L 1411 165 L 1409 166 L 1408 168 L 1403 173 L 1403 174 L 1398 179 L 1398 180 L 1395 183 L 1394 183 L 1394 184 L 1385 194 L 1385 195 L 1381 199 L 1381 200 L 1378 202 L 1378 203 L 1374 207 L 1374 208 L 1367 215 L 1367 216 L 1358 226 L 1358 227 L 1352 233 L 1352 234 L 1347 239 L 1347 240 L 1341 246 L 1341 247 L 1336 252 L 1336 253 L 1332 257 L 1332 258 L 1325 265 L 1325 266 L 1319 272 L 1319 273 L 1314 278 L 1314 279 L 1309 284 L 1309 285 L 1303 291 L 1303 292 L 1299 296 L 1299 297 L 1294 302 L 1291 299 L 1290 300 L 1290 301 L 1293 301 L 1294 302 L 1288 309 L 1287 308 L 1288 309 L 1286 312 L 1285 311 L 1285 306 L 1286 305 L 1286 303 L 1288 299 L 1288 296 L 1289 295 L 1289 292 L 1290 291 L 1290 287 L 1291 286 L 1291 284 L 1293 280 L 1293 277 L 1294 276 L 1294 272 L 1295 271 L 1295 269 L 1297 265 L 1297 262 L 1298 261 L 1298 258 L 1299 257 L 1299 253 L 1300 252 L 1300 250 L 1301 249 L 1301 247 L 1303 243 L 1303 238 L 1304 237 L 1304 235 L 1305 234 L 1305 232 L 1307 228 L 1307 224 L 1308 223 L 1308 221 L 1309 220 L 1309 217 L 1310 216 L 1310 214 L 1312 210 L 1312 205 L 1314 202 L 1314 199 L 1316 195 L 1317 188 L 1318 187 L 1318 185 L 1319 184 L 1319 182 L 1321 178 L 1321 173 L 1323 169 L 1323 166 L 1296 166 L 1296 168 L 1294 171 L 1294 174 L 1293 175 L 1293 178 L 1292 179 L 1291 186 L 1290 187 L 1290 189 L 1289 190 L 1289 192 L 1287 196 L 1287 200 L 1285 204 L 1285 207 L 1283 211 L 1283 215 L 1282 216 L 1282 218 L 1281 219 L 1281 222 L 1279 226 L 1279 229 L 1278 230 L 1278 234 L 1277 235 L 1277 237 L 1276 238 L 1276 240 L 1274 244 L 1274 249 L 1273 250 L 1273 252 L 1271 256 L 1271 259 L 1270 260 L 1270 263 L 1269 264 L 1269 268 L 1268 269 L 1268 271 L 1266 275 L 1266 278 L 1265 279 L 1265 284 L 1264 285 L 1264 287 L 1262 291 L 1262 294 L 1261 295 L 1261 298 L 1260 299 L 1259 306 L 1258 307 L 1258 309 L 1257 310 L 1257 313 L 1256 314 L 1256 318 L 1254 322 L 1254 325 L 1273 325 L 1274 327 L 1273 328 L 1272 327 L 1273 328 L 1269 332 L 1269 333 L 1265 337 L 1265 338 L 1261 341 L 1261 342 L 1252 352 L 1252 353 L 1247 358 L 1247 359 L 1242 364 L 1242 365 L 1239 367 L 1239 368 L 1224 385 L 1224 386 L 1220 390 L 1220 391 L 1216 395 L 1216 396 L 1214 397 L 1214 399 L 1247 399 L 1249 397 L 1249 396 L 1259 385 L 1259 384 L 1263 380 L 1263 379 L 1265 377 L 1266 377 L 1266 376 L 1271 371 L 1271 370 L 1278 363 L 1278 362 L 1283 357 L 1283 356 L 1294 344 L 1294 343 L 1298 339 L 1298 338 L 1305 331 L 1305 330 L 1309 326 L 1309 325 L 1312 323 L 1313 320 L 1315 319 L 1316 317 L 1321 312 L 1322 312 L 1321 311 L 1330 301 L 1330 300 L 1335 295 L 1335 294 L 1337 292 L 1338 292 L 1339 289 L 1342 287 L 1342 286 L 1346 282 L 1346 281 L 1352 275 L 1352 274 L 1361 264 L 1361 263 L 1370 253 L 1370 252 L 1375 247 L 1375 246 L 1380 241 L 1380 240 L 1387 233 L 1387 232 L 1402 215 L 1402 214 L 1406 210 L 1406 209 L 1408 207 L 1409 207 L 1409 206 L 1413 202 L 1413 201 L 1418 196 L 1418 195 L 1422 191 L 1422 190 L 1427 185 L 1427 184 L 1431 180 L 1431 179 L 1440 169 L 1441 167 Z
M 1129 179 L 1126 178 L 1125 176 L 1124 176 L 1116 170 L 1114 170 L 1107 166 L 1105 166 L 1104 165 L 1101 165 L 1100 164 L 1096 164 L 1095 163 L 1091 163 L 1090 162 L 1081 162 L 1080 161 L 1076 161 L 1075 162 L 1066 162 L 1065 163 L 1061 163 L 1060 164 L 1057 164 L 1056 165 L 1051 165 L 1050 166 L 1045 167 L 1040 170 L 1038 170 L 1028 175 L 1023 179 L 1021 179 L 1017 183 L 1016 183 L 1012 187 L 1011 187 L 999 199 L 999 200 L 996 203 L 996 204 L 994 205 L 993 208 L 990 211 L 981 229 L 981 231 L 980 232 L 980 234 L 979 235 L 979 237 L 977 241 L 977 244 L 976 245 L 976 254 L 975 255 L 975 265 L 976 266 L 976 273 L 977 274 L 977 277 L 980 283 L 981 288 L 984 292 L 985 295 L 988 298 L 989 301 L 998 310 L 1001 311 L 1004 314 L 1007 315 L 1009 317 L 1013 319 L 1015 319 L 1018 321 L 1020 321 L 1024 323 L 1027 323 L 1028 324 L 1035 324 L 1036 325 L 1054 325 L 1055 324 L 1062 324 L 1063 323 L 1067 323 L 1068 322 L 1071 322 L 1077 319 L 1080 319 L 1087 315 L 1089 315 L 1093 313 L 1095 311 L 1098 310 L 1103 306 L 1106 305 L 1116 296 L 1117 296 L 1115 292 L 1113 290 L 1112 290 L 1111 288 L 1109 286 L 1108 286 L 1107 284 L 1100 278 L 1098 279 L 1090 286 L 1089 286 L 1086 289 L 1074 295 L 1072 295 L 1068 297 L 1065 297 L 1064 298 L 1061 298 L 1060 299 L 1041 299 L 1040 298 L 1037 298 L 1036 297 L 1031 296 L 1028 294 L 1026 294 L 1024 292 L 1020 290 L 1010 280 L 1008 275 L 1006 273 L 1005 271 L 1005 268 L 1004 267 L 1004 264 L 1003 263 L 1003 248 L 1004 247 L 1005 238 L 1008 233 L 1008 231 L 1010 227 L 1012 225 L 1013 222 L 1018 216 L 1018 215 L 1030 203 L 1031 203 L 1044 194 L 1046 194 L 1053 190 L 1056 190 L 1057 189 L 1060 189 L 1061 188 L 1064 188 L 1065 187 L 1071 187 L 1072 186 L 1076 186 L 1077 187 L 1083 187 L 1084 188 L 1087 188 L 1088 189 L 1090 189 L 1091 190 L 1096 191 L 1100 194 L 1103 195 L 1106 198 L 1107 198 L 1109 200 L 1109 201 L 1114 206 L 1114 207 L 1116 209 L 1118 213 L 1118 216 L 1120 220 L 1120 225 L 1116 227 L 1111 227 L 1110 228 L 1103 228 L 1102 229 L 1097 229 L 1096 230 L 1091 230 L 1090 231 L 1086 231 L 1085 232 L 1077 232 L 1076 233 L 1072 233 L 1071 234 L 1066 234 L 1065 235 L 1061 235 L 1060 236 L 1053 236 L 1052 237 L 1047 237 L 1047 240 L 1046 241 L 1046 243 L 1045 244 L 1045 247 L 1044 248 L 1044 250 L 1043 251 L 1043 254 L 1042 255 L 1042 260 L 1041 261 L 1041 263 L 1044 263 L 1045 262 L 1050 262 L 1051 261 L 1058 261 L 1059 260 L 1063 260 L 1064 259 L 1068 259 L 1069 258 L 1073 258 L 1074 257 L 1080 257 L 1081 256 L 1086 256 L 1087 255 L 1092 255 L 1093 254 L 1097 254 L 1098 253 L 1103 253 L 1104 252 L 1111 252 L 1112 251 L 1116 251 L 1117 250 L 1121 250 L 1122 249 L 1126 249 L 1127 248 L 1133 248 L 1134 247 L 1139 247 L 1140 246 L 1144 246 L 1146 243 L 1146 240 L 1147 239 L 1147 231 L 1148 230 L 1148 220 L 1147 219 L 1147 211 L 1146 210 L 1146 207 L 1144 204 L 1144 202 L 1143 201 L 1143 199 L 1141 195 L 1139 193 L 1138 190 L 1134 186 L 1133 183 L 1132 183 L 1129 180 Z
M 1779 171 L 1767 165 L 1765 165 L 1764 164 L 1762 164 L 1758 162 L 1755 162 L 1754 161 L 1747 161 L 1746 160 L 1729 160 L 1728 161 L 1722 161 L 1721 162 L 1718 162 L 1717 163 L 1715 163 L 1711 165 L 1707 165 L 1687 175 L 1685 177 L 1681 179 L 1672 187 L 1671 187 L 1661 197 L 1661 198 L 1657 202 L 1657 203 L 1652 209 L 1651 212 L 1649 214 L 1644 224 L 1643 229 L 1640 235 L 1640 238 L 1639 239 L 1639 244 L 1638 245 L 1638 250 L 1637 251 L 1637 267 L 1638 268 L 1638 273 L 1639 274 L 1639 278 L 1640 279 L 1640 282 L 1648 298 L 1652 302 L 1652 303 L 1655 306 L 1657 307 L 1657 308 L 1659 310 L 1660 310 L 1663 313 L 1669 316 L 1671 318 L 1673 319 L 1675 319 L 1676 320 L 1678 320 L 1684 323 L 1688 323 L 1689 324 L 1696 324 L 1697 325 L 1715 325 L 1716 324 L 1723 324 L 1724 323 L 1728 323 L 1729 322 L 1732 322 L 1738 319 L 1741 319 L 1748 315 L 1750 315 L 1754 313 L 1758 310 L 1759 311 L 1760 309 L 1761 309 L 1764 306 L 1765 306 L 1771 301 L 1772 301 L 1778 295 L 1761 278 L 1760 278 L 1756 282 L 1755 282 L 1751 286 L 1750 286 L 1745 290 L 1737 294 L 1732 295 L 1729 297 L 1726 297 L 1725 298 L 1721 298 L 1720 299 L 1703 299 L 1702 298 L 1698 298 L 1697 297 L 1692 296 L 1684 292 L 1682 290 L 1681 290 L 1673 282 L 1671 278 L 1668 275 L 1668 273 L 1667 272 L 1667 270 L 1666 269 L 1666 267 L 1664 263 L 1664 246 L 1665 245 L 1665 242 L 1666 241 L 1666 239 L 1668 235 L 1668 232 L 1670 228 L 1672 226 L 1673 224 L 1673 222 L 1680 214 L 1680 213 L 1690 203 L 1691 203 L 1694 200 L 1695 200 L 1700 196 L 1712 190 L 1715 190 L 1716 189 L 1718 189 L 1722 187 L 1725 187 L 1726 186 L 1744 186 L 1745 187 L 1747 187 L 1748 188 L 1750 188 L 1751 189 L 1756 190 L 1758 191 L 1761 194 L 1764 195 L 1773 204 L 1773 205 L 1777 210 L 1777 212 L 1778 213 L 1778 215 L 1780 219 L 1780 223 L 1781 225 L 1780 226 L 1775 226 L 1774 227 L 1768 227 L 1767 228 L 1759 228 L 1758 229 L 1753 229 L 1752 230 L 1747 230 L 1746 231 L 1742 231 L 1741 232 L 1733 232 L 1732 233 L 1727 233 L 1726 234 L 1722 234 L 1721 235 L 1717 235 L 1716 236 L 1709 236 L 1707 238 L 1707 241 L 1706 242 L 1706 246 L 1705 247 L 1705 250 L 1703 254 L 1703 258 L 1702 259 L 1702 262 L 1706 262 L 1707 261 L 1714 261 L 1715 260 L 1724 259 L 1725 258 L 1728 258 L 1729 257 L 1735 257 L 1736 256 L 1742 256 L 1743 255 L 1747 255 L 1748 254 L 1752 254 L 1753 253 L 1757 253 L 1758 252 L 1765 252 L 1766 251 L 1771 251 L 1772 250 L 1776 250 L 1777 249 L 1781 249 L 1782 248 L 1789 248 L 1790 247 L 1794 247 L 1795 246 L 1804 245 L 1805 243 L 1805 240 L 1806 239 L 1807 240 L 1807 243 L 1809 244 L 1809 241 L 1808 241 L 1806 238 L 1806 232 L 1807 231 L 1807 217 L 1806 216 L 1806 210 L 1805 209 L 1805 206 L 1802 200 L 1802 198 L 1800 194 L 1798 192 L 1797 189 L 1790 181 L 1790 180 L 1788 179 Z
M 714 187 L 712 189 L 712 190 L 708 193 L 708 194 L 704 198 L 704 199 L 700 203 L 700 204 L 695 210 L 695 212 L 693 214 L 690 220 L 690 222 L 686 229 L 686 233 L 684 237 L 684 240 L 683 241 L 683 245 L 682 246 L 682 268 L 683 269 L 683 273 L 684 274 L 684 276 L 686 280 L 686 283 L 692 295 L 699 303 L 699 304 L 701 306 L 702 306 L 704 308 L 704 309 L 707 310 L 711 314 L 716 316 L 718 318 L 720 319 L 722 319 L 725 321 L 730 322 L 731 323 L 734 323 L 735 324 L 740 324 L 741 325 L 749 325 L 750 326 L 759 326 L 760 325 L 767 325 L 768 324 L 775 324 L 776 323 L 780 323 L 788 319 L 791 319 L 792 318 L 794 318 L 798 315 L 800 315 L 810 309 L 812 310 L 812 313 L 811 314 L 811 319 L 810 320 L 809 325 L 836 325 L 839 319 L 839 316 L 840 315 L 840 310 L 841 309 L 841 307 L 842 306 L 842 303 L 844 299 L 844 295 L 845 294 L 846 287 L 847 286 L 847 284 L 849 280 L 849 275 L 850 274 L 850 271 L 851 270 L 851 268 L 853 264 L 854 255 L 855 254 L 855 252 L 856 251 L 856 248 L 857 247 L 857 244 L 858 243 L 858 217 L 857 216 L 857 212 L 854 206 L 853 201 L 851 197 L 849 195 L 849 193 L 846 190 L 844 186 L 835 177 L 834 177 L 831 174 L 830 174 L 825 170 L 823 170 L 814 165 L 811 165 L 808 163 L 805 163 L 804 162 L 800 162 L 799 161 L 793 161 L 792 160 L 773 160 L 772 161 L 765 161 L 764 162 L 757 163 L 753 165 L 750 165 L 743 169 L 741 169 L 735 172 L 733 174 L 730 175 L 728 177 L 724 179 L 715 187 Z
M 806 192 L 808 194 L 811 195 L 815 199 L 816 199 L 822 206 L 822 207 L 824 209 L 827 215 L 827 217 L 829 221 L 829 226 L 830 227 L 830 240 L 829 241 L 829 246 L 828 247 L 828 250 L 827 251 L 827 253 L 825 256 L 825 258 L 823 262 L 821 264 L 820 267 L 817 270 L 817 271 L 808 281 L 807 281 L 803 285 L 799 287 L 796 290 L 794 290 L 788 294 L 786 294 L 785 295 L 783 295 L 782 296 L 780 296 L 776 298 L 773 298 L 772 299 L 748 299 L 747 298 L 744 298 L 743 297 L 738 296 L 735 294 L 733 294 L 731 292 L 727 290 L 717 280 L 717 279 L 715 277 L 712 271 L 712 269 L 710 265 L 710 262 L 709 261 L 709 245 L 710 244 L 710 240 L 711 239 L 711 237 L 712 236 L 713 231 L 717 223 L 719 221 L 720 218 L 724 214 L 724 213 L 734 203 L 735 203 L 739 199 L 742 198 L 744 196 L 756 190 L 758 190 L 762 188 L 765 188 L 766 187 L 769 187 L 770 186 L 788 186 L 789 187 L 792 187 L 796 189 L 799 189 L 800 190 L 802 190 Z
M 1192 121 L 1190 122 L 1190 124 L 1189 125 L 1189 129 L 1188 130 L 1188 132 L 1186 136 L 1186 139 L 1185 140 L 1184 147 L 1183 148 L 1183 150 L 1181 154 L 1181 157 L 1180 158 L 1180 162 L 1179 163 L 1179 165 L 1178 166 L 1178 168 L 1176 172 L 1176 176 L 1175 177 L 1175 179 L 1173 183 L 1173 186 L 1172 187 L 1171 194 L 1170 195 L 1170 197 L 1168 201 L 1168 204 L 1167 205 L 1167 209 L 1166 210 L 1166 212 L 1164 216 L 1164 219 L 1163 220 L 1162 227 L 1160 231 L 1160 234 L 1159 235 L 1158 242 L 1157 243 L 1157 245 L 1155 249 L 1155 252 L 1154 253 L 1154 259 L 1153 260 L 1153 276 L 1154 277 L 1154 282 L 1155 283 L 1155 286 L 1158 292 L 1158 294 L 1161 298 L 1162 301 L 1173 313 L 1174 313 L 1182 319 L 1184 319 L 1189 322 L 1191 322 L 1195 324 L 1199 324 L 1200 325 L 1236 325 L 1236 323 L 1237 322 L 1237 319 L 1238 318 L 1238 315 L 1239 314 L 1239 311 L 1240 310 L 1240 307 L 1241 306 L 1241 303 L 1242 302 L 1242 300 L 1241 299 L 1209 299 L 1208 298 L 1205 298 L 1195 293 L 1187 285 L 1186 282 L 1183 278 L 1183 275 L 1182 274 L 1182 271 L 1181 270 L 1181 257 L 1182 256 L 1182 253 L 1183 252 L 1183 248 L 1184 247 L 1184 245 L 1186 241 L 1186 238 L 1187 237 L 1187 233 L 1188 232 L 1188 230 L 1189 229 L 1189 227 L 1191 223 L 1191 220 L 1192 219 L 1192 215 L 1193 214 L 1193 211 L 1195 207 L 1195 204 L 1196 203 L 1196 199 L 1197 198 L 1197 195 L 1198 194 L 1198 192 L 1200 190 L 1278 190 L 1279 189 L 1279 187 L 1281 183 L 1281 180 L 1282 179 L 1282 177 L 1283 176 L 1283 174 L 1285 170 L 1285 166 L 1286 165 L 1285 164 L 1269 164 L 1268 165 L 1239 165 L 1238 164 L 1221 164 L 1220 165 L 1210 165 L 1209 164 L 1207 164 L 1206 163 L 1207 162 L 1207 159 L 1209 155 L 1209 152 L 1210 151 L 1210 147 L 1211 146 L 1211 144 L 1213 140 L 1214 133 L 1216 129 L 1217 122 L 1216 121 Z
M 997 121 L 978 121 L 977 122 L 960 122 L 959 123 L 952 124 L 948 126 L 945 126 L 938 130 L 936 130 L 931 134 L 928 135 L 925 138 L 922 139 L 917 144 L 916 144 L 907 153 L 907 154 L 903 158 L 903 159 L 897 166 L 888 184 L 888 186 L 886 190 L 886 193 L 884 197 L 884 200 L 882 204 L 882 209 L 881 210 L 881 213 L 880 214 L 880 216 L 878 220 L 878 224 L 877 225 L 876 232 L 875 233 L 875 235 L 873 239 L 873 244 L 871 248 L 871 251 L 869 255 L 869 259 L 868 260 L 868 263 L 867 264 L 867 266 L 866 267 L 866 270 L 864 274 L 864 279 L 863 280 L 863 282 L 862 283 L 862 285 L 860 289 L 860 294 L 859 295 L 859 298 L 857 301 L 857 304 L 856 305 L 856 308 L 855 309 L 855 313 L 854 314 L 854 316 L 853 317 L 853 320 L 851 324 L 852 325 L 878 325 L 879 324 L 879 322 L 880 321 L 880 317 L 881 316 L 881 314 L 883 310 L 883 307 L 884 306 L 885 299 L 887 295 L 887 292 L 888 291 L 889 284 L 891 280 L 891 277 L 892 276 L 892 273 L 893 272 L 894 265 L 896 261 L 896 258 L 897 257 L 897 254 L 898 253 L 898 249 L 899 248 L 899 246 L 901 242 L 901 239 L 902 238 L 903 231 L 905 227 L 905 224 L 906 223 L 906 219 L 907 218 L 908 211 L 910 207 L 910 204 L 911 203 L 911 199 L 912 198 L 912 196 L 914 194 L 980 194 L 982 192 L 982 188 L 983 187 L 984 180 L 986 176 L 986 173 L 988 172 L 987 170 L 987 168 L 930 168 L 929 167 L 937 159 L 938 159 L 941 156 L 942 156 L 944 154 L 946 154 L 948 152 L 952 150 L 955 150 L 956 149 L 959 149 L 960 148 L 964 148 L 965 147 L 992 147 L 993 146 L 993 144 L 995 140 L 995 136 L 996 135 L 996 130 L 998 126 L 998 122 Z
M 1844 120 L 1842 124 L 1842 127 L 1841 128 L 1841 131 L 1840 132 L 1840 136 L 1839 137 L 1839 140 L 1838 141 L 1838 144 L 1837 145 L 1837 149 L 1835 153 L 1835 157 L 1834 158 L 1834 161 L 1832 165 L 1832 168 L 1831 169 L 1831 173 L 1830 174 L 1830 177 L 1828 181 L 1828 184 L 1827 185 L 1827 188 L 1826 189 L 1826 193 L 1824 197 L 1824 200 L 1823 201 L 1823 204 L 1822 205 L 1822 209 L 1821 210 L 1821 213 L 1820 214 L 1820 216 L 1819 217 L 1819 220 L 1818 221 L 1818 224 L 1817 225 L 1817 230 L 1815 234 L 1815 237 L 1813 241 L 1813 245 L 1812 246 L 1812 249 L 1811 250 L 1811 253 L 1810 254 L 1810 259 L 1809 260 L 1809 275 L 1810 276 L 1810 280 L 1811 281 L 1811 284 L 1812 285 L 1812 287 L 1813 288 L 1814 293 L 1817 297 L 1818 300 L 1821 303 L 1821 304 L 1831 314 L 1834 315 L 1839 319 L 1841 319 L 1849 323 L 1852 323 L 1853 324 L 1858 324 L 1859 325 L 1890 325 L 1891 324 L 1891 321 L 1892 320 L 1892 317 L 1893 316 L 1893 313 L 1894 312 L 1894 309 L 1895 308 L 1896 299 L 1865 299 L 1864 298 L 1861 298 L 1854 294 L 1852 294 L 1848 290 L 1847 290 L 1846 288 L 1842 284 L 1841 281 L 1839 279 L 1837 275 L 1837 270 L 1836 269 L 1836 258 L 1837 257 L 1837 250 L 1838 249 L 1838 246 L 1840 242 L 1840 239 L 1841 238 L 1841 235 L 1842 234 L 1842 230 L 1844 226 L 1844 223 L 1845 222 L 1845 219 L 1846 218 L 1846 214 L 1847 213 L 1847 210 L 1848 209 L 1848 207 L 1849 206 L 1849 203 L 1850 202 L 1850 199 L 1851 198 L 1851 193 L 1853 189 L 1924 189 L 1925 188 L 1925 185 L 1926 184 L 1926 180 L 1927 179 L 1927 176 L 1928 175 L 1928 172 L 1929 171 L 1930 164 L 1929 163 L 1860 163 L 1859 162 L 1860 161 L 1861 154 L 1862 153 L 1862 151 L 1863 150 L 1863 147 L 1864 146 L 1864 141 L 1865 140 L 1865 138 L 1866 137 L 1866 134 L 1868 130 L 1868 126 L 1869 125 L 1869 120 Z
M 675 120 L 575 120 L 574 121 L 567 121 L 566 122 L 563 122 L 562 123 L 559 123 L 558 124 L 556 124 L 555 125 L 550 126 L 538 132 L 536 134 L 532 136 L 528 140 L 527 140 L 526 142 L 522 145 L 522 146 L 518 150 L 516 154 L 513 157 L 513 159 L 508 168 L 508 173 L 507 174 L 507 177 L 506 178 L 506 194 L 507 195 L 508 202 L 510 205 L 510 207 L 512 209 L 514 214 L 517 217 L 517 218 L 520 221 L 521 221 L 522 223 L 523 223 L 529 228 L 533 230 L 535 230 L 538 232 L 543 233 L 544 234 L 551 234 L 552 235 L 615 235 L 616 234 L 618 234 L 619 235 L 624 235 L 625 236 L 627 236 L 635 240 L 641 247 L 643 251 L 643 253 L 644 254 L 644 267 L 643 268 L 643 271 L 642 272 L 642 274 L 641 276 L 639 278 L 637 282 L 630 289 L 629 289 L 627 291 L 626 291 L 622 294 L 620 294 L 616 296 L 613 296 L 612 297 L 487 297 L 485 299 L 485 302 L 483 306 L 483 310 L 482 311 L 482 314 L 481 315 L 481 319 L 480 320 L 480 325 L 607 325 L 608 324 L 614 324 L 615 323 L 619 323 L 627 319 L 630 319 L 634 317 L 636 315 L 638 315 L 640 313 L 641 313 L 649 306 L 650 306 L 653 303 L 654 301 L 655 301 L 655 300 L 662 292 L 662 290 L 664 288 L 667 282 L 667 280 L 668 279 L 668 277 L 670 273 L 670 270 L 671 269 L 671 248 L 670 247 L 670 244 L 669 243 L 668 238 L 665 232 L 662 229 L 661 226 L 655 220 L 654 220 L 648 215 L 640 211 L 638 211 L 637 210 L 633 210 L 632 209 L 627 209 L 626 208 L 553 208 L 552 207 L 550 207 L 544 204 L 537 197 L 535 193 L 534 188 L 533 187 L 533 180 L 534 179 L 534 176 L 537 170 L 537 168 L 539 166 L 539 165 L 549 155 L 554 153 L 558 150 L 561 150 L 562 149 L 565 149 L 566 148 L 570 148 L 571 147 L 670 147 L 671 146 L 671 141 L 672 140 L 672 137 L 674 133 L 674 129 L 675 128 L 675 124 L 676 123 L 676 121 Z
M 333 132 L 331 134 L 328 135 L 326 137 L 321 139 L 311 148 L 310 148 L 296 163 L 296 164 L 290 172 L 288 177 L 286 179 L 286 181 L 282 188 L 281 193 L 279 196 L 279 198 L 277 202 L 277 206 L 276 207 L 276 212 L 275 213 L 275 220 L 274 221 L 274 237 L 275 238 L 275 244 L 276 245 L 277 254 L 278 255 L 279 260 L 281 263 L 282 268 L 286 276 L 288 278 L 289 281 L 294 287 L 294 288 L 305 300 L 306 300 L 311 305 L 315 307 L 318 310 L 320 310 L 323 313 L 327 315 L 329 315 L 336 319 L 339 319 L 340 320 L 342 320 L 343 321 L 345 321 L 349 323 L 353 323 L 354 324 L 363 324 L 364 325 L 434 325 L 435 324 L 435 319 L 436 318 L 436 309 L 437 308 L 437 301 L 438 300 L 438 298 L 437 297 L 364 297 L 363 296 L 354 295 L 348 292 L 346 292 L 340 289 L 338 287 L 335 286 L 332 283 L 331 283 L 322 275 L 322 274 L 315 266 L 312 260 L 310 258 L 310 256 L 306 249 L 306 245 L 305 244 L 305 241 L 304 240 L 304 237 L 303 236 L 303 216 L 304 215 L 304 211 L 305 210 L 306 203 L 315 185 L 317 183 L 319 179 L 324 174 L 324 173 L 326 172 L 329 168 L 330 168 L 334 164 L 337 163 L 340 160 L 345 158 L 347 156 L 351 154 L 356 153 L 359 151 L 361 151 L 362 150 L 367 150 L 368 149 L 373 149 L 374 148 L 445 148 L 447 144 L 447 136 L 448 135 L 448 124 L 449 122 L 447 120 L 378 120 L 377 121 L 367 121 L 366 122 L 362 122 L 361 123 L 358 123 L 357 124 L 350 125 L 342 129 L 340 129 L 337 131 L 335 131 Z
M 181 132 L 179 134 L 174 136 L 172 138 L 168 140 L 165 143 L 164 143 L 159 148 L 158 148 L 156 150 L 156 151 L 154 152 L 152 154 L 152 155 L 147 160 L 147 161 L 143 165 L 143 166 L 139 171 L 138 174 L 136 176 L 130 188 L 130 190 L 129 191 L 129 193 L 128 194 L 128 196 L 126 200 L 126 203 L 125 204 L 125 208 L 124 209 L 124 213 L 123 214 L 123 222 L 122 223 L 122 232 L 123 233 L 123 241 L 124 242 L 124 246 L 125 247 L 125 252 L 126 253 L 126 256 L 129 262 L 130 267 L 135 277 L 137 279 L 138 282 L 144 289 L 144 290 L 156 302 L 157 302 L 160 305 L 164 307 L 167 310 L 167 311 L 169 310 L 174 314 L 176 315 L 178 315 L 185 319 L 188 319 L 189 320 L 191 320 L 195 322 L 198 322 L 199 323 L 204 323 L 205 324 L 214 324 L 215 325 L 286 325 L 287 324 L 287 319 L 288 318 L 288 302 L 289 301 L 289 298 L 288 297 L 214 297 L 213 296 L 208 296 L 207 295 L 200 294 L 195 291 L 193 291 L 189 289 L 187 287 L 184 286 L 178 281 L 177 281 L 168 272 L 168 271 L 164 267 L 163 264 L 159 259 L 159 257 L 155 250 L 155 248 L 154 247 L 154 243 L 152 239 L 152 233 L 151 232 L 151 221 L 152 220 L 152 214 L 153 213 L 153 210 L 154 209 L 154 205 L 157 199 L 157 197 L 159 194 L 159 192 L 163 187 L 163 185 L 167 181 L 168 178 L 170 177 L 171 175 L 184 163 L 185 163 L 190 159 L 200 154 L 202 154 L 205 152 L 207 152 L 210 150 L 215 150 L 216 149 L 222 149 L 223 148 L 295 148 L 296 147 L 296 140 L 297 139 L 297 128 L 298 127 L 298 121 L 297 120 L 227 120 L 226 121 L 215 121 L 214 122 L 209 122 L 208 123 L 205 123 L 201 125 L 198 125 L 197 126 L 192 127 L 185 131 L 183 131 Z
M 1506 121 L 1499 127 L 1497 131 L 1497 138 L 1496 139 L 1496 143 L 1495 144 L 1495 147 L 1494 148 L 1494 151 L 1493 152 L 1493 155 L 1492 156 L 1491 163 L 1489 167 L 1489 170 L 1488 171 L 1488 175 L 1487 176 L 1487 179 L 1485 183 L 1485 186 L 1484 187 L 1484 190 L 1483 191 L 1483 195 L 1482 196 L 1482 199 L 1481 200 L 1481 202 L 1480 203 L 1480 206 L 1479 207 L 1479 212 L 1478 213 L 1478 216 L 1476 220 L 1476 223 L 1475 224 L 1475 227 L 1474 228 L 1474 232 L 1473 233 L 1472 240 L 1470 244 L 1470 249 L 1469 250 L 1468 257 L 1466 261 L 1466 265 L 1465 266 L 1465 270 L 1464 271 L 1464 274 L 1463 275 L 1463 277 L 1462 278 L 1462 281 L 1461 282 L 1461 287 L 1460 288 L 1460 290 L 1459 291 L 1459 294 L 1457 298 L 1456 307 L 1455 308 L 1455 311 L 1454 312 L 1454 314 L 1453 315 L 1453 318 L 1452 319 L 1452 325 L 1478 325 L 1479 324 L 1479 321 L 1481 317 L 1481 312 L 1482 311 L 1482 308 L 1483 307 L 1483 304 L 1484 303 L 1484 300 L 1485 299 L 1485 296 L 1486 295 L 1486 290 L 1488 286 L 1488 283 L 1489 282 L 1489 279 L 1490 278 L 1490 274 L 1491 273 L 1491 270 L 1492 269 L 1492 267 L 1493 266 L 1493 263 L 1494 262 L 1495 253 L 1496 252 L 1496 249 L 1497 248 L 1497 245 L 1498 244 L 1498 241 L 1499 240 L 1499 235 L 1500 234 L 1500 232 L 1502 228 L 1502 225 L 1503 224 L 1503 220 L 1504 219 L 1504 216 L 1506 212 L 1506 209 L 1507 208 L 1507 205 L 1508 204 L 1508 199 L 1509 198 L 1509 195 L 1511 191 L 1511 188 L 1512 187 L 1512 183 L 1513 182 L 1513 179 L 1515 175 L 1516 168 L 1517 167 L 1519 169 L 1519 171 L 1520 172 L 1521 170 L 1521 167 L 1519 165 L 1518 167 L 1517 166 L 1518 159 L 1520 156 L 1522 159 L 1522 162 L 1523 163 L 1524 170 L 1525 171 L 1525 173 L 1527 177 L 1527 180 L 1528 181 L 1528 183 L 1530 187 L 1530 190 L 1532 194 L 1532 197 L 1533 198 L 1533 200 L 1534 201 L 1534 203 L 1536 207 L 1536 211 L 1537 212 L 1537 215 L 1538 216 L 1538 218 L 1539 219 L 1539 221 L 1541 225 L 1541 229 L 1542 230 L 1542 232 L 1543 233 L 1543 235 L 1545 239 L 1546 246 L 1547 247 L 1547 249 L 1548 250 L 1548 252 L 1550 256 L 1550 261 L 1551 262 L 1551 264 L 1552 265 L 1552 267 L 1554 271 L 1555 278 L 1556 279 L 1556 281 L 1558 285 L 1558 288 L 1559 289 L 1560 296 L 1561 297 L 1561 299 L 1563 303 L 1563 307 L 1564 308 L 1564 310 L 1566 314 L 1568 316 L 1568 317 L 1570 319 L 1571 319 L 1573 321 L 1577 323 L 1579 323 L 1580 324 L 1595 324 L 1596 323 L 1598 323 L 1606 318 L 1610 310 L 1610 306 L 1612 302 L 1612 299 L 1613 298 L 1613 296 L 1614 295 L 1614 292 L 1615 291 L 1615 287 L 1616 286 L 1616 284 L 1617 283 L 1617 280 L 1619 276 L 1619 272 L 1620 271 L 1620 269 L 1621 268 L 1621 265 L 1623 261 L 1623 258 L 1624 257 L 1624 253 L 1625 252 L 1625 250 L 1627 246 L 1627 243 L 1628 242 L 1628 238 L 1629 237 L 1629 235 L 1631 231 L 1631 228 L 1632 227 L 1632 223 L 1633 222 L 1633 220 L 1634 219 L 1634 216 L 1635 215 L 1635 213 L 1637 209 L 1637 205 L 1638 204 L 1638 202 L 1639 201 L 1639 198 L 1641 194 L 1641 190 L 1642 189 L 1642 186 L 1643 185 L 1643 183 L 1645 179 L 1646 172 L 1647 171 L 1647 169 L 1648 168 L 1648 165 L 1650 161 L 1650 157 L 1651 156 L 1651 154 L 1652 153 L 1652 151 L 1654 147 L 1654 144 L 1655 143 L 1655 139 L 1656 138 L 1656 136 L 1657 135 L 1657 133 L 1659 129 L 1659 125 L 1661 122 L 1661 120 L 1660 119 L 1635 119 L 1632 123 L 1632 125 L 1631 126 L 1631 129 L 1630 130 L 1630 134 L 1629 135 L 1629 137 L 1627 141 L 1627 144 L 1626 145 L 1626 149 L 1625 150 L 1625 152 L 1624 153 L 1624 155 L 1622 159 L 1622 162 L 1621 163 L 1621 167 L 1620 168 L 1620 170 L 1618 174 L 1618 177 L 1617 178 L 1617 182 L 1616 183 L 1616 185 L 1614 189 L 1614 192 L 1612 196 L 1612 200 L 1611 201 L 1611 203 L 1610 204 L 1610 207 L 1608 211 L 1608 215 L 1606 219 L 1606 222 L 1604 226 L 1604 229 L 1603 230 L 1602 237 L 1600 241 L 1600 244 L 1599 245 L 1599 249 L 1598 250 L 1598 253 L 1597 254 L 1597 256 L 1595 260 L 1595 264 L 1594 265 L 1594 268 L 1592 272 L 1592 275 L 1590 278 L 1588 274 L 1587 274 L 1587 277 L 1590 281 L 1590 284 L 1588 288 L 1586 287 L 1586 285 L 1585 284 L 1585 281 L 1583 277 L 1583 273 L 1582 272 L 1582 270 L 1581 269 L 1581 267 L 1579 263 L 1579 260 L 1578 259 L 1578 256 L 1577 255 L 1577 253 L 1575 249 L 1575 246 L 1574 245 L 1573 238 L 1572 237 L 1572 235 L 1570 231 L 1569 224 L 1568 223 L 1568 221 L 1566 217 L 1565 210 L 1564 209 L 1564 207 L 1562 203 L 1562 200 L 1561 199 L 1560 192 L 1559 191 L 1559 189 L 1557 185 L 1557 182 L 1556 181 L 1556 179 L 1555 178 L 1555 176 L 1553 172 L 1552 165 L 1550 161 L 1550 158 L 1548 154 L 1548 151 L 1547 150 L 1547 147 L 1545 143 L 1545 140 L 1544 139 L 1543 134 L 1541 130 L 1534 123 L 1530 121 L 1528 121 L 1524 119 L 1513 119 L 1512 120 L 1509 120 L 1508 121 Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"/>
</svg>
</a></h1>
      </div>
      <nav class="sidenav" aria-label="Sections">
        <a href="#overview" data-nav="overview" title="Overview"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"></rect><rect x="14" y="3" width="7" height="5" rx="1.5"></rect><rect x="14" y="12" width="7" height="9" rx="1.5"></rect><rect x="3" y="16" width="7" height="5" rx="1.5"></rect></svg><span class="sr-only-collapse">Overview</span></a>
        <a href="#activity" data-nav="activity" title="Activity"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4"></path></svg><span class="sr-only-collapse">Activity</span></a>
        <a href="#policy" data-nav="policy" title="Policy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v5c0 4.4 3 8.4 7 10 4-1.6 7-5.6 7-10V6l-7-3Z"></path></svg><span class="sr-only-collapse">Policy</span></a>
        <a href="#rules" data-nav="rules" title="Rules"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"></path><path d="M15 3v4h4"></path><path d="M9 12h6M9 16h4"></path></svg><span class="sr-only-collapse">Rules</span></a>
        <a href="#integrations" data-nav="integrations" title="Integrations"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0V8ZM12 17v5"></path></svg><span class="sr-only-collapse">Integrations</span></a>
        <a href="#settings" data-nav="settings" title="Settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h10M18 8h2M4 16h2M10 16h10"></path><circle cx="16" cy="8" r="2.2"></circle><circle cx="8" cy="16" r="2.2"></circle></svg><span class="sr-only-collapse">Settings</span></a>
      </nav>
      <div class="sidebar-foot">
        <div class="sidebar-links">
          <a href="https://github.com/kenryu42/cc-safety-net" target="_blank" rel="noopener">GitHub</a>
          <a href="https://ccsafetynet.com/docs" target="_blank" rel="noopener">Documentation</a>
        </div>
      </div>
    </aside>
    <div class="content">
      <header class="topbar" id="topbar">
        <div class="topbar-row">
          <h2 class="topbar-title" id="topbar-title">Overview</h2>
          <label class="view-search topbar-search" data-search-view="activity" hidden>
            <span class="sr-only">Filter activity</span>
            <input type="search" id="activity-search" autocomplete="off" placeholder="Filter by rule or command">
          </label>
          <label class="view-search topbar-search" data-search-view="policy" hidden>
            <span class="sr-only">Search all protections</span>
            <input type="search" id="policy-search" autocomplete="off" placeholder="Filter by name, category, or rule ID">
          </label>
          <div class="topbar-actions">
            <div class="app-status" id="app-status" role="status" aria-live="polite">Loading...</div>
            <button type="button" class="dirty-chip" id="dirty-chip" hidden>Unsaved policy changes · Review</button>
          </div>
        </div>
      </header>
      <main>
        <div class="protection-banner" id="protection-banner" role="alert" hidden></div>
        <div class="status" id="status" role="status" aria-live="polite"></div>

        <section class="view" data-view="overview">
          <div class="view-head">
            <p class="panel-sub muted">What CC Safety Net has been doing on this machine.</p>
          </div>
          <div class="status health-strip" id="health-strip" hidden></div>
          <p class="tiles-window" id="overview-window"></p>
          <div class="tiles" id="overview-tiles"></div>
          <div class="star-row" id="star-row" hidden>
            <p class="star-pitch"><span id="star-pitch-text"></span> <span class="star-mechanism" id="star-mechanism" hidden>One click via your GitHub CLI. No redirect.</span></p>
            <span id="star-slot"></span>
          </div>
          <section class="panel" id="protection-card" hidden></section>
          <div class="dual-panels">
            <section class="panel">
              <div class="panel-head">
                <div class="panel-title">
                  <h2>Top blocked commands</h2>
                </div>
              </div>
              <div id="top-commands"></div>
            </section>
            <section class="panel">
              <div class="panel-head">
                <div class="panel-title">
                  <h2>Top blocked rules</h2>
                </div>
              </div>
              <div id="top-rules"></div>
            </section>
          </div>
          <button type="button" class="guard-errors" id="guard-errors" hidden></button>
        </section>

        <section class="view" data-view="activity" hidden>
          <div class="view-head">
            <p class="panel-sub muted">Audited commands from the local log, newest first. Commands are secret-redacted at write time.</p>
          </div>
          <section class="panel">
            <div class="activity-controls">
              <div class="activity-controls-row">
                <label class="activity-days"><span>Window</span>
                  <select id="activity-days"></select>
                </label>
                <button type="button" class="icon-button activity-refresh" id="activity-refresh" aria-label="Refresh activity" title="Refresh activity"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path></svg></button>
              </div>
              <div class="chip-row" id="activity-decision" role="group" aria-label="Filter by decision"></div>
              <div class="chip-row" id="activity-agents" role="group" aria-label="Filter by agent"></div>
              <div class="chip-row" id="activity-command-filter"></div>
            </div>
            <div id="activity-feed"></div>
            <p class="muted activity-count" id="activity-count"></p>
          </section>
        </section>

        <section class="view" data-view="policy" hidden>
          <div class="view-head view-head-actions">
            <p class="panel-sub muted">Choose what CC Safety Net blocks. Changes apply after you save.</p>
            <button type="button" id="project-draft-enter">Draft project policy</button>
          </div>
          <div class="project-draft-bar" id="project-draft-bar" hidden>
            <div class="project-draft-target">
              <strong>Project policy draft</strong>
              <code id="project-draft-path"></code>
              <p class="muted">Only the fields you mark are written here; everything else keeps inheriting from each member's own policy.</p>
            </div>
            <div class="savebar-actions">
              <button type="button" id="project-draft-change" hidden>Change…</button>
              <button type="button" id="project-draft-exit">Exit draft</button>
            </div>
          </div>
          <p class="status error" id="project-draft-diagnostics" hidden></p>
          <div class="policy-savebar" id="policy-savebar" hidden><span>Unsaved changes</span><div class="savebar-actions"><button type="button" id="discard-changes">Discard</button><button class="primary" id="save">Save</button></div></div>
          <div class="recovery" id="recovery" hidden>
            <div>
              <strong>Policy repair available</strong>
              <p class="muted">Repair writes canonical JSON by preserving valid settings. If the JSON cannot be parsed, defaults are restored.</p>
            </div>
            <button class="primary" id="repair" type="button">Repair</button>
          </div>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2 id="tester-label">Test a command</h2>
                <p class="panel-sub muted">Paste a shell command to see whether it is blocked under your current unsaved edits. Custom rulebook rules are enforced here too.</p>
              </div>
            </div>
            <div class="tester-row">
              <input type="text" id="tester-input" autocomplete="off" spellcheck="false" placeholder="Paste a shell command and press Enter" aria-labelledby="tester-label">
              <button type="button" id="tester-run">Test</button>
            </div>
            <div id="tester-result" class="status" hidden></div>
          </section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Safety preset</h2>
                <p class="panel-sub muted">Choose inherited protection defaults, then customize only what this workspace needs.</p>
              </div>
            </div>
            <div id="safety-preset-status" class="preset-status"></div>
            <div id="environment-overrides" class="status" hidden></div>
            <div class="grid" id="safety-level"></div>
            <div class="field field-toggle">
              <button class="panel-toggle" type="button" aria-expanded="false" aria-controls="safety-overrides-content"><span class="panel-chevron" aria-hidden="true"></span><span>Advanced overrides</span></button>
            </div>
            <div class="foldable-field-content" id="safety-overrides-content" hidden>
              <p class="muted">Inherit from the selected level unless a capability needs an explicit exception.</p>
              <div class="grid" id="safety-overrides"></div>
            </div>
            <div class="field">
              <span>Workflow</span>
              <small>Workflow exceptions are separate from safety level.</small>
            </div>
            <div class="grid" id="workflow"></div>
          </section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Destructive Command Protection</h2>
                <p class="panel-sub muted" id="destructive-command-summary"></p>
              </div>
              <button type="button" id="reset-rule-customizations" class="panel-head-action">Restore defaults</button>
            </div>
            <div id="destructive-command"></div>
          </section>
          <section class="panel">
            <header class="panel-head">
              <div class="panel-title">
                <h2>Secret Protection</h2>
                <p class="panel-sub muted" id="secret-summary">Default sensitive paths and coding CLI credential locations can be disabled individually. Deny paths are blocked while Secret protection is on.</p>
              </div>
              <button type="button" id="reset-secret-customizations" class="panel-head-action">Restore defaults</button>
            </header>
            <div id="secret"></div>
          </section>
          <section class="panel">
            <div class="panel-head raw-json-head">
              <div class="panel-title">
                <h2>Policy JSON</h2>
                <p class="panel-sub muted" id="raw-source">Read-only mirror of the policy controls.</p>
              </div>
              <button class="icon-button" id="raw-copy" type="button" aria-label="Copy raw JSON to clipboard"></button>
            </div>
            <textarea id="raw" aria-label="Raw policy JSON" aria-describedby="raw-source" readonly></textarea>
          </section>
        </section>

        <section class="view" data-view="rules" hidden>
          <div class="view-head">
            <p class="panel-sub muted">Custom rulebook rules enforced on this machine, and a prompt to hand rule authoring to your coding agent.</p>
          </div>
          <section class="panel" id="rules-composer-panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Create a rule</h2>
                <p class="panel-sub muted">CC Safety Net never writes rulebooks from here. Copy the prompt and paste it into your coding agent.</p>
              </div>
            </div>
            <div class="field">
              <span>Scope</span>
              <div class="chip-row" role="group" aria-label="Rule scope">
                <button type="button" class="chip" data-rules-scope="project" aria-pressed="true">Project</button>
                <button type="button" class="chip" data-rules-scope="user" aria-pressed="false">All projects</button>
              </div>
            </div>
            <div class="field" id="rules-project-path-field">
              <span id="rules-project-path-label">Project path</span>
              <div class="rules-path-row">
                <input type="text" id="rules-project-path" spellcheck="false" autocomplete="off" aria-labelledby="rules-project-path-label" aria-describedby="rules-project-path-hint">
                <button type="button" id="rules-choose-directory" hidden>Choose…</button>
              </div>
              <small id="rules-project-path-hint">Where the rulebook is written. Defaults to the directory this GUI was launched from.</small>
            </div>
            <div class="field">
              <span id="rules-composer-label">Request</span>
              <textarea id="rules-composer-input" spellcheck="false" placeholder="Describe the custom rules you want..." aria-labelledby="rules-composer-label" aria-describedby="rules-composer-hint"></textarea>
              <small id="rules-composer-hint">Rules match a command, its subcommand path, and exact arguments - not file paths or patterns.</small>
            </div>
            <div class="field">
              <span>Examples</span>
              <div class="chip-row">
                <button type="button" class="chip" data-rules-example="read my package.json and suggest blocking rules">Suggest rules</button>
                <button type="button" class="chip" data-rules-example="set up rules to block all terraform destroy commands">Block a command</button>
                <button type="button" class="chip" data-rules-example="verify my rules and fix any errors">Verify rules</button>
              </div>
            </div>
            <div class="rules-composer-actions">
              <button type="button" class="primary" id="rules-copy-prompt">Copy prompt</button>
            </div>
          </section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Rulebooks</h2>
                <p class="panel-sub muted">Read-only. Rules are shown as enforced, after overrides.</p>
              </div>
              <button type="button" class="icon-button rules-refresh" id="rules-refresh" aria-label="Refresh rules" title="Refresh rules"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path></svg></button>
            </div>
            <div id="rules-list"><p class="empty">Loading rules…</p></div>
          </section>
          <section class="panel" id="rules-diagnostics-panel" hidden>
            <div class="panel-head">
              <div class="panel-title">
                <h2>Diagnostics</h2>
                <p class="panel-sub muted">Errors mean a rulebook was dropped and its rules are not enforced.</p>
              </div>
            </div>
            <div id="rules-diagnostics"></div>
          </section>
        </section>

        <section class="view" data-view="settings" hidden>
          <div class="view-head">
            <p class="panel-sub muted">Appearance, file locations, and maintenance.</p>
          </div>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Appearance</h2>
                <p class="panel-sub muted">Theme preference is stored in this browser.</p>
              </div>
              <button type="button" id="theme-toggle"></button>
            </div>
          </section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Files</h2>
                <p class="panel-sub muted">Where CC Safety Net reads and writes on this machine.</p>
              </div>
            </div>
            <div class="info-rows">
              <div class="info-row"><span>Policy file</span><code id="policy-path"></code></div>
              <div class="info-row" id="project-policy-row" hidden><span>Project policy</span><code id="project-policy-path"></code></div>
              <div class="info-row"><span>Audit logs</span><code id="logs-path"></code></div>
            </div>
            <p class="status" id="project-policy-notice" hidden></p>
          </section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Audit log retention</h2>
                <p class="panel-sub muted">How long decisions are kept before the sweep deletes them. Every analyzed command is recorded, so a long window grows the log.</p>
              </div>
            </div>
            <label class="retention-row">
              <span>Keep for</span>
              <input type="number" id="retention-days" min="1" max="365" step="1" inputmode="numeric" aria-describedby="retention-note">
              <span id="retention-unit">days</span>
            </label>
            <p class="muted retention-note" id="retention-note"></p>
          </section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Version</h2>
              </div>
            </div>
            <div class="info-rows">
              <div class="info-row"><code id="app-version"></code></div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Danger zone</h2>
                <p class="panel-sub muted">Actions that discard saved configuration.</p>
              </div>
            </div>
            <div class="danger-row">
              <div>
                <strong>Reset policy</strong>
                <p class="muted">Restore the default policy JSON at the configured path.</p>
              </div>
              <button class="danger" id="reset">Reset</button>
            </div>
          </section>
        </section>

        <section class="view" data-view="integrations" hidden>
          <div class="view-head">
            <p class="panel-sub muted">Install or remove the cc-safety-net hook for each coding agent on this machine.</p>
          </div>
          <section class="panel">
            <div class="panel-head">
              <div class="panel-title">
                <h2>Agents</h2>
                <p class="panel-sub muted">Detected CLIs and hook status.</p>
              </div>
              <button type="button" class="icon-button integrations-refresh" id="integrations-refresh" aria-label="Refresh integrations" title="Refresh integrations"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path></svg></button>
            </div>
            <div id="integrations-list"><p class="empty">Checking integrations…</p></div>
          </section>
          <section class="panel" id="integrations-system" hidden>
            <div class="panel-head">
              <div class="panel-title">
                <h2>System</h2>
                <p class="panel-sub muted">Runtime detected on this machine.</p>
              </div>
            </div>
            <div class="info-rows">
              <div class="info-row"><span>cc-safety-net</span><code id="integrations-pkg-version"></code></div>
              <div class="info-row"><span>Node.js</span><code id="integrations-node-version"></code></div>
              <div class="info-row"><span>Platform</span><code id="integrations-platform"></code></div>
            </div>
          </section>
        </section>
      </main>
      <footer class="app-foot">
        <a href="https://github.com/kenryu42/cc-safety-net" target="_blank" rel="noopener">GitHub</a>
        <a href="https://ccsafetynet.com/docs" target="_blank" rel="noopener">Documentation</a>
      </footer>
    </div>
  </div>
  <div class="rule-example-popover" id="rule-example-popover" popover="auto" role="dialog" aria-labelledby="rule-example-title" aria-describedby="rule-example-command">
    <span class="rule-example-label" id="rule-example-label">Blocked command example</span>
    <strong id="rule-example-title"></strong>
    <code id="rule-example-command"></code>
  </div>
  <dialog class="confirm-dialog" id="confirm-dialog" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-body confirm-dialog-detail">
    <form method="dialog">
      <h2 id="confirm-dialog-title"></h2>
      <p class="muted" id="confirm-dialog-body"></p>
      <div class="dialog-rows" id="confirm-dialog-rows" hidden></div>
      <p class="dialog-detail"><code id="confirm-dialog-detail"></code></p>
      <div class="dialog-actions">
        <button type="submit" id="confirm-dialog-cancel" value="cancel">Cancel</button>
        <button type="submit" class="danger" id="confirm-dialog-confirm" value="confirm"></button>
      </div>
    </form>
  </dialog>
  <dialog class="confirm-dialog report-dialog" id="report-dialog" aria-labelledby="report-dialog-title" aria-describedby="report-dialog-body">
    <form method="dialog">
      <h2 id="report-dialog-title">Report false positive</h2>
      <p class="muted" id="report-dialog-body">This opens a prefilled GitHub issue form — it is public, and nothing is submitted until you submit it there. Paths were replaced with <code>&lt;project&gt;</code> and <code>~</code>; edit anything else you would rather not publish.</p>
      <label class="report-field"><span>Blocked command</span><textarea id="report-command" spellcheck="false"></textarea></label>
      <label class="report-field"><span>Audit log entry</span><textarea id="report-entry" spellcheck="false"></textarea></label>
      <div class="dialog-actions">
        <button type="submit" id="report-dialog-cancel" value="cancel">Cancel</button>
        <button type="submit" class="primary" id="report-dialog-open" value="report">Open GitHub form</button>
      </div>
    </form>
  </dialog>
  <script id="ccsn-data" type="application/json"></script>
  <script>
// src/audit/display.ts
var formatRelativeTime = (value) => {
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff))
    return "";
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0)
    return \`\${days}d ago\`;
  if (hours > 0)
    return \`\${hours}h ago\`;
  if (minutes > 0)
    return \`\${minutes}m ago\`;
  return "just now";
};
var commandSignature = (source) => {
  const tokens = (source ?? "").trim().split(/\\s+/).filter((token) => token && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(token));
  const binary = tokens[0]?.split("/").pop();
  if (!binary)
    return null;
  const next = tokens[1];
  return next && /^[a-z][a-z0-9-]*$/.test(next) ? \`\${binary} \${next}\` : binary;
};
function findSuspectEntries(entries) {
  const signatureKey = (entry) => \`\${entry.sessionId}
\${commandSignature(entry.segment || entry.command)}\`;
  const denials = entries.filter((entry) => entry.decision !== "allow");
  const repeats = denials.filter((entry) => entry.sessionId).reduce((counts, entry) => counts.set(signatureKey(entry), (counts.get(signatureKey(entry)) ?? 0) + 1), new Map);
  return new Set(denials.filter((entry) => entry.failureStage || (repeats.get(signatureKey(entry)) ?? 0) >= 2));
}

// src/core/policy/audit-retention-days.ts
var DEFAULT_AUDIT_RETENTION_DAYS = 30;
var MIN_AUDIT_RETENTION_DAYS = 1;
var MAX_AUDIT_RETENTION_DAYS = 365;

// src/core/policy/safety-level.ts
var SAFETY_LEVEL_CAPABILITIES = {
  standard: { fail_closed: false, paranoid_rm: false, paranoid_interpreters: false },
  strict: { fail_closed: true, paranoid_rm: false, paranoid_interpreters: false },
  paranoid: { fail_closed: true, paranoid_rm: true, paranoid_interpreters: true }
};

// src/hosts/catalog.ts
var catalog = [
  {
    id: "antigravity-cli",
    displayName: "Antigravity CLI",
    doctorOrder: 3,
    runtime: {
      order: 1,
      flags: ["-ac", "--agy-cli"],
      description: "Run as Antigravity CLI PreToolUse hook",
      legacyTopLevelFlags: []
    },
    install: {
      order: 2,
      flag: "--agy-cli",
      artifactKind: "hook config",
      probeCommand: ["agy", "--version"]
    }
  },
  {
    id: "claude-code",
    displayName: "Claude Code",
    doctorOrder: 1,
    runtime: {
      order: 2,
      displayName: "Coding CLI",
      flags: ["-cc", "--coding-cli"],
      legacyFlags: ["--claude-code"],
      description: "Run as Coding CLI PreToolUse hook",
      legacyTopLevelFlags: ["-cc", "--claude-code"]
    },
    install: {
      order: 3,
      flag: "--claude-code",
      artifactKind: "plugin",
      probeCommand: ["claude", "--version"]
    }
  },
  {
    id: "codex",
    displayName: "Codex",
    doctorOrder: 4,
    runtime: {
      order: 3,
      flags: ["-cx", "--codex"],
      description: "Run as a Codex PreToolUse hook",
      legacyTopLevelFlags: []
    },
    install: {
      order: 4,
      flag: "--codex",
      artifactKind: "plugin",
      probeCommand: ["codex", "--version"]
    }
  },
  {
    id: "copilot-cli",
    displayName: "GitHub Copilot CLI",
    doctorOrder: 7,
    runtime: {
      order: 6,
      flags: ["-cp", "--copilot-cli"],
      description: "Run as GitHub Copilot CLI PreToolUse hook",
      legacyTopLevelFlags: ["-cp", "--copilot-cli"]
    },
    install: {
      order: 7,
      flag: "--copilot-cli",
      artifactKind: "plugin",
      probeCommand: ["copilot", "--binary-version"]
    }
  },
  {
    id: "gemini-cli",
    displayName: "Gemini CLI",
    doctorOrder: 6,
    runtime: {
      order: 5,
      flags: ["-gc", "--gemini-cli"],
      description: "Run as Gemini CLI BeforeTool hook",
      legacyTopLevelFlags: ["-gc", "--gemini-cli"]
    },
    install: {
      order: 6,
      flag: "--gemini-cli",
      artifactKind: "extension",
      probeCommand: ["gemini", "--version"]
    }
  },
  {
    id: "grok-build",
    displayName: "Grok Build",
    doctorOrder: 8,
    runtime: {
      order: 7,
      flags: ["-gb", "--grok-build"],
      description: "Run as Grok Build PreToolUse hook",
      legacyTopLevelFlags: []
    },
    install: {
      order: 8,
      flag: "--grok-build",
      artifactKind: "hook config",
      probeCommand: ["grok", "--version"]
    }
  },
  {
    id: "hermes-agent",
    displayName: "Hermes Agent",
    doctorOrder: 9,
    runtime: {
      order: 8,
      flags: ["-ha", "--hermes-agent"],
      description: "Run as Hermes Agent pre_tool_call hook",
      legacyTopLevelFlags: []
    },
    install: {
      order: 9,
      flag: "--hermes-agent",
      artifactKind: "plugin",
      probeCommand: ["hermes", "--version"]
    }
  },
  {
    id: "kimi-code",
    displayName: "Kimi Code",
    doctorOrder: 10,
    runtime: {
      order: 9,
      flags: ["-kc", "--kimi-code"],
      description: "Run as Kimi Code PreToolUse hook",
      legacyTopLevelFlags: []
    },
    install: {
      order: 10,
      flag: "--kimi-code",
      artifactKind: "hook config",
      probeCommand: ["kimi", "--version"]
    }
  },
  {
    id: "openclaw",
    displayName: "OpenClaw",
    doctorOrder: 11,
    install: {
      order: 11,
      flag: "--openclaw",
      artifactKind: "plugin",
      probeCommand: ["openclaw", "--version"]
    }
  },
  {
    id: "opencode",
    displayName: "OpenCode",
    doctorOrder: 12,
    install: {
      order: 12,
      flag: "--opencode",
      artifactKind: "plugin",
      probeCommand: ["opencode", "--version"]
    }
  },
  {
    id: "pi",
    displayName: "Pi",
    doctorOrder: 13,
    install: {
      order: 13,
      flag: "--pi",
      artifactKind: "package",
      probeCommand: ["pi", "--version"]
    }
  },
  {
    id: "cursor",
    displayName: "Cursor",
    doctorOrder: 5,
    runtime: {
      order: 4,
      flags: ["-cu", "--cursor"],
      description: "Run as Cursor preToolUse hook",
      legacyTopLevelFlags: []
    },
    install: {
      order: 5,
      flag: "--cursor",
      artifactKind: "hook config",
      probeCommand: ["cursor", "--version"]
    }
  },
  {
    id: "amp",
    displayName: "Amp Code",
    doctorOrder: 2,
    install: {
      order: 1,
      flag: "--amp",
      artifactKind: "plugin",
      probeCommand: ["amp", "--version"]
    }
  }
];
var doctorIntegrationOrder = catalog.slice().sort((a, b) => a.doctorOrder - b.doctorOrder).map((integration) => integration.id);
var runtimeHookIntegrationMetadata = catalog.filter((integration) => ("runtime" in integration)).slice().sort((a, b) => a.runtime.order - b.runtime.order).map((integration) => ({
  id: integration.id,
  displayName: "displayName" in integration.runtime ? integration.runtime.displayName : integration.displayName,
  flags: integration.runtime.flags,
  legacyFlags: "legacyFlags" in integration.runtime ? integration.runtime.legacyFlags : [],
  description: integration.runtime.description,
  legacyTopLevelFlags: integration.runtime.legacyTopLevelFlags
}));
var installIntegrationMetadata = catalog.slice().sort((a, b) => a.install.order - b.install.order).map((integration) => ({ id: integration.id, ...integration.install })).map(({ order: _, ...integration }) => integration);
var integrationDisplayNames = Object.fromEntries(catalog.map((integration) => [integration.id, integration.displayName]));

// src/gui/frontend/project-draft.ts
var clonePolicy = (policy) => JSON.parse(JSON.stringify(policy));
var markedOverrides = (marked, section, overrides) => Object.fromEntries(Object.entries(overrides).filter(([key, value]) => value !== undefined && marked.has(\`\${section}.overrides.\${key}\`)));
var withOverrides = (overrides) => Object.keys(overrides).length > 0 ? { overrides } : {};
var collectProjectProposal = (marked, policy) => {
  const sections = {
    safety: {
      ...marked.has("safety.level") ? { level: policy.safety.level } : {},
      ...withOverrides(markedOverrides(marked, "safety", policy.safety.overrides))
    },
    workflow: marked.has("workflow.worktree_mode") ? { worktree_mode: policy.workflow.worktree_mode } : {},
    destructive_command_protection: {
      ...marked.has("destructive_command_protection.enabled") ? { enabled: policy.destructive_command_protection.enabled } : {},
      ...withOverrides(markedOverrides(marked, "destructive_command_protection", policy.destructive_command_protection.overrides)),
      ...marked.has("destructive_command_protection.allow_paths") ? { allow_paths: policy.destructive_command_protection.allow_paths } : {}
    },
    secret_protection: {
      ...marked.has("secret_protection.enabled") ? { enabled: policy.secret_protection.enabled } : {},
      ...withOverrides(markedOverrides(marked, "secret_protection", policy.secret_protection.overrides)),
      ...marked.has("secret_protection.deny_paths") ? { deny_paths: policy.secret_protection.deny_paths } : {},
      ...marked.has("secret_protection.allow_paths") ? { allow_paths: policy.secret_protection.allow_paths } : {}
    }
  };
  return {
    version: 1,
    ...Object.fromEntries(Object.entries(sections).filter(([, fields]) => Object.keys(fields).length > 0))
  };
};
var projectMarkedFields = (projection) => {
  const destructive = projection.destructive_command_protection ?? {};
  const secret = projection.secret_protection ?? {};
  return [
    ...projection.safety?.level === undefined ? [] : ["safety.level"],
    ...Object.keys(projection.safety?.overrides ?? {}).map((key) => \`safety.overrides.\${key}\`),
    ...projection.workflow?.worktree_mode === undefined ? [] : ["workflow.worktree_mode"],
    ...destructive.enabled === undefined ? [] : ["destructive_command_protection.enabled"],
    ...Object.keys(destructive.overrides ?? {}).map((id) => \`destructive_command_protection.overrides.\${id}\`),
    ...destructive.allow_paths === undefined ? [] : ["destructive_command_protection.allow_paths"],
    ...secret.enabled === undefined ? [] : ["secret_protection.enabled"],
    ...Object.keys(secret.overrides ?? {}).map((id) => \`secret_protection.overrides.\${id}\`),
    ...secret.deny_paths === undefined ? [] : ["secret_protection.deny_paths"],
    ...secret.allow_paths === undefined ? [] : ["secret_protection.allow_paths"]
  ];
};
var overlayProjectProposal = (baseline, proposal) => {
  const displayed = clonePolicy(baseline);
  const destructive = proposal.destructive_command_protection ?? {};
  const secret = proposal.secret_protection ?? {};
  if (proposal.safety?.level)
    displayed.safety.level = proposal.safety.level;
  Object.assign(displayed.safety.overrides, proposal.safety?.overrides ?? {});
  if (proposal.workflow?.worktree_mode !== undefined)
    displayed.workflow.worktree_mode = proposal.workflow.worktree_mode;
  if (destructive.enabled !== undefined)
    displayed.destructive_command_protection.enabled = destructive.enabled;
  Object.assign(displayed.destructive_command_protection.overrides, destructive.overrides ?? {});
  if (destructive.allow_paths)
    displayed.destructive_command_protection.allow_paths = destructive.allow_paths;
  if (secret.enabled !== undefined)
    displayed.secret_protection.enabled = secret.enabled;
  Object.assign(displayed.secret_protection.overrides, secret.overrides ?? {});
  if (secret.deny_paths)
    displayed.secret_protection.deny_paths = secret.deny_paths;
  if (secret.allow_paths)
    displayed.secret_protection.allow_paths = secret.allow_paths;
  return displayed;
};
var seedProjectDraft = (data) => {
  if (!data.baseline)
    return null;
  if (!Array.isArray(data.userPolicyDiagnostics) || data.userPolicyDiagnostics.length > 0)
    return null;
  const marked = new Set(projectMarkedFields(data.projection ?? {}));
  const policy = overlayProjectProposal(data.baseline, data.projection ?? {});
  return {
    baseline: data.baseline,
    marked,
    policy,
    snapshot: JSON.stringify(collectProjectProposal(marked, policy))
  };
};

// src/gui/frontend/report.ts
var reportIssueUrl = "https://github.com/kenryu42/cc-safety-net/issues/new?template=false_positive.yml";
var reportUrlLimit = 8000;
var endsAtPathBoundary = (following) => following === "" || /^[/\\\\\\s'"]/.test(following);
var scrubReportPaths = (text, cwd, home) => [
  [cwd, "<project>"],
  [home, "~"]
].reduce((scrubbed, [from, to]) => from ? scrubbed.split(from).reduce((joined, part) => joined + (endsAtPathBoundary(part) ? to : from) + part) : scrubbed, text);
var buildReportUrl = (fields) => {
  const url = new URL(reportIssueUrl);
  Object.entries(fields).filter(([, value]) => value).forEach(([field, value]) => {
    url.searchParams.set(field, value);
  });
  return url.toString();
};
var buildReportRequest = (fields, dropped = []) => {
  const url = buildReportUrl(fields);
  if (url.length <= reportUrlLimit)
    return { url, dropped };
  const largest = Object.entries(fields).filter(([, value]) => value).sort((left, right) => right[1].length - left[1].length)[0];
  if (!largest)
    return { url, dropped };
  return buildReportRequest({ ...fields, [largest[0]]: "" }, [...dropped, largest[0]]);
};

// src/gui/frontend/rule-prompt.ts
var rulePromptText = (prompt) => {
  const names = prompt.rulesData?.rulebooks.map((rulebook) => rulebook.name) ?? [];
  return [
    "Use the cc-safety-net skill for this request.",
    "If that skill is not available, run \`npx -y cc-safety-net rule doc\` first and treat its output as the source of truth for schema, paths, and validation.",
    "",
    prompt.rulesScope === "project" ? \`Scope: this project - \${prompt.projectPath.trim()}\` : "Scope: all projects (user scope)",
    \`Existing rulebooks (names must stay unique across both scopes): \${names.length > 0 ? names.join(", ") : "none"}\`,
    "",
    prompt.request.trim()
  ].join(\`
\`);
};

// src/gui/frontend/main.ts
var token = JSON.parse(document.getElementById("ccsn-data").textContent).token;
var fallbackRepoUrl = "https://github.com/kenryu42/cc-safety-net";
var safetyLevels = {
  standard: [
    "Standard",
    "Blocks recognizable destructive commands and sensitive content access while allowing metadata-only sensitive-path checks. Recommended for normal coding."
  ],
  strict: [
    "Strict",
    "Standard, plus blocks dynamic or unparseable commands and metadata-only sensitive-path discovery. Occasional false positives on advanced shell."
  ],
  paranoid: [
    "Paranoid",
    "Strict, plus blocks rm -rf inside your project and interpreter one-liners. Expect friction; for untrusted agents or high-stakes repos."
  ]
};
var safetyOverrides = {
  fail_closed: ["Fail closed", "Block commands the parser cannot fully understand."],
  paranoid_rm: ["Paranoid rm -rf checks", "Block non-temp rm -rf inside the project."],
  paranoid_interpreters: ["Paranoid interpreters", "Block interpreter one-liners."]
};
var rawCopyIcons = {
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2"></path></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>'
};
var starIcons = {
  outline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>',
  filled: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>'
};
var reportIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><path d="M4 22v-7"></path></svg>';
var pathListIcons = {
  add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',
  remove: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M10 11v6M14 11v6"></path></svg>'
};
var state;
var draftPolicy;
var projectDraft = null;
var markedFields = new Set;
var preview;
var previewRequestId = 0;
var dirty = false;
var searchActive = false;
var OVERVIEW_DAYS = 7;
var overview = null;
var activity = null;
var knownRuleIds = new Set;
var activityFilters = { days: 7, decision: "all", agent: "all", query: "", command: "" };
var tierExpanded = new Map([
  ["enforced", false],
  ["normal", false],
  ["strict", false],
  ["paranoid", false]
]);
var searchCollapsedTiers = new Set;
var secretGroupExpanded = new Map;
var searchCollapsedSecretGroups = new Set;
var rawCopyResetTimer = null;
var feedCopyResetTimer = null;
var activityQueryTimer;
var renderedFeedEntries = [];
var suspects = new Set;
var activeStarContext = { starred: null, starCount: null, blockedTotal: 0 };
var integrations = null;
var integrationBusy = new Set;
var rulesData = null;
var rulesRequested = false;
var rulesScope = "project";
var pendingRuleFocus = null;
var directoryPickerFailed = false;
var api = (path, init = {}) => fetch(\`\${path}\${path.includes("?") ? "&" : "?"}token=\${encodeURIComponent(token)}\`, {
  ...init,
  headers: {
    "content-type": "application/json",
    "x-cc-safety-net-token": token,
    ...init.headers
  }
});
var requestJson = async (path, init) => {
  try {
    const response = await api(path, init);
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      data: text ? JSON.parse(text) : {},
      error: undefined
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: undefined,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};
var errorText = (result) => result.error ?? (Array.isArray(result.data?.errors) && result.data.errors.length ? result.data.errors.join(\`
\`) : null) ?? result.data?.error ?? \`Request failed (status \${result.status}).\`;
var isWriteSuccess = (result) => result.ok && !(Array.isArray(result.data?.errors) && result.data.errors.length > 0);
var qs = (id) => document.getElementById(id);
var setDetailStatus = (text, kind = "") => {
  qs("status").textContent = text;
  qs("status").className = \`status \${kind}\`;
};
var appStatusTimer;
var setAppStatus = (text, kind = "") => {
  qs("app-status").textContent = text;
  qs("app-status").className = \`app-status \${kind}\`;
  clearTimeout(appStatusTimer);
  if (kind === "ok")
    appStatusTimer = setTimeout(() => setAppStatus(""), 4000);
};
var busy = false;
var updateActions = () => {
  const hasErrors = (state?.errors.length ?? 0) > 0;
  qs("save").disabled = busy || !state || hasErrors;
  qs("reset").disabled = busy || !state;
  qs("repair").disabled = busy || !hasErrors;
};
var runExclusive = async (pendingText, fn) => {
  if (busy)
    return;
  busy = true;
  updateActions();
  setAppStatus(pendingText);
  setDetailStatus("");
  try {
    await fn();
  } finally {
    busy = false;
    updateActions();
  }
};
var checkbox = (checked) => checked ? "checked" : "";
var dayCount = (days) => \`\${days} day\${days === 1 ? "" : "s"}\`;
var syncMasterBadges = () => {
  document.querySelectorAll("label.row.master input").forEach((input) => {
    const badge = input.closest("label")?.querySelector(".master-badge");
    if (badge)
      badge.textContent = input.checked ? "On" : "Off";
  });
};
var escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
})[char] ?? char);
var pathLines = (value) => value.split(\`
\`).map((line) => line.trim()).filter(Boolean);
var formatPolicy = (policy) => \`\${JSON.stringify(policy, null, 2)}
\`;
var collectFormPolicy = () => ({
  version: 1,
  safety: {
    level: draftPolicy.safety.level,
    overrides: Object.fromEntries(Object.entries(draftPolicy.safety.overrides).filter(([, value]) => typeof value === "boolean"))
  },
  workflow: draftPolicy.workflow,
  destructive_command_protection: draftPolicy.destructive_command_protection,
  secret_protection: {
    enabled: draftPolicy.secret_protection.enabled,
    overrides: draftPolicy.secret_protection.overrides,
    deny_paths: draftPolicy.secret_protection.deny_paths,
    allow_paths: draftPolicy.secret_protection.allow_paths
  },
  audit: draftPolicy.audit
});
var effectivePreviewPolicy = (policy, baseline) => {
  if (!baseline)
    return policy;
  const union = (user, project) => [...new Set([...user, ...project])];
  return {
    ...policy,
    destructive_command_protection: {
      ...policy.destructive_command_protection,
      allow_paths: union(baseline.destructive_command_protection.allow_paths, policy.destructive_command_protection.allow_paths)
    },
    secret_protection: {
      ...policy.secret_protection,
      deny_paths: union(baseline.secret_protection.deny_paths, policy.secret_protection.deny_paths),
      allow_paths: union(baseline.secret_protection.allow_paths, policy.secret_protection.allow_paths)
    }
  };
};
var requestPolicyPreview = (policy = collectFormPolicy()) => requestJson("/api/policy/preview", {
  method: "POST",
  body: JSON.stringify(policy)
});
var policyScopeMode = () => projectDraft ? "project" : "user";
var projectFieldChip = (field, compact = false) => {
  if (policyScopeMode() !== "project")
    return "";
  if (!markedFields.has(field))
    return '<span class="project-chip inherited">Inherited</span>';
  return \`<button type="button" class="project-chip" data-unmark-field="\${escapeHtml(field)}" title="Set by project - click to inherit again" aria-label="Set by project: \${escapeHtml(field)}. Activate to inherit again.">\${compact ? "Project" : "Set by project"}</button>\`;
};
var projectFieldLine = (field) => {
  const chip = projectFieldChip(field);
  return chip ? \`<div class="project-field-line">\${chip}</div>\` : "";
};
var projectChipSlots = [
  ["destructive-enabled-chip", "destructive_command_protection.enabled"],
  ["secret-enabled-chip", "secret_protection.enabled"],
  ["allow-paths-chip", "destructive_command_protection.allow_paths"],
  ["deny-paths-chip", "secret_protection.deny_paths"],
  ["secret-allow-paths-chip", "secret_protection.allow_paths"]
];
var syncProjectChips = () => {
  projectChipSlots.forEach(([id, field]) => {
    qs(id).innerHTML = projectFieldChip(field);
  });
};
var markProjectField = (field) => {
  if (!projectDraft || markedFields.has(field))
    return;
  markedFields.add(field);
  renderSafety();
  syncProjectChips();
};
var rebuildProjectDisplay = () => {
  if (!projectDraft)
    return;
  draftPolicy = overlayProjectProposal(projectDraft.baseline, collectProjectProposal(markedFields, draftPolicy));
  renderPolicySections();
  refreshPolicyPreview();
};
var unmarkProjectField = (field) => {
  if (!projectDraft || !markedFields.has(field))
    return;
  markedFields.delete(field);
  rebuildProjectDisplay();
};
var viewNames = ["overview", "activity", "policy", "rules", "integrations", "settings"];
var viewTitles = {
  overview: "Overview",
  activity: "Activity",
  policy: "Policy",
  rules: "Rules",
  integrations: "Integrations",
  settings: "Settings"
};
var currentView = () => {
  const hash = location.hash.replace("#", "");
  return viewNames.includes(hash) ? hash : "overview";
};
var applyView = () => {
  const view = currentView();
  document.body.dataset.view = view;
  const hasSearch = view === "activity" || view === "policy";
  qs("topbar-title").textContent = viewTitles[view];
  qs("topbar-title").classList.toggle("sr-only", hasSearch);
  document.querySelectorAll(".topbar-search").forEach((el) => {
    el.hidden = el.dataset.searchView !== view;
  });
  qs("topbar").classList.toggle("has-search", hasSearch);
  document.title = \`\${viewTitles[view]} · CC Safety Net\`;
  document.querySelectorAll("[data-view]").forEach((section) => {
    section.hidden = section.dataset.view !== view;
  });
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === view)
      link.setAttribute("aria-current", "page");
    else
      link.removeAttribute("aria-current");
  });
  qs("dirty-chip").hidden = !dirty || view === "policy";
  if (view === "activity")
    applyFeedClamps(qs("activity-feed"));
  if (view === "rules" && !rulesRequested) {
    rulesRequested = true;
    loadRules();
  }
  if (view === "rules" && rulesData && pendingRuleFocus)
    renderRules();
};
var agentLabels = integrationDisplayNames;
var tierCountHtml = (segments) => {
  const parts = segments.filter(([count]) => count > 0).map(([count, label, tone]) => tone ? \`<span class="count-\${tone}">\${count} \${label}</span>\` : \`\${count} \${label}\`);
  return parts.length > 0 ? parts.join(" · ") : "0 on";
};
var feedItemHtml = (entry, index) => {
  const deny = entry.decision !== "allow";
  const badgeClass = entry.failureStage ? "error" : deny ? "deny" : "allow";
  const badgeLabel = entry.failureStage ? "Error" : deny ? "Blocked" : "Allowed";
  return \`<article class="feed-item">
    <div class="feed-meta">
      <span class="decision-badge \${badgeClass}">\${badgeLabel}</span>
      \${entry.agent && entry.agent !== "unknown" ? \`<span class="agent-badge">\${escapeHtml(agentLabels[entry.agent] ?? entry.agent)}</span>\` : ""}
      \${entry.ruleId ? knownRuleIds.has(entry.ruleId) ? \`<button type="button" class="rule-id" data-jump-rule="\${escapeHtml(entry.ruleId)}" title="Show this rule in Policy">\${escapeHtml(entry.ruleId)}</button>\` : \`<code class="rule-id">\${escapeHtml(entry.ruleId)}</code>\` : ""}
      <time datetime="\${escapeHtml(entry.ts)}" title="\${escapeHtml(entry.ts)}">\${formatRelativeTime(entry.ts)}</time>
      <button type="button" class="icon-button feed-copy" data-log-copy="\${index}" aria-label="Copy log entry as JSON">\${rawCopyIcons.copy}</button>
      \${deny ? \`<button type="button" class="icon-button feed-report" data-report-fp="\${index}" aria-label="Report false positive" title="Report false positive">\${reportIcon}</button>\` : \`<button type="button" class="feed-toggle feed-block" data-block-future="\${index}">Block this in future</button>\`}
    </div>
    <code class="feed-command">\${escapeHtml(entry.segment || entry.command || "(no command recorded)")}</code>
    \${entry.reason && entry.reason !== "allowed" ? \`<p class="feed-reason muted">\${escapeHtml(entry.reason)}</p>\` : ""}
  </article>\`;
};
var applyFeedClamps = (root) => {
  const overflowing = [...root.querySelectorAll(".feed-command")].filter((command) => !command.classList.contains("clamped") && command.scrollHeight > command.clientHeight + 1);
  overflowing.forEach((command) => {
    command.classList.add("clamped");
    command.insertAdjacentHTML("afterend", '<button type="button" class="feed-toggle" data-feed-toggle aria-expanded="false">Show more</button>');
  });
};
var dayLabel = (ts) => {
  const date = new Date(ts);
  if (date.toDateString() === new Date().toDateString())
    return "Today";
  if (date.toDateString() === new Date(Date.now() - 86400000).toDateString())
    return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
var renderOverviewActivity = () => {
  if (!overview)
    return;
  const tile = (value, label, extra) => \`<div class="tile"><strong>\${escapeHtml(value.toLocaleString("en-US"))}</strong><span>\${escapeHtml(label)}</span>\${extra}</div>\`;
  const dayAgoLabel = (daysAgo) => daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : \`\${daysAgo} days ago\`;
  const sparkline = (byDay, noun) => {
    const max = Math.max(...byDay, 1);
    return \`<div class="tile-spark" role="group" aria-label="Commands \${noun} per day, most recent \${dayCount(byDay.length)}">\${byDay.map((count, index) => {
      const label = \`\${dayAgoLabel(byDay.length - 1 - index)}: \${count.toLocaleString("en-US")} \${noun}\`;
      return \`<div class="spark-col" role="img" tabindex="0" data-count="\${count.toLocaleString("en-US")}" aria-label="\${escapeHtml(label)}"><div class="spark-bar\${count === 0 ? " spark-zero" : ""}" aria-hidden="true" style="height:\${count === 0 ? 2 : Math.max(2, Math.round(count / max * 40))}px"></div></div>\`;
    }).join("")}</div>\`;
  };
  qs("overview-window").textContent = \`Last \${dayCount(overview.days)}\`;
  qs("overview-tiles").innerHTML = [
    tile(overview.counts.blocked, "Blocked", sparkline(overview.counts.blockedByDay, "blocked")),
    tile(overview.totalInWindow, "Analyzed", sparkline(overview.counts.analyzedByDay, "analyzed"))
  ].join("");
};
var retentionDays = () => state?.policy?.audit?.retention_days ?? DEFAULT_AUDIT_RETENTION_DAYS;
var overviewDays = () => Math.min(OVERVIEW_DAYS, retentionDays());
var renderRetention = (loaded) => {
  qs("retention-days").value = String(loaded.policy.audit.retention_days);
  qs("retention-unit").textContent = loaded.policy.audit.retention_days === 1 ? "day" : "days";
  qs("retention-note").textContent = "Saved on change. Lowering this deletes anything already older than the new window; the Activity tab can only look back as far as it.";
};
var activityWindowOptions = () => {
  const retained = retentionDays();
  const windows = [7, 30, 90, 180, 365].filter((days) => days < retained);
  return [...windows, retained];
};
var configStateNotice = () => {
  const configState = state?.configState;
  if (!configState || configState.state === "ready")
    return null;
  return \`A fallback configuration is being enforced: \${configState.reason}\`;
};
var setProtectionBanner = (notices) => {
  const text = notices.filter(Boolean).join(" ");
  qs("protection-banner").textContent = text;
  qs("protection-banner").hidden = text === "";
};
var renderProtectionCard = () => {
  const configNotice = configStateNotice();
  if (!state?.preview) {
    qs("protection-card").hidden = true;
    setProtectionBanner([configNotice]);
    return;
  }
  const policy = state.policy;
  const customized = state.preview.counts.effectiveCustomizations > 0 || Object.entries(policy.safety.overrides).some(([key, value]) => value !== SAFETY_LEVEL_CAPABILITIES[policy.safety.level][key]);
  const commandsOn = policy.destructive_command_protection.enabled;
  const secretsOn = policy.secret_protection.enabled;
  const off = [
    commandsOn ? null : "Destructive command protection is off — configurable destructive command rules are not being enforced (catastrophic and custom rules remain active)",
    secretsOn ? null : "Secret protection is off — sensitive paths and deny paths are not being blocked"
  ].filter(Boolean);
  setProtectionBanner([
    off.length > 0 ? \`\${off.join(". ")}. Re-enable \${off.length > 1 ? "them" : "it"} in Policy.\` : null,
    configNotice
  ]);
  qs("protection-card").hidden = false;
  qs("protection-card").classList.toggle("protection-warning", !commandsOn || !secretsOn);
  qs("protection-card").innerHTML = \`<div class="panel-head"><div class="panel-title"><h2>Protection status</h2></div><a class="panel-head-action view-all-link" href="#policy">Configure</a></div>\` + \`<p>\${escapeHtml(safetyLevels[policy.safety.level][0])}\${customized ? " · Customized" : ""}</p>\` + \`<p\${commandsOn ? "" : ' class="state-disabled"'}>\${commandsOn ? \`\${state.preview.counts.enabled} rules active\` : "Destructive command protection is OFF"}</p>\` + \`<p\${secretsOn ? "" : ' class="state-disabled"'}>\${secretsOn ? "Secret protection on" : "Secret protection is OFF"}</p>\`;
};
var renderTopList = (containerId, counts, className, dataAttr) => {
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  qs(containerId).innerHTML = top.length === 0 ? '<p class="empty">No blocked commands in this window.</p>' : top.map(([key, count]) => \`<button type="button" class="\${className}" \${dataAttr}="\${escapeHtml(key)}"><code class="rule-id">\${escapeHtml(key)}</code><span class="chip-count">\${count.toLocaleString("en-US")}</span></button>\`).join("");
};
var renderTopLists = () => {
  if (!overview)
    return;
  renderTopList("top-commands", overview.counts.commands, "top-command", "data-command");
  renderTopList("top-rules", overview.counts.rules, "top-rule", "data-rule-id");
};
var clearCommandFilter = () => {
  if (!activityFilters.command)
    return false;
  activityFilters.command = "";
  return true;
};
var jumpToActivityRule = (ruleId) => {
  activityFilters.command = "";
  activityFilters.query = ruleId.toLowerCase();
  qs("activity-search").value = ruleId;
  if (activity) {
    renderActivityControls();
    renderActivityFeed();
  }
  location.hash = "activity";
};
var renderGuardErrors = () => {
  if (!overview)
    return;
  qs("guard-errors").hidden = overview.counts.errors === 0;
  if (overview.counts.errors === 0)
    return;
  qs("guard-errors").textContent = \`\${overview.counts.errors.toLocaleString("en-US")} guard error\${overview.counts.errors === 1 ? "" : "s"} in the last \${dayCount(overview.days)} — commands blocked because evaluation failed, not by policy. Click to view.\`;
};
var renderActivityControls = () => {
  if (!activity)
    return;
  const agentCounts = activity.counts.agents;
  const chipHtml = (kind, value, label, count) => \`<button type="button" class="chip" data-activity-chip="\${kind}" data-chip-value="\${escapeHtml(value)}" aria-pressed="\${activityFilters[kind] === value}">\${escapeHtml(label)}\${count === undefined ? "" : \` <span class="chip-count">\${count.toLocaleString("en-US")}</span>\`}</button>\`;
  qs("activity-decision").innerHTML = [
    chipHtml("decision", "all", "All", activity.totalInWindow),
    chipHtml("decision", "deny", "Blocked", activity.counts.blocked),
    chipHtml("decision", "allow", "Allowed", activity.counts.allowed),
    ...activity.counts.errors > 0 ? [chipHtml("decision", "error", "Errors", activity.counts.errors)] : [],
    ...suspects.size > 0 ? [chipHtml("decision", "suspect", "Likely false positive", suspects.size)] : []
  ].join("");
  const agentNames = Object.keys(agentCounts).filter((name) => name !== "unknown").sort();
  qs("activity-agents").innerHTML = agentNames.length < 2 ? "" : [
    chipHtml("agent", "all", "All agents"),
    ...agentNames.map((name) => chipHtml("agent", name, agentLabels[name] ?? name, agentCounts[name]))
  ].join("");
  qs("activity-command-filter").innerHTML = activityFilters.command ? \`<button type="button" class="filter-pill" data-clear-command aria-label="Clear command filter">Command: <code>\${escapeHtml(activityFilters.command)}</code><span class="filter-pill-x" aria-hidden="true">✕</span></button>\` : "";
  qs("activity-days").innerHTML = activityWindowOptions().map((days) => \`<option value="\${days}">Last \${dayCount(days)}</option>\`).join("");
  qs("activity-days").value = String(activity.days);
};
var renderActivityFeed = () => {
  if (!activity)
    return;
  const matchesFilters = (entry) => {
    if (activityFilters.decision === "deny" && entry.decision === "allow")
      return false;
    if (activityFilters.decision === "allow" && entry.decision !== "allow")
      return false;
    if (activityFilters.decision === "error" && !entry.failureStage)
      return false;
    if (activityFilters.decision === "suspect" && !suspects.has(entry))
      return false;
    if (activityFilters.agent !== "all" && (entry.agent || "unknown") !== activityFilters.agent)
      return false;
    if (activityFilters.command) {
      if (entry.decision === "allow")
        return false;
      return commandSignature(entry.segment || entry.command) === activityFilters.command;
    }
    if (!activityFilters.query)
      return true;
    return [entry.ruleId, entry.segment || entry.command].filter(Boolean).join(" ").toLowerCase().includes(activityFilters.query);
  };
  const entries = activity.entries.filter(matchesFilters);
  renderedFeedEntries = entries;
  qs("activity-feed").innerHTML = entries.length === 0 ? '<p class="empty">No audit log entries match.</p>' : \`<div class="feed-list">\${entries.map((entry, index) => {
    const label = dayLabel(entry.ts);
    const previous = entries[index - 1];
    const separator = previous && label === dayLabel(previous.ts) ? "" : \`<div class="feed-day-sep">\${escapeHtml(label)}</div>\`;
    return separator + feedItemHtml(entry, index);
  }).join("")}</div>\`;
  applyFeedClamps(qs("activity-feed"));
  qs("activity-count").textContent = \`Showing \${entries.length.toLocaleString("en-US")} of \${activity.totalInWindow.toLocaleString("en-US")} entries from the last \${dayCount(activity.days)}\${activity.truncated ? " (capped at 500, newest of each decision)" : ""}.\${activity.unreadable > 0 ? \` \${activity.unreadable.toLocaleString("en-US")} audit log source\${activity.unreadable === 1 ? "" : "s"} could not be read, so this list is incomplete.\` : ""}\`;
};
var loadOverview = async () => {
  const result = await requestJson(\`/api/activity?days=\${overviewDays()}\`);
  if (!result.ok || !result.data) {
    const message = \`<p class="empty">Could not load activity: \${escapeHtml(errorText(result))}</p>\`;
    qs("overview-window").textContent = "";
    qs("overview-tiles").innerHTML = "";
    qs("top-rules").innerHTML = message;
    qs("guard-errors").hidden = true;
    return;
  }
  const feed = result.data;
  overview = feed;
  qs("logs-path").textContent = overview.logsDir ?? "Not available";
  renderOverviewActivity();
  renderTopLists();
  renderGuardErrors();
};
var loadActivity = async () => {
  const result = await requestJson(\`/api/activity?days=\${activityFilters.days}\`);
  if (!result.ok || !result.data) {
    const message = \`<p class="empty">Could not load activity: \${escapeHtml(errorText(result))}</p>\`;
    qs("activity-feed").innerHTML = message;
    qs("activity-count").textContent = "";
    return;
  }
  const feed = result.data;
  activity = feed;
  suspects = findSuspectEntries(activity.entries);
  if (activityFilters.agent !== "all" && !(activityFilters.agent in activity.counts.agents)) {
    activityFilters.agent = "all";
  }
  if (activityFilters.decision === "error" && activity.counts.errors === 0) {
    activityFilters.decision = "all";
  }
  if (activityFilters.decision === "suspect" && suspects.size === 0) {
    activityFilters.decision = "all";
  }
  renderActivityControls();
  renderActivityFeed();
};
var runRefresh = async (buttonId, reload) => {
  const button = qs(buttonId);
  if (button.disabled)
    return;
  button.disabled = true;
  button.classList.add("spinning");
  try {
    await Promise.all([reload(), new Promise((resolve) => setTimeout(resolve, 600))]);
  } finally {
    button.classList.remove("spinning");
    button.disabled = false;
  }
};
var refreshActivity = () => runRefresh("activity-refresh", () => Promise.all([loadOverview(), loadActivity()]));
var renderIntegrations = () => {
  const loaded = integrations;
  if (!loaded)
    return;
  qs("integrations-list").innerHTML = loaded.targets.map((row) => {
    const busy = integrationBusy.has(row.target);
    const version = row.version === null ? '<span class="muted">not detected</span>' : \`<span class="agent-badge">v\${escapeHtml(row.version)}</span>\`;
    const status = row.status === "active" ? '<span class="state-active">Installed</span>' : row.status === "disabled" ? '<span class="state-disabled">Disabled</span>' : row.status === "not-inspected" ? \`<span class="muted" title="This runtime's state file could not be read, so its status is unknown.">Not inspected</span>\` : '<span class="muted">Not installed</span>';
    const uninstall = row.status === "active";
    const busyLabel = uninstall ? "Uninstalling…" : "Installing…";
    const action = row.version === null ? "" : \`<button type="button" class="\${uninstall ? "danger" : "primary"}" data-integration-action="\${uninstall ? "uninstall" : "install"}" data-integration-target="\${escapeHtml(row.target)}"\${busy ? " disabled" : ""}>\${busy ? busyLabel : uninstall ? "Uninstall" : row.status === "disabled" ? "Enable" : "Install"}</button>\`;
    const note = row.note ? \`<div class="status \${row.note.kind}">\${escapeHtml(row.note.text)}</div>\` : "";
    return \`<div class="integration-row">
        <span class="integration-info"><strong>\${escapeHtml(row.label)}</strong> \${version} \${status}</span>
        \${action}
        \${note}
      </div>\`;
  }).join("");
};
var renderHealthStrip = (health) => {
  const loaded = integrations;
  if (!loaded || !health.ok)
    return;
  const detected = loaded.targets.filter((row) => row.status === "active" || row.status === "disabled");
  const active = detected.filter((row) => row.status === "active");
  const inactive = detected.filter((row) => row.status === "disabled");
  const attention = inactive.length > 0 || active.length === 0;
  const parts = [];
  const labelHtml = (row) => \`<strong>\${escapeHtml(row.label)}</strong>\`;
  if (active.length)
    parts.push(\`Hook active in \${active.map(labelHtml).join(", ")}\`);
  if (inactive.length)
    parts.push(\`\${inactive.map(labelHtml).join(", ")} detected without an active hook\`);
  if (!parts.length)
    parts.push("No agent hooks detected");
  if (health.data?.update?.updateAvailable)
    parts.push(\`v\${escapeHtml(health.data.update.latestVersion)} available\`);
  const link = attention ? ' <a class="view-all-link" href="#integrations">Fix in Integrations</a>' : "";
  const el = qs("health-strip");
  el.className = attention ? "status health-strip error" : "status health-strip ok";
  el.innerHTML = parts.join(" · ") + link;
  el.hidden = false;
};
var loadIntegrations = async () => {
  const result = await requestJson("/api/integrations");
  if (!result.ok || !Array.isArray(result.data?.targets)) {
    qs("integrations-list").innerHTML = \`<p class="empty">Could not load integrations: \${escapeHtml(errorText(result))}</p>\`;
    return;
  }
  integrations = result.data;
  renderIntegrations();
  qs("integrations-pkg-version").textContent = result.data.system.version;
  qs("integrations-node-version").textContent = result.data.system.nodeVersion ?? "unknown";
  qs("integrations-platform").textContent = result.data.system.platform;
  qs("integrations-system").hidden = false;
};
var refreshIntegrations = () => runRefresh("integrations-refresh", loadIntegrations);
var renderRules = () => {
  const loaded = rulesData;
  if (!loaded)
    return;
  if (!qs("rules-project-path").value)
    qs("rules-project-path").value = loaded.projectPath;
  const canPick = loaded.canPickDirectory && !directoryPickerFailed;
  qs("rules-project-path").readOnly = canPick;
  qs("rules-choose-directory").hidden = !canPick;
  qs("rules-list").innerHTML = loaded.rulebooks.length === 0 ? loaded.errors.length > 0 ? '<p class="empty">Every configured rulebook was dropped, so no custom rule is enforced. See Diagnostics below.</p>' : '<p class="empty">No custom rulebooks. Run <code>npx -y cc-safety-net rule init</code> to create one, or see the <a href="https://ccsafetynet.com/docs" target="_blank" rel="noopener">documentation</a>.</p>' : loaded.rulebooks.map((rulebook) => \`<div class="rulebook-card">
    <div class="rulebook-head">
      <strong>\${escapeHtml(rulebook.name)}</strong>
      <span class="agent-badge">v\${escapeHtml(rulebook.version)}</span>
      \${rulebook.spec === rulebook.name ? "" : \`<code>\${escapeHtml(rulebook.spec)}</code>\`}
      <span>\${rulebook.source === "user" ? "All projects" : "This project"}</span>
      <span>\${rulebook.rules.length} rule\${rulebook.rules.length === 1 ? "" : "s"}</span>
    </div>
    \${rulebook.rules.map((rule) => \`<div class="rulebook-rule\${pendingRuleFocus === rule.name ? " rules-focus" : ""}">
      <code class="rule-id">custom.\${escapeHtml(rule.name)}</code>
      <code>\${escapeHtml([rule.command, rule.subcommand].filter(Boolean).join(" "))}</code>
      <p>Blocked arguments (any one matches): \${rule.block_args.map((arg) => \`<code>\${escapeHtml(arg)}</code>\`).join(" ")}</p>
      <p>\${escapeHtml(rule.reason)}</p>
    </div>\`).join("")}
  </div>\`).join("");
  const diagnostics = [
    ...loaded.errors.map((text) => \`<div class="status error">\${escapeHtml(text)}</div>\`),
    ...loaded.warnings.map((text) => \`<div class="status">\${escapeHtml(text)}</div>\`)
  ];
  qs("rules-diagnostics").innerHTML = diagnostics.join("");
  qs("rules-diagnostics-panel").hidden = diagnostics.length === 0;
  if (!pendingRuleFocus)
    return;
  const focused = qs("rules-list").querySelector(".rules-focus");
  if (focused)
    focused.scrollIntoView({ block: "center" });
  if (!focused)
    setAppStatus(\`custom.\${pendingRuleFocus} is not in any rulebook\`, "error");
  pendingRuleFocus = null;
};
var loadRules = async () => {
  const result = await requestJson("/api/rules");
  if (!result.ok || !Array.isArray(result.data?.rulebooks)) {
    qs("rules-list").innerHTML = \`<p class="empty">Could not load rules: \${escapeHtml(errorText(result))}</p>\`;
    rulesData = null;
    qs("rules-diagnostics-panel").hidden = true;
    rulesRequested = false;
    return;
  }
  rulesData = result.data;
  renderRules();
};
var refreshRules = () => runRefresh("rules-refresh", () => {
  rulesRequested = true;
  return loadRules();
});
var jumpToRulesRule = (ruleId) => {
  pendingRuleFocus = ruleId.replace(/^custom\\./, "");
  location.hash = "rules";
};
var openRuleComposer = (command) => {
  qs("rules-composer-input").value = command;
  location.hash = "rules";
};
var setRulesScope = (scope) => {
  rulesScope = scope;
  document.querySelectorAll("[data-rules-scope]").forEach((chip) => {
    chip.setAttribute("aria-pressed", String(chip.dataset.rulesScope === scope));
  });
  qs("rules-project-path-field").hidden = scope !== "project";
};
var chooseProjectDirectory = async () => {
  const button = qs("rules-choose-directory");
  if (button.disabled)
    return;
  button.disabled = true;
  const result = await requestJson("/api/rules/choose-directory", { method: "POST" });
  button.disabled = false;
  if (result.ok && result.data.path) {
    qs("rules-project-path").value = result.data.path;
    return;
  }
  if (result.ok && result.data.cancelled)
    return;
  directoryPickerFailed = true;
  qs("rules-project-path").readOnly = false;
  button.hidden = true;
  setAppStatus(\`\${result.ok ? result.data.error : errorText(result)} - type the project path instead\`, "error");
};
var copyRulePrompt = async () => {
  if (!rulesData) {
    setAppStatus("Rules have not loaded yet - refresh the Rulebooks panel", "error");
    return;
  }
  if (!qs("rules-composer-input").value.trim()) {
    setAppStatus("Describe what you want first", "error");
    return;
  }
  if (rulesScope === "project" && !qs("rules-project-path").value.trim()) {
    setAppStatus("Enter the project path the rule belongs to", "error");
    return;
  }
  qs("rules-copy-prompt").disabled = true;
  try {
    await navigator.clipboard.writeText(rulePromptText({
      rulesData,
      rulesScope,
      projectPath: qs("rules-project-path").value,
      request: qs("rules-composer-input").value
    }));
    qs("rules-composer-input").value = "";
    setAppStatus("Prompt copied - paste it into your coding CLI", "ok");
  } catch {
    setAppStatus("Copy failed", "error");
  } finally {
    qs("rules-copy-prompt").disabled = false;
  }
};
var runIntegrationAction = async (button) => {
  const target = button.dataset.integrationTarget;
  if (!target || integrationBusy.has(target))
    return;
  integrationBusy.add(target);
  const action = button.dataset.integrationAction;
  renderIntegrations();
  const result = await requestJson(\`/api/\${action}\`, {
    method: "POST",
    body: JSON.stringify({ target })
  });
  integrationBusy.delete(target);
  const row = integrations?.targets.find((entry) => entry.target === target);
  if (!row)
    return;
  const ok = result.ok && result.data.ok === true;
  if (ok)
    row.status = action === "install" ? "active" : "not-installed";
  row.note = {
    kind: ok ? "ok" : "error",
    text: ok ? result.data.output : result.data?.output || errorText(result)
  };
  if (!ok)
    setAppStatus(action === "install" ? "Install failed" : "Uninstall failed", "error");
  renderIntegrations();
};
var confirmDialog = (() => {
  const dialog = qs("confirm-dialog");
  const confirm = qs("confirm-dialog-confirm");
  const cancel = qs("confirm-dialog-cancel");
  let resolvePending = null;
  dialog.addEventListener("close", () => {
    if (!resolvePending)
      return;
    resolvePending(dialog.returnValue === "confirm");
    resolvePending = null;
  });
  dialog.addEventListener("cancel", () => {
    dialog.returnValue = "cancel";
  });
  return (options) => new Promise((resolve) => {
    if (resolvePending) {
      resolve(false);
      return;
    }
    qs("confirm-dialog-title").textContent = options.title;
    qs("confirm-dialog-body").textContent = options.body;
    qs("confirm-dialog-detail").textContent = options.detail ?? "";
    const detailRow = qs("confirm-dialog-detail").parentElement;
    if (detailRow)
      detailRow.hidden = !options.detail;
    qs("confirm-dialog-rows").innerHTML = options.rowsHtml ?? "";
    qs("confirm-dialog-rows").hidden = !options.rowsHtml;
    confirm.textContent = options.confirmLabel;
    confirm.className = options.confirmClass ?? "danger";
    dialog.returnValue = "cancel";
    resolvePending = resolve;
    dialog.showModal();
    cancel.focus();
  });
})();
var confirmProtectionDisable = (options) => confirmDialog({
  title: options.title,
  body: options.body,
  detail: options.detail,
  confirmLabel: "Disable protection"
});
var togglePanel = (button) => {
  const controls = button.getAttribute("aria-controls");
  if (!controls)
    return;
  const expanded = button.getAttribute("aria-expanded") !== "true";
  button.setAttribute("aria-expanded", String(expanded));
  qs(controls).hidden = !expanded;
};
var syncSearchState = () => {
  const active = qs("policy-search").value.trim().length > 0;
  if (active === searchActive)
    return;
  searchActive = active;
  if (active)
    return;
  searchCollapsedTiers.clear();
  searchCollapsedSecretGroups.clear();
};
var updateRawSource = () => {
  if (projectDraft) {
    qs("raw-source").textContent = \`Only the fields marked for this project. Writes to \${projectDraft.path}.\`;
    return;
  }
  qs("raw-source").textContent = state?.errors.length ? "Read-only original policy JSON. Repair preserves valid settings and writes canonical JSON." : "Read-only mirror of the controls.";
};
var setRawCopyCopied = (copied) => {
  qs("raw-copy").innerHTML = copied ? rawCopyIcons.check : rawCopyIcons.copy;
  qs("raw-copy").classList.toggle("copied", copied);
  qs("raw-copy").setAttribute("aria-label", copied ? "Copied raw JSON" : "Copy raw JSON to clipboard");
};
var resetFeedCopy = () => {
  document.querySelectorAll(".feed-copy.copied").forEach((button) => {
    button.classList.remove("copied");
    button.innerHTML = rawCopyIcons.copy;
    button.setAttribute("aria-label", "Copy log entry as JSON");
  });
};
var openReportDialog = (button) => {
  const entry = renderedFeedEntries[Number(button.dataset.reportFp)];
  if (!entry)
    return;
  const scrub = (text) => scrubReportPaths(text, entry.cwd, activity?.homeDir);
  qs("report-command").value = scrub(entry.command || entry.segment || "");
  qs("report-entry").value = JSON.stringify(entry, (_key, value) => typeof value === "string" ? scrub(value) : value, 2);
  qs("report-dialog").returnValue = "cancel";
  qs("report-dialog").showModal();
};
var openFalsePositiveForm = async () => {
  const fields = {
    command: qs("report-command").value,
    entry: qs("report-entry").value
  };
  const request = buildReportRequest(fields);
  const copying = request.dropped.length ? navigator.clipboard.writeText(request.dropped.map((field) => \`### \${field}
\${fields[field]}\`).join(\`

\`)) : null;
  window.open(request.url, "_blank", "noopener");
  if (!copying)
    return;
  const names = request.dropped.join(" and ");
  setAppStatus(await copying.then(() => true).catch(() => false) ? \`Report too long to prefill — \${names} copied to your clipboard. Paste into the form on GitHub.\` : \`Report too long to prefill — \${names} left out. Copy the entry from the feed and paste it into the form on GitHub.\`, "error");
};
qs("report-dialog").addEventListener("close", () => {
  if (qs("report-dialog").returnValue === "report")
    openFalsePositiveForm();
});
var copyFeedEntry = async (button) => {
  const entry = renderedFeedEntries[Number(button.dataset.logCopy)];
  if (!entry)
    return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
    if (feedCopyResetTimer)
      clearTimeout(feedCopyResetTimer);
    resetFeedCopy();
    button.classList.add("copied");
    button.innerHTML = rawCopyIcons.check;
    button.setAttribute("aria-label", "Copied log entry");
    feedCopyResetTimer = setTimeout(resetFeedCopy, 2000);
  } catch {
    setAppStatus("Copy failed", "error");
  }
};
var copyRawToClipboard = async () => {
  qs("raw-copy").disabled = true;
  try {
    await navigator.clipboard.writeText(qs("raw").value);
    setRawCopyCopied(true);
    if (rawCopyResetTimer)
      clearTimeout(rawCopyResetTimer);
    rawCopyResetTimer = setTimeout(() => setRawCopyCopied(false), 2000);
  } catch (error) {
    setAppStatus("Copy failed", "error");
    setDetailStatus(\`Error: Could not copy Raw JSON: \${error instanceof Error ? error.message : String(error)}\`, "error");
  } finally {
    qs("raw-copy").disabled = false;
  }
};
var formatStarCount = (count) => {
  if (typeof count !== "number")
    return "";
  if (count >= 1000)
    return \`\${(count / 1000).toFixed(1).replace(/\\.0$/, "")}k\`;
  return String(count);
};
var starCountHtml = (count) => {
  const formatted = formatStarCount(count);
  return formatted ? \`<span class="star-count">\${escapeHtml(formatted)}</span>\` : "";
};
var hideStarCta = () => {
  qs("star-row").hidden = true;
  qs("star-slot").innerHTML = "";
};
var renderStarPitch = (context, starred = false) => {
  const evidence = context.blockedTotal > 0 ? \`CC Safety Net has blocked <strong>\${escapeHtml(context.blockedTotal.toLocaleString("en-US"))}</strong> risky command\${context.blockedTotal === 1 ? "" : "s"} on this machine in its retained \${escapeHtml(dayCount(retentionDays()))} history.\` : "";
  if (starred) {
    qs("star-pitch-text").innerHTML = evidence;
    return;
  }
  qs("star-pitch-text").innerHTML = evidence ? \`\${evidence} If it saved your work, star it on GitHub.\` : "If CC Safety Net is useful to you, star it on GitHub.";
};
var renderStarLink = (context, href = fallbackRepoUrl) => {
  qs("star-slot").innerHTML = \`<a class="star-cta" href="\${escapeHtml(href)}" target="_blank" rel="noopener" aria-label="Star CC Safety Net on GitHub (opens github.com)">
      <span class="star-icon" aria-hidden="true">\${starIcons.outline}</span>
      <span class="star-label">Star on GitHub</span>
      \${starCountHtml(context.starCount)}
    </a>\`;
  qs("star-row").hidden = false;
};
var renderStarCta = (context) => {
  activeStarContext = context;
  if (context.starred === true) {
    hideStarCta();
    return;
  }
  renderStarPitch(context);
  qs("star-mechanism").hidden = context.starred !== false;
  if (context.starred === null) {
    renderStarLink(context);
    return;
  }
  qs("star-slot").innerHTML = \`<button type="button" class="star-cta" aria-label="Star CC Safety Net on GitHub. One click via your GitHub CLI.">
      <span class="star-icon" aria-hidden="true">\${starIcons.outline}</span>
      <span class="star-label">Star on GitHub</span>
      \${starCountHtml(context.starCount)}
    </button>\`;
  qs("star-row").hidden = false;
};
var starRepo = async (button) => {
  button.disabled = true;
  const result = await requestJson("/api/star", { method: "POST" });
  if (result.ok && result.data?.ok === true) {
    const icon = button.querySelector(".star-icon");
    const label = button.querySelector(".star-label");
    if (icon)
      icon.innerHTML = starIcons.filled;
    if (label)
      label.textContent = "Starred. Thank you.";
    button.setAttribute("aria-label", "CC Safety Net starred on GitHub");
    button.classList.add("starred");
    qs("star-mechanism").hidden = true;
    renderStarPitch(activeStarContext, true);
    setAppStatus("Starred on GitHub", "ok");
    setDetailStatus("");
    return;
  }
  qs("star-mechanism").hidden = true;
  renderStarLink(activeStarContext, result.data?.fallbackUrl ?? fallbackRepoUrl);
};
var loadStarContext = async () => {
  const result = await requestJson("/api/star/context");
  renderStarCta(result.ok && result.data ? result.data : { starred: null, starCount: null, blockedTotal: 0 });
};
var syncRawFromForm = () => {
  if (state?.errors.length)
    return;
  qs("raw").value = formatPolicy(projectDraft ? collectProjectProposal(markedFields, draftPolicy) : collectFormPolicy());
  updateRawSource();
};
var updateDirtyStatus = () => {
  if (!state || state.errors.length)
    return;
  if (projectDraft) {
    dirty = JSON.stringify(collectProjectProposal(markedFields, draftPolicy)) !== projectDraft.snapshot;
    qs("policy-savebar").hidden = !dirty;
    qs("dirty-chip").hidden = !dirty || currentView() === "policy";
    setDetailStatus("");
    updateActions();
    return;
  }
  const draftJson = JSON.stringify(collectFormPolicy());
  dirty = draftJson !== JSON.stringify(state.policy);
  qs("policy-savebar").hidden = !dirty;
  qs("dirty-chip").hidden = !dirty || currentView() === "policy";
  if (dirty)
    sessionStorage.setItem("cc-safety-net-draft", draftJson);
  if (!dirty)
    sessionStorage.removeItem("cc-safety-net-draft");
  setDetailStatus("");
  updateActions();
};
var createPathList = (prefix, config) => {
  const setHint = (text) => {
    qs(\`\${prefix}-hint\`).textContent = text;
    qs(\`\${prefix}-hint\`).hidden = !text;
  };
  const render = () => {
    const paths = config.getPaths();
    const disabled = config.isDisabled();
    qs(\`\${prefix}-count\`).textContent = \`\${paths.length} path\${paths.length === 1 ? "" : "s"}\`;
    qs(\`\${prefix}-input\`).disabled = disabled;
    qs(\`\${prefix}-add-button\`).disabled = disabled;
    qs(\`\${prefix}-list\`).innerHTML = paths.length === 0 ? \`<li class="empty">No \${config.itemLabel}s configured.</li>\` : paths.map((path, index) => \`<li class="path-item \${disabled ? "row-disabled" : ""}">
          <code>\${escapeHtml(path)}</code>
          <button type="button" class="icon-button" data-path-list="\${prefix}" data-path-remove="\${index}" \${disabled ? "disabled" : ""} aria-label="Remove \${config.itemLabel} \${escapeHtml(path)}">\${pathListIcons.remove}</button>
        </li>\`).join("");
  };
  const claimForProject = () => {
    if (!projectDraft || markedFields.has(config.field))
      return;
    markedFields.add(config.field);
    config.setPaths([]);
    syncProjectChips();
  };
  let adding = false;
  const add = async (value) => {
    if (adding)
      return;
    const entries = [...new Set(pathLines(value))];
    if (entries.length === 0)
      return;
    const scope = projectDraft;
    const claimed = projectDraft !== null && !markedFields.has(config.field);
    const previousPaths = config.getPaths();
    claimForProject();
    const submitted = qs(\`\${prefix}-input\`).value;
    const additions = entries.filter((entry) => !config.getPaths().includes(entry));
    if (additions.length) {
      adding = true;
      try {
        const error = await config.validateAdditions([...config.getPaths(), ...additions]);
        if (projectDraft !== scope)
          return;
        if (error) {
          setHint(\`Not added: \${additions.join(", ")} — \${error}\`);
          if (claimed) {
            markedFields.delete(config.field);
            config.setPaths(previousPaths);
            syncProjectChips();
          }
          return;
        }
      } finally {
        adding = false;
      }
    }
    const current = config.getPaths();
    const duplicates = entries.filter((entry) => current.includes(entry));
    config.setPaths([...current, ...additions.filter((entry) => !current.includes(entry))]);
    if (qs(\`\${prefix}-input\`).value === submitted)
      qs(\`\${prefix}-input\`).value = "";
    setHint(duplicates.length ? \`Already listed: \${duplicates.join(", ")}\` : "");
    render();
    syncRawFromForm();
    updateDirtyStatus();
    qs(\`\${prefix}-input\`).focus();
  };
  const remove = (index) => {
    claimForProject();
    config.setPaths(config.getPaths().filter((_, position) => position !== index));
    setHint("");
    render();
    syncRawFromForm();
    updateDirtyStatus();
  };
  return { render, add, remove };
};
var validatePathAdditions = async (patch) => {
  const candidate = collectFormPolicy();
  patch(candidate);
  const result = await requestPolicyPreview(candidate);
  if (result.ok && result.data?.preview)
    return null;
  return errorText(result);
};
var pathLists = {
  "deny-paths": createPathList("deny-paths", {
    field: "secret_protection.deny_paths",
    getPaths: () => draftPolicy.secret_protection.deny_paths,
    setPaths: (paths) => {
      draftPolicy.secret_protection.deny_paths = paths;
    },
    isDisabled: () => !draftPolicy.secret_protection.enabled,
    itemLabel: "deny path",
    validateAdditions: (paths) => validatePathAdditions((candidate) => {
      candidate.secret_protection = { ...candidate.secret_protection, deny_paths: paths };
    })
  }),
  "secret-allow-paths": createPathList("secret-allow-paths", {
    field: "secret_protection.allow_paths",
    getPaths: () => draftPolicy.secret_protection.allow_paths,
    setPaths: (paths) => {
      draftPolicy.secret_protection.allow_paths = paths;
    },
    isDisabled: () => !draftPolicy.secret_protection.enabled,
    itemLabel: "allow path",
    validateAdditions: (paths) => validatePathAdditions((candidate) => {
      candidate.secret_protection = { ...candidate.secret_protection, allow_paths: paths };
    })
  }),
  "allow-paths": createPathList("allow-paths", {
    field: "destructive_command_protection.allow_paths",
    getPaths: () => draftPolicy.destructive_command_protection.allow_paths,
    setPaths: (paths) => {
      draftPolicy.destructive_command_protection.allow_paths = paths;
    },
    isDisabled: () => !draftPolicy.destructive_command_protection.enabled,
    itemLabel: "allow path",
    validateAdditions: (paths) => validatePathAdditions((candidate) => {
      candidate.destructive_command_protection = {
        ...candidate.destructive_command_protection,
        allow_paths: paths
      };
    })
  })
};
var pathListFor = (name) => name === "deny-paths" || name === "allow-paths" || name === "secret-allow-paths" ? pathLists[name] : null;
var secretRuleIsActive = (rule, overrides) => overrides[rule.id] ? overrides[rule.id] === "on" : !rule.defaultOff;
var markProjectOverride = (section, ruleId) => {
  if (!projectDraft)
    return;
  markedFields.add(\`\${section}.overrides.\${ruleId}\`);
};
var clearProjectOverrideMarks = (section) => {
  markedFields = new Set([...markedFields].filter((field) => !field.startsWith(\`\${section}.overrides.\`)));
};
var setSecretOverride = (rule, active) => {
  if (!projectDraft && active === !rule.defaultOff) {
    delete draftPolicy.secret_protection.overrides[rule.id];
    return;
  }
  draftPolicy.secret_protection.overrides[rule.id] = active ? "on" : "off";
  markProjectOverride("secret_protection", rule.id);
};
var setDestructiveOverride = (ruleId, active, inheritedEnabled) => {
  if (!projectDraft && active === inheritedEnabled) {
    delete draftPolicy.destructive_command_protection.overrides[ruleId];
    return;
  }
  draftPolicy.destructive_command_protection.overrides[ruleId] = active ? "on" : "off";
  markProjectOverride("destructive_command_protection", ruleId);
};
var groupRules = (rules) => rules.reduce((groups, rule) => {
  const group = groups.find((item) => item.category === rule.category);
  if (group) {
    group.rules.push(rule);
    return groups;
  }
  groups.push({ category: rule.category, rules: [rule] });
  return groups;
}, []);
var renderSecretPatterns = () => {
  if (!state)
    return;
  const loaded = state;
  const query = qs("policy-search").value.trim().toLowerCase();
  const rules = state.secretPatterns.filter((rule) => [rule.category, rule.label, rule.id, rule.description, ...rule.paths ?? []].join(" ").toLowerCase().includes(query));
  const overrides = draftPolicy.secret_protection.overrides;
  const disabled = !draftPolicy.secret_protection.enabled;
  const disabledCount = state.secretPatterns.filter((rule) => !secretRuleIsActive(rule, overrides)).length;
  qs("secret-summary").textContent = disabled ? "Protection disabled. Saved rule settings and deny paths are preserved." : \`\${state.secretPatterns.length - disabledCount} active, \${disabledCount} disabled\`;
  qs("secret-patterns").innerHTML = rules.length === 0 ? '<p class="empty">No secret protections match the search.</p>' : groupRules(rules).map((group) => {
    const expanded = secretGroupExpanded.get(group.category) || searchActive && !searchCollapsedSecretGroups.has(group.category);
    const contentId = \`secret-group-\${group.category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}\`;
    const allGroupRules = loaded.secretPatterns.filter((rule) => rule.category === group.category);
    const onCount = disabled ? 0 : allGroupRules.filter((rule) => secretRuleIsActive(rule, overrides)).length;
    return \`
      <section class="rule-tier">
        <div class="rule-tier-head">
          <button type="button" class="tier-collapse" data-secret-group-toggle="\${escapeHtml(group.category)}" aria-expanded="\${expanded}" aria-controls="\${contentId}">
            <span class="panel-chevron" aria-hidden="true"></span>
            <span class="tier-label"><strong>\${escapeHtml(group.category)}</strong></span>
            <span class="tier-counts">\${tierCountHtml([
      [onCount, "on"],
      [allGroupRules.length - onCount, "off", "off"]
    ])}</span>
          </button>
          <input type="checkbox" class="tier-switch" data-secret-group-active="\${escapeHtml(group.category)}" \${checkbox(allGroupRules.some((rule) => secretRuleIsActive(rule, overrides)))} \${disabled ? "disabled" : ""} aria-label="\${escapeHtml(\`All \${group.category} protections\`)}">
        </div>
        <div id="\${contentId}" class="tier-content" \${expanded ? "" : "hidden"}>
        <div class="grid">\${group.rules.map((rule) => {
      const active = secretRuleIsActive(rule, overrides);
      const ruleState = active && !disabled ? { label: "Active", className: "state-active" } : { label: "Disabled", className: "state-disabled" };
      const control = \`<input type="checkbox" data-secret-active="\${escapeHtml(rule.id)}" \${checkbox(active)} \${disabled ? "disabled" : ""}>
            <span>
              <strong>\${escapeHtml(rule.label)}</strong>
              <button type="button" class="rule-id" data-rule-activity="\${escapeHtml(rule.id)}" title="Show recent blocks in Activity">\${escapeHtml(rule.id)}</button>
              <small><span class="\${ruleState.className}">\${ruleState.label}</span> \${escapeHtml(rule.description ?? "")}</small>
            </span>\`;
      const chip = projectFieldChip(\`secret_protection.overrides.\${rule.id}\`, true);
      if (!rule.paths) {
        return \`<label class="row \${disabled ? "row-disabled" : ""}">\${control}\${chip}</label>\`;
      }
      return \`<div class="row rule-row \${disabled ? "row-disabled" : ""}">
            <label class="rule-control">\${control}</label>
            <button type="button" class="rule-example-button" data-secret-paths="\${escapeHtml(rule.id)}" aria-label="\${escapeHtml(\`Show protected paths for \${rule.label}\`)}" aria-haspopup="dialog" aria-controls="rule-example-popover">?</button>
            \${chip}
          </div>\`;
    }).join("")}</div>
        </div>
      </section>
    \`;
  }).join("");
};
var presetName = () => safetyLevels[draftPolicy.safety.level][0];
var renderPresetStatus = () => {
  if (!preview)
    return;
  const customized = preview.counts.effectiveCustomizations > 0 || Object.entries(draftPolicy.safety.overrides).some(([key, value]) => value !== SAFETY_LEVEL_CAPABILITIES[draftPolicy.safety.level][key]);
  qs("safety-preset-status").textContent = customized ? \`\${presetName()} · Customized\` : "";
  qs("safety-preset-status").classList.toggle("customized", customized);
};
var renderSafety = () => {
  const environmentSources = preview ? [
    ...new Set(Object.values(preview.capabilities).filter((capability) => capability.source === "environment").flatMap((capability) => capability.sources.filter((source) => source.startsWith("env "))))
  ] : [];
  qs("environment-overrides").hidden = environmentSources.length === 0;
  qs("environment-overrides").textContent = environmentSources.length ? \`Environment-raised protection: \${environmentSources.join(", ")}\` : "";
  qs("safety-level").innerHTML = projectFieldLine("safety.level") + Object.entries(safetyLevels).map(([level, meta]) => \`<label class="row preset-\${level}"><input type="radio" name="safety-level" value="\${level}" \${checkbox(draftPolicy.safety.level === level)}><span><strong>\${meta[0]}</strong><small>\${meta[1]}</small></span></label>\`).join("");
  const inherited = SAFETY_LEVEL_CAPABILITIES[draftPolicy.safety.level];
  qs("safety-overrides").innerHTML = Object.entries(safetyOverrides).map(([key, meta]) => {
    const value = draftPolicy.safety.overrides[key];
    const inheritedText = inherited[key] ? "on" : "off";
    return \`<label class="row safety-override-row"><span><strong>\${meta[0]}</strong><small>\${meta[1]}</small></span><select data-safety-override="\${key}">
      <option value="inherit" \${value === undefined ? "selected" : ""}>Inherit from preset (\${inheritedText})</option>
      <option value="true" \${value === true ? "selected" : ""}>Force on</option>
      <option value="false" \${value === false ? "selected" : ""}>Force off</option>
    </select>\${projectFieldChip(\`safety.overrides.\${key}\`, true)}</label>\`;
  }).join("");
  qs("workflow").innerHTML = \`<label class="row"><input type="checkbox" data-workflow-worktree \${checkbox(draftPolicy.workflow.worktree_mode)}><span><strong>Allow discarding local changes in linked git worktrees</strong><small>Only relaxes linked worktree discard checks.</small></span>\${projectFieldChip("workflow.worktree_mode")}</label>\`;
  renderPresetStatus();
};
var tierForRule = (rule) => {
  if (!rule.activationCapability)
    return "normal";
  return rule.activationCapability === "fail_closed" ? "strict" : "paranoid";
};
var tierMeta = {
  normal: ["Available in every preset", "No additional capability required"],
  strict: ["Strict tier", "Inherits from Fail closed"],
  paranoid: ["Paranoid tier", "Inherits from Paranoid rm or Paranoid interpreters"]
};
var ruleStateText = (rule, effective, capabilities) => {
  const capability = rule.activationCapability;
  if (effective.source === "master_disabled")
    return "Off — destructive-command protection disabled";
  if (effective.source === "rule_override")
    return \`\${effective.enabled ? "On" : "Off"} — user rule override\`;
  if (effective.source === "built_in_default")
    return "On — available in every preset";
  if (effective.source === "environment") {
    const sources = capability ? capabilities[capability]?.sources ?? [] : [];
    const source = [...sources].reverse().find((item) => item.startsWith("env "));
    return \`\${effective.enabled ? "On" : "Off"} — environment\${source ? \`; \${source.slice(4)}\` : ""}\`;
  }
  if (effective.source === "capability_override" && capability) {
    return \`\${effective.enabled ? "On" : "Off"} — capability override; \${safetyOverrides[capability][0]} forced \${effective.enabled ? "on" : "off"}\`;
  }
  if (effective.enabled)
    return \`On — \${presetName()} preset\`;
  return \`Off — \${presetName()} preset; requires \${tierForRule(rule) === "strict" ? "Strict" : "Paranoid"}\`;
};
var showRulePopover = (button, label, title, body) => {
  const popover = qs("rule-example-popover");
  qs("rule-example-label").textContent = label;
  qs("rule-example-title").textContent = title;
  qs("rule-example-command").textContent = body;
  if (!popover.matches(":popover-open"))
    popover.showPopover();
  const buttonRect = button.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();
  const gap = 8;
  const edge = 12;
  const below = buttonRect.bottom + gap;
  const top = below + popoverRect.height <= window.innerHeight - edge ? below : Math.max(edge, buttonRect.top - gap - popoverRect.height);
  const left = Math.min(window.innerWidth - popoverRect.width - edge, Math.max(edge, buttonRect.right - popoverRect.width));
  popover.style.top = \`\${top}px\`;
  popover.style.left = \`\${left}px\`;
};
var openRuleExample = (button) => {
  const rule = state?.destructiveCommandRules.find((item) => item.id === button.dataset.ruleExample);
  if (!rule)
    return;
  showRulePopover(button, "Blocked command example", rule.label, rule.example);
};
var openSecretPaths = (button) => {
  const rule = state?.secretPatterns.find((item) => item.id === button.dataset.secretPaths);
  if (!rule?.paths)
    return;
  showRulePopover(button, "Protected paths", rule.label, rule.paths.join(\`
\`));
};
var renderDestructiveCommands = () => {
  if (!state || !preview)
    return;
  const loaded = state;
  const effectiveState = preview;
  const query = qs("policy-search").value.trim().toLowerCase();
  const matchingRules = state.destructiveCommandRules.filter((rule) => [rule.category, rule.label, rule.id, rule.description, tierMeta[tierForRule(rule)][0]].join(" ").toLowerCase().includes(query));
  qs("destructive-command-summary").textContent = draftPolicy.destructive_command_protection.enabled ? \`\${preview.counts.enabled} active, \${preview.counts.disabled} disabled\` : "Configurable protection disabled. Catastrophic protections remain active; saved rule settings and allow paths are preserved.";
  const enforcedRules = matchingRules.filter((rule) => rule.catastrophic);
  const configurableRules = matchingRules.filter((rule) => !rule.catastrophic);
  const enforcedExpanded = tierExpanded.get("enforced") || searchActive && !searchCollapsedTiers.has("enforced");
  const enforcedSection = enforcedRules.length === 0 ? "" : \`<section class="rule-tier rule-tier-enforced">
        <div class="rule-tier-head">
          <button type="button" class="tier-collapse" data-tier-toggle="enforced" aria-expanded="\${enforcedExpanded}" aria-controls="destructive-tier-enforced">
            <span class="panel-chevron" aria-hidden="true"></span>
            <span class="tier-label"><strong>Always enforced</strong><small>Cannot be disabled by any preset, rule override, or allow path</small></span>
            <span class="tier-counts">\${enforcedRules.length} protection\${enforcedRules.length === 1 ? "" : "s"}</span>
          </button>
        </div>
        <div id="destructive-tier-enforced" class="tier-content" \${enforcedExpanded ? "" : "hidden"}>
          \${groupRules(enforcedRules).map((group) => \`<section class="destructive-command-group">
            <h3>\${escapeHtml(group.category)}</h3>
            <div class="grid">\${group.rules.map((rule) => \`<div class="row rule-row">
                <span class="rule-control">
                  <span>
                    <strong>\${escapeHtml(rule.label)}</strong>
                    <button type="button" class="rule-id" data-rule-activity="\${escapeHtml(rule.id)}" title="Show recent blocks in Activity">\${escapeHtml(rule.id)}</button>
                    <small><span class="state-active">Always enforced</span> \${escapeHtml(rule.description)}</small>
                  </span>
                </span>
                <button type="button" class="rule-example-button" data-rule-example="\${escapeHtml(rule.id)}" aria-label="\${escapeHtml(\`Show blocked example for \${rule.label}\`)}" aria-haspopup="dialog" aria-controls="rule-example-popover">?</button>
              </div>\`).join("")}</div>
          </section>\`).join("")}
        </div>
      </section>\`;
  qs("destructive-command-rules").innerHTML = matchingRules.length === 0 ? '<p class="empty">No built-in protections match the search.</p>' : enforcedSection + Object.keys(tierMeta).map((tier) => {
    const rules = configurableRules.filter((rule) => tierForRule(rule) === tier);
    if (rules.length === 0)
      return "";
    const allTierRules = loaded.destructiveCommandRules.filter((rule) => !rule.catastrophic && tierForRule(rule) === tier);
    const tierStates = allTierRules.flatMap((rule) => effectiveState.rules[rule.id] ?? []);
    const expanded = tierExpanded.get(tier) || searchActive && !searchCollapsedTiers.has(tier);
    const contentId = \`destructive-tier-\${tier}\`;
    return \`<section class="rule-tier rule-tier-\${tier}">
        <div class="rule-tier-head">
          <button type="button" class="tier-collapse" data-tier-toggle="\${tier}" aria-expanded="\${expanded}" aria-controls="\${contentId}">
            <span class="panel-chevron" aria-hidden="true"></span>
            <span class="tier-label"><strong>\${tierMeta[tier][0]}</strong><small>\${tierMeta[tier][1]}</small></span>
            <span class="tier-counts">\${tierCountHtml([
      [tierStates.filter((item) => item.enabled).length, "on"],
      [tierStates.filter((item) => !item.enabled).length, "off", "off"]
    ])}</span>
          </button>
          <input type="checkbox" class="tier-switch" data-destructive-tier-active="\${tier}" \${checkbox(tierStates.some((item) => item.enabled))} \${!draftPolicy.destructive_command_protection.enabled ? "disabled" : ""} aria-label="\${escapeHtml(\`All \${tierMeta[tier][0]} protections\`)}">
        </div>
        <div id="\${contentId}" class="tier-content" \${expanded ? "" : "hidden"}>
          \${groupRules(rules).map((group) => \`<section class="destructive-command-group">
            <h3>\${escapeHtml(group.category)}</h3>
            <div class="grid">\${group.rules.map((rule) => {
      const effective = effectiveState.rules[rule.id];
      if (!effective)
        return "";
      const override = draftPolicy.destructive_command_protection.overrides[rule.id];
      const status = ruleStateText(rule, effective, effectiveState.capabilities);
      const disabled = !draftPolicy.destructive_command_protection.enabled;
      return \`<div class="row rule-row \${disabled ? "row-disabled" : ""}">
                <label class="rule-control">
                  <input type="checkbox" data-destructive-command-active="\${escapeHtml(rule.id)}" \${checkbox(effective.enabled)} \${disabled ? "disabled" : ""} aria-label="\${escapeHtml(\`\${rule.label}: \${status}\`)}">
                  <span>
                    <strong>\${escapeHtml(rule.label)}</strong>
                    <button type="button" class="rule-id" data-rule-activity="\${escapeHtml(rule.id)}" title="Show recent blocks in Activity">\${escapeHtml(rule.id)}</button>
                    <small><span class="\${effective.enabled ? "state-active" : "state-disabled"}">\${escapeHtml(status)}</span> \${escapeHtml(rule.description)}</small>
                  </span>
                </label>
                <button type="button" class="rule-example-button" data-rule-example="\${escapeHtml(rule.id)}" aria-label="\${escapeHtml(\`Show blocked example for \${rule.label}\`)}" aria-haspopup="dialog" aria-controls="rule-example-popover">?</button>
                \${override && !effective.changesInherited ? \`<button type="button" class="inherit-button" data-use-inherited="\${escapeHtml(rule.id)}">Use inherited setting</button>\` : ""}
                \${projectFieldChip(\`destructive_command_protection.overrides.\${rule.id}\`, true)}
              </div>\`;
    }).join("")}</div>
          </section>\`).join("")}
        </div>
      </section>\`;
  }).join("");
};
var refreshPolicyPreview = async () => {
  const requestId = ++previewRequestId;
  const result = await requestPolicyPreview(effectivePreviewPolicy(collectFormPolicy(), projectDraft?.baseline ?? null));
  if (requestId !== previewRequestId)
    return false;
  if (!result.ok || !result.data?.preview) {
    setAppStatus("Preview failed", "error");
    setDetailStatus(\`Error: \${errorText(result)}\`, "error");
    return false;
  }
  preview = result.data.preview;
  renderProtectionCard();
  renderSafety();
  renderDestructiveCommands();
  runCommandTest();
  return true;
};
var testerRequestId = 0;
var runCommandTest = async () => {
  const command = qs("tester-input").value.trim();
  if (!command) {
    qs("tester-result").hidden = true;
    return;
  }
  const requestId = ++testerRequestId;
  const result = await requestJson("/api/policy/explain", {
    method: "POST",
    body: JSON.stringify({
      command,
      policy: effectivePreviewPolicy(collectFormPolicy(), projectDraft?.baseline ?? null)
    })
  });
  if (requestId !== testerRequestId)
    return;
  const el = qs("tester-result");
  el.hidden = false;
  if (!result.ok) {
    el.className = "status error";
    el.textContent = \`Could not evaluate: \${errorText(result)}\`;
    return;
  }
  if (result.data.result === "allowed") {
    el.className = "status ok";
    el.innerHTML = \`Allowed — no rule blocks this command under the current draft policy. <button type="button" class="feed-toggle" data-create-rule="\${escapeHtml(command)}">Create a rule for this</button>\`;
    return;
  }
  const ruleId = result.data.customRule?.id ?? result.data.ruleId;
  const ruleIdHtml = result.data.customRule ? \`<button type="button" class="rule-id" data-jump-custom-rule="\${escapeHtml(ruleId)}" title="Show this rule in Rules">\${escapeHtml(ruleId)}</button>\` : \`<code class="rule-id">\${escapeHtml(ruleId)}</code>\`;
  const segment = result.data.segment && result.data.segment !== command ? \`<div class="tester-segment">Segment: <code>\${escapeHtml(result.data.segment)}</code></div>\` : "";
  el.className = "status error";
  el.innerHTML = \`Blocked\${ruleId ? \` by \${ruleIdHtml}\` : ""} — \${escapeHtml(result.data.reason || "")}\${segment}\`;
};
function render() {
  if (!state)
    return;
  draftPolicy = clonePolicy(state.policy);
  preview = state.preview;
  knownRuleIds = new Set([...state.destructiveCommandRules, ...state.secretPatterns].map((rule) => rule.id));
  dirty = false;
  qs("policy-savebar").hidden = true;
  qs("dirty-chip").hidden = true;
  qs("policy-path").textContent = state.path + (state.exists ? "" : " (not created yet)");
  const projectPolicy = state.projectPolicy;
  qs("project-policy-row").hidden = !projectPolicy;
  qs("project-policy-path").textContent = projectPolicy?.path ?? "";
  qs("project-policy-notice").hidden = !projectPolicy || projectPolicy.weakenings.length === 0;
  qs("project-policy-notice").textContent = projectPolicy ? ["Merged on top of this file:", ...projectPolicy.weakenings].join(\`
\`) : "";
  qs("app-version").textContent = state.version;
  renderSafety();
  qs("destructive-command").innerHTML = '<label class="row master"><input type="checkbox" data-destructive-command-enabled ' + checkbox(state.policy.destructive_command_protection.enabled) + '><span><strong>Destructive command protection</strong><small>Block configurable destructive git, filesystem, and execution patterns. Catastrophic and custom rules remain active when disabled.</small></span><span class="master-badge">' + (state.policy.destructive_command_protection.enabled ? "On" : "Off") + '</span><span class="project-chip-slot" id="destructive-enabled-chip"></span></label>' + '<div id="destructive-command-rules"></div>' + '<section class="rule-tier">' + '<button type="button" class="rule-tier-head" aria-expanded="false" aria-controls="allow-paths-content"><span class="panel-chevron" aria-hidden="true"></span><span class="tier-label"><strong id="allow-paths-label">Allow paths</strong><small>Recursive deletes targeting these paths are not blocked, like /tmp. The home directory, or any path containing it, is rejected.</small></span><span class="tier-counts" id="allow-paths-count"></span></button>' + '<div class="tier-content paths-content" id="allow-paths-content" hidden>' + '<p class="muted">Use an absolute path or a ~/ path. Paste multiple lines to add several paths at once.</p>' + '<div class="paths-add"><input type="text" id="allow-paths-input" data-path-input="allow-paths" autocomplete="off" spellcheck="false" placeholder="/absolute/path or ~/path" aria-labelledby="allow-paths-label"><button type="button" class="icon-button" id="allow-paths-add-button" data-path-add="allow-paths" aria-label="Add allow path">' + pathListIcons.add + "</button></div>" + '<p class="paths-hint" id="allow-paths-hint" hidden></p>' + '<span class="project-chip-slot" id="allow-paths-chip"></span>' + '<ul class="paths-list" id="allow-paths-list"></ul>' + "</div></section>";
  qs("secret").innerHTML = '<label class="row master"><input type="checkbox" id="secret-enabled" ' + checkbox(state.policy.secret_protection.enabled) + '><span><strong>Secret protection</strong><small>Block default sensitive paths, coding CLI credential locations, and configured deny paths.</small></span><span class="master-badge">' + (state.policy.secret_protection.enabled ? "On" : "Off") + '</span><span class="project-chip-slot" id="secret-enabled-chip"></span></label>' + '<div id="secret-patterns"></div>' + '<section class="rule-tier">' + '<button type="button" class="rule-tier-head" aria-expanded="false" aria-controls="deny-paths-content"><span class="panel-chevron" aria-hidden="true"></span><span class="tier-label"><strong id="deny-paths-label">Deny paths</strong><small>Configured paths and everything inside them are blocked while Secret protection is on.</small></span><span class="tier-counts" id="deny-paths-count"></span></button>' + '<div class="tier-content paths-content" id="deny-paths-content" hidden>' + '<p class="muted">Paste multiple lines to add several paths at once.</p>' + '<div class="paths-add"><input type="text" id="deny-paths-input" data-path-input="deny-paths" autocomplete="off" spellcheck="false" placeholder="path/to/protect" aria-labelledby="deny-paths-label"><button type="button" class="icon-button" id="deny-paths-add-button" data-path-add="deny-paths" aria-label="Add deny path">' + pathListIcons.add + "</button></div>" + '<p class="paths-hint" id="deny-paths-hint" hidden></p>' + '<span class="project-chip-slot" id="deny-paths-chip"></span>' + '<ul class="paths-list" id="deny-paths-list"></ul>' + "</div></section>" + '<section class="rule-tier">' + '<button type="button" class="rule-tier-head" aria-expanded="false" aria-controls="secret-allow-paths-content"><span class="panel-chevron" aria-hidden="true"></span><span class="tier-label"><strong id="secret-allow-paths-label">Allow paths</strong><small>Exact files, subtrees, or one file name under a folder like ~/code/**/.env.local are exempt from pattern rules. Entries covering the home directory are rejected. Deny paths and coding CLI protections still apply.</small></span><span class="tier-counts" id="secret-allow-paths-count"></span></button>' + '<div class="tier-content paths-content" id="secret-allow-paths-content" hidden>' + '<p class="muted">Paste multiple lines to add several paths at once.</p>' + '<div class="paths-add"><input type="text" id="secret-allow-paths-input" data-path-input="secret-allow-paths" autocomplete="off" spellcheck="false" placeholder="~/code/**/.env.local or ~/project/fixtures" aria-labelledby="secret-allow-paths-label"><button type="button" class="icon-button" id="secret-allow-paths-add-button" data-path-add="secret-allow-paths" aria-label="Add allow path">' + pathListIcons.add + "</button></div>" + '<p class="paths-hint" id="secret-allow-paths-hint" hidden></p>' + '<span class="project-chip-slot" id="secret-allow-paths-chip"></span>' + '<ul class="paths-list" id="secret-allow-paths-list"></ul>' + "</div></section>";
  qs("raw").value = state.errors.length ? state.raw : formatPolicy(draftPolicy);
  qs("policy-search").value = "";
  syncSearchState();
  renderDestructiveCommands();
  renderSecretPatterns();
  pathLists["deny-paths"].render();
  pathLists["secret-allow-paths"].render();
  pathLists["allow-paths"].render();
  syncProjectChips();
  updateRawSource();
  renderRetention(state);
  qs("recovery").hidden = state.errors.length === 0;
  updateActions();
  renderProtectionCard();
  if (state.errors.length) {
    if (currentView() !== "policy")
      location.hash = "policy";
    setAppStatus("Repair required", "error");
    setDetailStatus(\`Error: \${state.errors.join(\`
\`)}\`, "error");
    return;
  }
  setAppStatus("");
  setDetailStatus("");
}
var restoreDraft = () => {
  if (!state || state.errors.length)
    return;
  const stored = sessionStorage.getItem("cc-safety-net-draft");
  if (!stored)
    return;
  const parsed = (() => {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  })();
  const isRecordField = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
  const isOptionalPathList = (value) => value === undefined || Array.isArray(value) && value.every((item) => typeof item === "string");
  const isPolicyShape = isRecordField(parsed) && isRecordField(parsed.safety) && typeof parsed.safety.level === "string" && Object.hasOwn(safetyLevels, parsed.safety.level) && isRecordField(parsed.safety.overrides) && isRecordField(parsed.workflow) && isRecordField(parsed.destructive_command_protection) && isRecordField(parsed.destructive_command_protection.overrides) && isOptionalPathList(parsed.destructive_command_protection.allow_paths) && isRecordField(parsed.secret_protection) && isRecordField(parsed.secret_protection.overrides) && isOptionalPathList(parsed.secret_protection.deny_paths) && isOptionalPathList(parsed.secret_protection.allow_paths) && isRecordField(parsed.audit);
  if (!isPolicyShape || stored === JSON.stringify(state.policy)) {
    sessionStorage.removeItem("cc-safety-net-draft");
    return;
  }
  const draft = parsed;
  draft.destructive_command_protection.allow_paths ??= [];
  draft.secret_protection.deny_paths ??= [];
  draft.secret_protection.allow_paths ??= [];
  draftPolicy = draft;
  renderPolicySections();
  refreshPolicyPreview();
  setAppStatus("Restored unsaved draft", "ok");
};
function renderPolicySections() {
  const masterToggle = document.querySelector("[data-destructive-command-enabled]");
  if (masterToggle)
    masterToggle.checked = draftPolicy.destructive_command_protection.enabled;
  qs("secret-enabled").checked = draftPolicy.secret_protection.enabled;
  syncMasterBadges();
  renderSafety();
  renderDestructiveCommands();
  renderSecretPatterns();
  pathLists["deny-paths"].render();
  pathLists["secret-allow-paths"].render();
  pathLists["allow-paths"].render();
  syncProjectChips();
  syncRawFromForm();
  updateDirtyStatus();
}
async function load() {
  const result = await requestJson("/api/policy");
  if (!result.ok || !result.data) {
    setAppStatus("Load failed", "error");
    setDetailStatus(\`Error: Could not load policy: \${errorText(result)}\`, "error");
    return false;
  }
  state = result.data;
  render();
  restoreDraft();
  return true;
}
var targetInput = (event) => event.target instanceof HTMLInputElement ? event.target : null;
var targetElement = (event) => event.target instanceof Element ? event.target : null;
document.addEventListener("input", (event) => {
  const input = targetInput(event);
  if (!input)
    return;
  if (input.id === "policy-search") {
    syncSearchState();
    renderDestructiveCommands();
    renderSecretPatterns();
    return;
  }
  if (input.id === "activity-search" && activity) {
    if (clearCommandFilter())
      renderActivityControls();
    activityFilters.query = input.value.trim().toLowerCase();
    clearTimeout(activityQueryTimer);
    activityQueryTimer = setTimeout(renderActivityFeed, 120);
  }
});
document.addEventListener("keydown", (event) => {
  const input = targetInput(event);
  if (!input)
    return;
  if (input.id === "tester-input" && event.key === "Enter") {
    event.preventDefault();
    runCommandTest();
    return;
  }
  const list = pathListFor(input.dataset.pathInput);
  if (!list || event.key !== "Enter")
    return;
  event.preventDefault();
  list.add(input.value);
});
document.addEventListener("paste", (event) => {
  const input = targetInput(event);
  if (!input)
    return;
  const list = pathListFor(input.dataset.pathInput);
  if (!list)
    return;
  const text = event.clipboardData?.getData("text") ?? "";
  if (!text.includes(\`
\`))
    return;
  event.preventDefault();
  list.add(\`\${input.value}
\${text}\`);
});
var writePolicy = async (path, body, failureStatus) => {
  const result = await requestJson(path, { method: "POST", body });
  if (isWriteSuccess(result))
    return result;
  setAppStatus(failureStatus, "error");
  setDetailStatus(\`Error: \${errorText(result)}\`, "error");
  return null;
};
var reloadAfterWrite = async () => {
  sessionStorage.removeItem("cc-safety-net-draft");
  if (!await load())
    return false;
  dirty = false;
  setDetailStatus("");
  return true;
};
var setProjectDraftDiagnostics = (messages) => {
  qs("project-draft-diagnostics").textContent = messages.join(\`
\`);
  qs("project-draft-diagnostics").hidden = messages.length === 0;
};
var renderProjectDraftBar = () => {
  qs("project-draft-enter").hidden = projectDraft !== null;
  qs("project-draft-bar").hidden = projectDraft === null;
  qs("save").textContent = projectDraft ? "Review & apply" : "Save";
  if (!projectDraft)
    return;
  qs("project-draft-path").textContent = projectDraft.path;
  qs("project-draft-change").hidden = !projectDraft.canPickDirectory;
};
var exitProjectDraft = () => {
  projectDraft = null;
  markedFields = new Set;
  setProjectDraftDiagnostics([]);
  if (state)
    draftPolicy = clonePolicy(state.policy);
  renderProjectDraftBar();
  renderPolicySections();
};
var ingestProjectState = async (okStatus) => {
  const result = await requestJson("/api/policy/project");
  if (!result.ok || !result.data) {
    setAppStatus("Project draft unavailable", "error");
    setDetailStatus(\`Error: \${errorText(result)}\`, "error");
    return false;
  }
  const seeded = seedProjectDraft(result.data);
  if (!seeded) {
    exitProjectDraft();
    await load();
    setAppStatus("Repair required", "error");
    setDetailStatus([
      "Error: repair your user policy before drafting a project policy.",
      ...Array.isArray(result.data.userPolicyDiagnostics) ? result.data.userPolicyDiagnostics : []
    ].join(\`
\`), "error");
    return false;
  }
  projectDraft = {
    path: result.data.path,
    revision: result.data.revision,
    canPickDirectory: result.data.canPickDirectory === true,
    baseline: seeded.baseline,
    snapshot: seeded.snapshot
  };
  markedFields = seeded.marked;
  draftPolicy = seeded.policy;
  setProjectDraftDiagnostics(Array.isArray(result.data.projectionDiagnostics) ? result.data.projectionDiagnostics : []);
  renderProjectDraftBar();
  renderPolicySections();
  refreshPolicyPreview();
  setAppStatus(okStatus, "ok");
  return true;
};
var enterProjectDraft = async () => {
  if (!state) {
    setAppStatus("Load failed", "error");
    setDetailStatus("Error: Policy is not loaded yet. Reload the page.", "error");
    return;
  }
  if (state.errors.length) {
    setAppStatus("Repair required", "error");
    setDetailStatus("Error: repair your user policy before drafting a project policy.", "error");
    return;
  }
  if (dirty) {
    if (!await confirmDialog({
      title: "Discard unsaved policy changes?",
      body: "A project draft starts from your saved user policy. Save your changes first, or discard them here.",
      confirmLabel: "Discard changes",
      confirmClass: ""
    }))
      return;
    sessionStorage.removeItem("cc-safety-net-draft");
    if (!await load())
      return;
  }
  await ingestProjectState("Drafting a project policy.");
};
var confirmDiscardProjectDraft = async (body) => !dirty || await confirmDialog({
  title: "Discard this project draft?",
  body,
  confirmLabel: "Discard draft",
  confirmClass: ""
});
var changeProjectDirectory = async () => {
  if (!await confirmDiscardProjectDraft("Switching projects discards this draft."))
    return;
  const result = await requestJson("/api/policy/project/choose-directory", { method: "POST" });
  if (!result.ok) {
    setAppStatus("Could not open the folder picker", "error");
    setDetailStatus(\`Error: \${errorText(result)}\`, "error");
    return;
  }
  if (result.data.error) {
    setAppStatus(result.data.error, "error");
    return;
  }
  if (result.data.cancelled)
    return;
  await ingestProjectState("Drafting a project policy.");
};
var leaveProjectDraft = async () => {
  if (!await confirmDiscardProjectDraft("The fields you marked are not written anywhere yet."))
    return;
  exitProjectDraft();
  if (await load())
    setAppStatus("Left the project draft.", "ok");
};
var discardProjectDraft = async () => {
  const draft = projectDraft;
  if (!draft)
    return;
  if (!await confirmDialog({
    title: "Discard changes to this draft?",
    body: "The draft returns to the fields this project already sets.",
    confirmLabel: "Discard changes",
    confirmClass: ""
  }))
    return;
  const snapshot = JSON.parse(draft.snapshot);
  markedFields = new Set(projectMarkedFields(snapshot));
  draftPolicy = overlayProjectProposal(draft.baseline, snapshot);
  renderPolicySections();
  refreshPolicyPreview();
  setAppStatus("Changes discarded.", "ok");
};
var handleStaleProjectDraft = async () => {
  if (!await ingestProjectState("Project draft reloaded."))
    return;
  setAppStatus("Project target changed", "error");
  setDetailStatus("Error: the project directory changed, so this draft was reloaded for the new target. Review it again before applying.", "error");
};
var projectDiffHtml = (data) => {
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const warnings = [
    ...data.existingFileDiagnostics?.length ? ["The existing project policy file is invalid and will be replaced."] : [],
    ...data.weakenings ?? []
  ];
  const table = rows.length === 0 ? '<p class="empty">No change to the effective policy.</p>' : \`<table class="diff-table"><thead><tr><th>Setting</th><th>Now</th><th>After</th></tr></thead><tbody>\${rows.map((row) => \`<tr><td><code>\${escapeHtml(row.field)}</code></td><td class="diff-before">\${escapeHtml(row.before ?? "(unset)")}</td><td class="diff-after">\${escapeHtml(row.after ?? "(unset)")}</td></tr>\`).join("")}</tbody></table>\`;
  return table + warnings.map((text) => \`<p class="diff-warning">\${escapeHtml(text)}</p>\`).join("");
};
var reviewProjectDraft = async () => {
  const draft = projectDraft;
  if (!draft)
    return;
  const proposal = collectProjectProposal(markedFields, draftPolicy);
  const serialized = JSON.stringify(proposal);
  const body = JSON.stringify({ revision: draft.revision, proposal });
  const diff = await requestJson("/api/policy/project/diff", { method: "POST", body });
  if (projectDraft !== draft)
    return;
  if (diff.status === 409) {
    await handleStaleProjectDraft();
    return;
  }
  if (!diff.ok) {
    setAppStatus("Review failed", "error");
    setDetailStatus(\`Error: \${errorText(diff)}\`, "error");
    return;
  }
  if (JSON.stringify(collectProjectProposal(markedFields, draftPolicy)) !== serialized) {
    setAppStatus("Review again", "error");
    setDetailStatus("Error: the draft changed while the review was loading. Review it again.", "error");
    return;
  }
  if (!await confirmDialog({
    title: "Apply this project policy?",
    body: "Everyone who works in this project gets these changes on top of their own user policy.",
    detail: draft.path,
    rowsHtml: projectDiffHtml(diff.data),
    confirmLabel: "Apply project policy",
    confirmClass: "primary"
  }))
    return;
  await runExclusive("Applying...", async () => {
    const applied = await requestJson("/api/policy/project/apply", { method: "POST", body });
    if (applied.status === 409) {
      await handleStaleProjectDraft();
      return;
    }
    if (!isWriteSuccess(applied)) {
      setAppStatus("Apply failed", "error");
      setDetailStatus(\`Error: \${errorText(applied)}\`, "error");
      return;
    }
    const path = applied.data.path;
    exitProjectDraft();
    if (await load())
      setAppStatus(\`Applied \${path}.\`, "ok");
  });
};
var saveRetentionDays = async (days) => {
  const saved = state;
  if (!saved)
    return;
  const current = saved.policy.audit.retention_days;
  if (!Number.isInteger(days) || days < MIN_AUDIT_RETENTION_DAYS || days > MAX_AUDIT_RETENTION_DAYS) {
    qs("retention-days").value = String(current);
    setAppStatus("Retention unchanged", "error");
    setDetailStatus(\`Error: retention must be a whole number of days from \${MIN_AUDIT_RETENTION_DAYS} to \${MAX_AUDIT_RETENTION_DAYS}.\`, "error");
    return;
  }
  if (days === current)
    return;
  if (projectDraft) {
    qs("retention-days").value = String(current);
    setAppStatus("Retention unchanged", "error");
    setDetailStatus("Error: exit or apply your project draft first.", "error");
    return;
  }
  if (dirty) {
    qs("retention-days").value = String(current);
    setAppStatus("Retention unchanged", "error");
    setDetailStatus("Error: save or discard your unsaved Policy changes first.", "error");
    return;
  }
  if (days < current && !await confirmDialog({
    title: \`Shorten retention to \${dayCount(days)}?\`,
    body: \`Audit entries older than \${dayCount(days)} are deleted on the next sweep and cannot be recovered. The Activity tab will only look back \${dayCount(days)}.\`,
    detail: overview?.logsDir ?? "",
    confirmLabel: "Shorten",
    confirmClass: "danger"
  })) {
    qs("retention-days").value = String(current);
    return;
  }
  await runExclusive("Saving...", async () => {
    const policy = clonePolicy(saved.policy);
    policy.audit.retention_days = days;
    if (!await writePolicy("/api/policy", JSON.stringify(policy), "Save failed")) {
      qs("retention-days").value = String(current);
      return;
    }
    if (!await load())
      return;
    activityFilters.days = Math.min(activityFilters.days, days);
    await Promise.all([loadOverview(), loadActivity()]);
    setAppStatus(\`Retention set to \${dayCount(days)}.\`, "ok");
    setDetailStatus("");
  });
};
document.addEventListener("change", (event) => {
  const control = event.target;
  if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement))
    return;
  if (control.id === "activity-days") {
    activityFilters.days = Number(control.value);
    loadActivity();
    return;
  }
  if (control.id === "retention-days") {
    saveRetentionDays(Number(control.value));
    return;
  }
  if (control.name === "safety-level") {
    draftPolicy.safety.level = control.value;
    markProjectField("safety.level");
    renderSafety();
    syncRawFromForm();
    updateDirtyStatus();
    refreshPolicyPreview();
    return;
  }
  if (control.dataset?.safetyOverride) {
    if (control.value === "inherit" && !projectDraft)
      delete draftPolicy.safety.overrides[control.dataset.safetyOverride];
    if (control.value === "true")
      draftPolicy.safety.overrides[control.dataset.safetyOverride] = true;
    if (control.value === "false")
      draftPolicy.safety.overrides[control.dataset.safetyOverride] = false;
    if (control.value === "inherit")
      unmarkProjectField(\`safety.overrides.\${control.dataset.safetyOverride}\`);
    if (control.value !== "inherit")
      markProjectField(\`safety.overrides.\${control.dataset.safetyOverride}\`);
    syncRawFromForm();
    updateDirtyStatus();
    refreshPolicyPreview();
    return;
  }
  const input = control instanceof HTMLInputElement ? control : null;
  if (!input)
    return;
  if ("workflowWorktree" in input.dataset) {
    draftPolicy.workflow.worktree_mode = input.checked;
    markProjectField("workflow.worktree_mode");
    syncRawFromForm();
    updateDirtyStatus();
    return;
  }
  if ("destructiveCommandEnabled" in input.dataset) {
    (async () => {
      if (!input.checked && !await confirmProtectionDisable({
        title: "Disable destructive command protection?",
        body: "Built-in destructive git, filesystem, and execution protections will stop blocking commands until you turn this back on.",
        detail: "Custom rules remain active."
      })) {
        input.checked = true;
        return;
      }
      draftPolicy.destructive_command_protection.enabled = input.checked;
      markProjectField("destructive_command_protection.enabled");
      syncMasterBadges();
      pathLists["allow-paths"].render();
      syncRawFromForm();
      updateDirtyStatus();
      refreshPolicyPreview();
    })();
    return;
  }
  if (input.dataset?.destructiveTierActive) {
    const effectiveState = preview;
    if (!effectiveState)
      return;
    state?.destructiveCommandRules.filter((rule) => !rule.catastrophic && tierForRule(rule) === input.dataset.destructiveTierActive).forEach((rule) => {
      setDestructiveOverride(rule.id, input.checked, effectiveState.rules[rule.id]?.inheritedEnabled);
    });
    syncRawFromForm();
    updateDirtyStatus();
    refreshPolicyPreview();
    return;
  }
  if (input.dataset?.destructiveCommandActive) {
    const ruleId = input.dataset.destructiveCommandActive;
    setDestructiveOverride(ruleId, input.checked, preview?.rules[ruleId]?.inheritedEnabled);
    syncRawFromForm();
    updateDirtyStatus();
    refreshPolicyPreview();
    return;
  }
  if (input.dataset?.secretGroupActive) {
    state?.secretPatterns.filter((rule) => rule.category === input.dataset.secretGroupActive).forEach((rule) => {
      setSecretOverride(rule, input.checked);
    });
    renderSecretPatterns();
    syncRawFromForm();
    updateDirtyStatus();
    return;
  }
  if (input.dataset?.secretActive) {
    const rule = state?.secretPatterns.find((item) => item.id === input.dataset.secretActive);
    if (!rule)
      return;
    setSecretOverride(rule, input.checked);
    renderSecretPatterns();
    syncRawFromForm();
    updateDirtyStatus();
    return;
  }
  if (input.id === "secret-enabled") {
    (async () => {
      if (!input.checked && !await confirmProtectionDisable({
        title: "Disable secret protection?",
        body: "Default sensitive paths, coding CLI credential locations, and deny paths will stop blocking access until you turn this back on."
      })) {
        input.checked = true;
        return;
      }
      draftPolicy.secret_protection.enabled = input.checked;
      markProjectField("secret_protection.enabled");
      syncMasterBadges();
      renderSecretPatterns();
      pathLists["deny-paths"].render();
      pathLists["secret-allow-paths"].render();
      syncRawFromForm();
      updateDirtyStatus();
    })();
  }
});
document.addEventListener("click", (event) => {
  const target = targetElement(event);
  if (!target)
    return;
  if (target.closest("#tester-run")) {
    runCommandTest();
    return;
  }
  if (target.closest("#project-draft-enter")) {
    enterProjectDraft();
    return;
  }
  if (target.closest("#project-draft-change")) {
    changeProjectDirectory();
    return;
  }
  if (target.closest("#project-draft-exit")) {
    leaveProjectDraft();
    return;
  }
  const unmarkButton = target.closest("[data-unmark-field]");
  if (unmarkButton) {
    unmarkProjectField(unmarkButton.dataset.unmarkField ?? "");
    return;
  }
  const createRule = target.closest("[data-create-rule]");
  if (createRule) {
    openRuleComposer(createRule.dataset.createRule ?? "");
    return;
  }
  const feedToggle = target.closest("[data-feed-toggle]");
  if (feedToggle) {
    const command = feedToggle.previousElementSibling;
    if (!command)
      return;
    const expanded = command.classList.toggle("expanded");
    feedToggle.setAttribute("aria-expanded", String(expanded));
    feedToggle.textContent = expanded ? "Show less" : "Show more";
    return;
  }
  const feedCopy = target.closest("[data-log-copy]");
  if (feedCopy) {
    copyFeedEntry(feedCopy);
    return;
  }
  const feedReport = target.closest("[data-report-fp]");
  if (feedReport) {
    openReportDialog(feedReport);
    return;
  }
  const blockFuture = target.closest("[data-block-future]");
  if (blockFuture) {
    const entry = renderedFeedEntries[Number(blockFuture.dataset.blockFuture)];
    if (entry?.segment || entry?.command)
      openRuleComposer(entry.segment || entry.command || "");
    return;
  }
  const topRule = target.closest(".top-rule");
  if (topRule) {
    const ruleId = topRule.dataset.ruleId ?? "";
    (ruleId.startsWith("custom.") ? jumpToRulesRule : jumpToActivityRule)(ruleId);
    return;
  }
  const ruleActivity = target.closest("[data-rule-activity]");
  if (ruleActivity) {
    jumpToActivityRule(ruleActivity.dataset.ruleActivity ?? "");
    return;
  }
  const jumpRule = target.closest("[data-jump-rule]");
  if (jumpRule) {
    qs("policy-search").value = jumpRule.dataset.jumpRule ?? "";
    syncSearchState();
    renderDestructiveCommands();
    renderSecretPatterns();
    location.hash = "policy";
    return;
  }
  const jumpCustom = target.closest("[data-jump-custom-rule]");
  if (jumpCustom) {
    jumpToRulesRule(jumpCustom.dataset.jumpCustomRule ?? "");
    return;
  }
  const topCommand = target.closest(".top-command");
  if (topCommand) {
    activityFilters.command = topCommand.dataset.command ?? "";
    activityFilters.decision = "deny";
    activityFilters.query = "";
    qs("activity-search").value = "";
    if (activity) {
      renderActivityControls();
      renderActivityFeed();
    }
    location.hash = "activity";
    return;
  }
  if (target.closest("[data-clear-command]")) {
    clearCommandFilter();
    renderActivityControls();
    renderActivityFeed();
    return;
  }
  if (target.closest("#guard-errors")) {
    clearCommandFilter();
    activityFilters.decision = "error";
    if (activity) {
      renderActivityControls();
      renderActivityFeed();
    }
    location.hash = "activity";
    return;
  }
  const chip = target.closest("[data-activity-chip]");
  if (chip && activity) {
    clearCommandFilter();
    activityFilters[chip.dataset.activityChip] = chip.dataset.chipValue ?? "";
    renderActivityControls();
    renderActivityFeed();
    return;
  }
  if (target.closest("#activity-refresh")) {
    refreshActivity();
    return;
  }
  if (target.closest("#integrations-refresh")) {
    refreshIntegrations();
    return;
  }
  if (target.closest("#rules-refresh")) {
    refreshRules();
    return;
  }
  const scopeChip = target.closest("[data-rules-scope]");
  if (scopeChip) {
    setRulesScope(scopeChip.dataset.rulesScope ?? "");
    return;
  }
  const exampleChip = target.closest("[data-rules-example]");
  if (exampleChip) {
    qs("rules-composer-input").value = exampleChip.dataset.rulesExample ?? "";
    return;
  }
  if (target.closest("#rules-choose-directory")) {
    chooseProjectDirectory();
    return;
  }
  if (target.closest("#rules-copy-prompt")) {
    copyRulePrompt();
    return;
  }
  const integrationButton = target.closest("[data-integration-action]");
  if (integrationButton) {
    runIntegrationAction(integrationButton);
    return;
  }
  const ruleExampleButton = target.closest("[data-rule-example]");
  if (ruleExampleButton) {
    openRuleExample(ruleExampleButton);
    return;
  }
  const secretPathsButton = target.closest("[data-secret-paths]");
  if (secretPathsButton) {
    openSecretPaths(secretPathsButton);
    return;
  }
  const tierButton = target.closest("[data-tier-toggle]");
  if (tierButton) {
    const tier = tierButton.dataset.tierToggle ?? "";
    const expanded = tierButton.getAttribute("aria-expanded") === "true";
    tierExpanded.set(tier, !expanded);
    if (searchActive && expanded)
      searchCollapsedTiers.add(tier);
    if (!expanded)
      searchCollapsedTiers.delete(tier);
    renderDestructiveCommands();
    return;
  }
  const secretGroupButton = target.closest("[data-secret-group-toggle]");
  if (secretGroupButton) {
    const category = secretGroupButton.dataset.secretGroupToggle ?? "";
    const expanded = secretGroupButton.getAttribute("aria-expanded") === "true";
    secretGroupExpanded.set(category, !expanded);
    if (searchActive && expanded)
      searchCollapsedSecretGroups.add(category);
    if (!expanded)
      searchCollapsedSecretGroups.delete(category);
    renderSecretPatterns();
    return;
  }
  if (target.closest("[data-secret-group-active], [data-destructive-tier-active]"))
    return;
  const button = target.closest(".panel-toggle, .rule-tier-head");
  if (button) {
    togglePanel(button);
    return;
  }
  const inheritedButton = target.closest("[data-use-inherited]");
  if (inheritedButton) {
    const ruleId = inheritedButton.dataset.useInherited ?? "";
    if (projectDraft) {
      unmarkProjectField(\`destructive_command_protection.overrides.\${ruleId}\`);
      return;
    }
    delete draftPolicy.destructive_command_protection.overrides[ruleId];
    syncRawFromForm();
    updateDirtyStatus();
    refreshPolicyPreview();
    return;
  }
  if (target.closest("#reset-rule-customizations")) {
    if (Object.keys(draftPolicy.destructive_command_protection.overrides).length === 0) {
      setAppStatus("No customizations to reset", "ok");
      return;
    }
    (async () => {
      if (!await confirmDialog({
        title: "Restore defaults?",
        body: "All built-in destructive-command rules will return to their inherited preset settings.",
        confirmLabel: "Restore defaults"
      }))
        return;
      clearProjectOverrideMarks("destructive_command_protection");
      if (projectDraft) {
        rebuildProjectDisplay();
        return;
      }
      draftPolicy.destructive_command_protection.overrides = {};
      syncRawFromForm();
      updateDirtyStatus();
      refreshPolicyPreview();
    })();
    return;
  }
  if (target.closest("#reset-secret-customizations")) {
    if (Object.keys(draftPolicy.secret_protection.overrides).length === 0) {
      setAppStatus("No customizations to reset", "ok");
      return;
    }
    (async () => {
      if (!await confirmDialog({
        title: "Restore defaults?",
        body: "All built-in secret rules will return to their inherited preset settings.",
        confirmLabel: "Restore defaults"
      }))
        return;
      clearProjectOverrideMarks("secret_protection");
      if (projectDraft) {
        rebuildProjectDisplay();
        return;
      }
      draftPolicy.secret_protection.overrides = {};
      renderSecretPatterns();
      syncRawFromForm();
      updateDirtyStatus();
      refreshPolicyPreview();
    })();
    return;
  }
  if (target.closest("#discard-changes")) {
    if (projectDraft) {
      discardProjectDraft();
      return;
    }
    (async () => {
      if (!await confirmDialog({
        title: "Discard unsaved changes?",
        body: "All changes since your last save will be reverted.",
        confirmLabel: "Discard changes",
        confirmClass: ""
      }))
        return;
      runExclusive("Discarding...", async () => {
        sessionStorage.removeItem("cc-safety-net-draft");
        if (await load())
          setAppStatus("Changes discarded.", "ok");
      });
    })();
    return;
  }
  const addButton = target.closest("[data-path-add]");
  if (addButton) {
    const list = pathListFor(addButton.dataset.pathAdd);
    if (list)
      list.add(qs(\`\${addButton.dataset.pathAdd}-input\`).value);
    return;
  }
  const removeButton = target.closest("[data-path-remove]");
  if (removeButton)
    pathListFor(removeButton.dataset.pathList)?.remove(Number(removeButton.dataset.pathRemove));
  const starButton = target.closest(".star-cta");
  if (starButton instanceof HTMLButtonElement) {
    starRepo(starButton);
    return;
  }
});
qs("dirty-chip").onclick = () => {
  location.hash = "policy";
};
qs("save").onclick = () => {
  if (!state) {
    setAppStatus("Load failed", "error");
    setDetailStatus("Error: Policy is not loaded yet. Reload the page.", "error");
    return;
  }
  if (state.errors.length) {
    setAppStatus("Repair required", "error");
    setDetailStatus("Error: Repair policy before saving changes.", "error");
    return;
  }
  if (projectDraft) {
    reviewProjectDraft();
    return;
  }
  if (!dirty) {
    setAppStatus("No changes to save", "ok");
    setDetailStatus("");
    return;
  }
  const policy = collectFormPolicy();
  runExclusive("Saving...", async () => {
    const result = await writePolicy("/api/policy", JSON.stringify(policy), "Save failed");
    if (!result)
      return;
    if (await reloadAfterWrite())
      setAppStatus(\`Saved \${result.data.path}.\`, "ok");
  });
};
qs("repair").onclick = async () => {
  if (!state) {
    setAppStatus("Load failed", "error");
    setDetailStatus("Error: Policy is not loaded yet. Reload the page.", "error");
    return;
  }
  if (state.errors.length === 0) {
    setAppStatus("");
    setDetailStatus("");
    return;
  }
  if (!await confirmDialog({
    title: "Repair policy?",
    body: "This will write canonical policy JSON. Valid settings are preserved; invalid fields are discarded. If the JSON cannot be parsed, defaults are restored.",
    detail: state.path,
    confirmLabel: "Repair",
    confirmClass: "primary"
  })) {
    return;
  }
  runExclusive("Repairing...", async () => {
    const result = await writePolicy("/api/repair", "{}", "Repair failed");
    if (!result)
      return;
    if (await reloadAfterWrite())
      setAppStatus(\`Repaired \${result.data.path}.\`, "ok");
  });
};
qs("reset").onclick = async () => {
  if (!state) {
    setAppStatus("Load failed", "error");
    setDetailStatus("Error: Policy is not loaded yet. Reload the page.", "error");
    return;
  }
  if (projectDraft) {
    setAppStatus("Reset unavailable", "error");
    setDetailStatus("Error: exit or apply your project draft first.", "error");
    return;
  }
  if (!await confirmDialog({
    title: "Reset policy?",
    body: "This will restore the default policy JSON at this path.",
    detail: state.path,
    confirmLabel: "Reset policy"
  })) {
    return;
  }
  runExclusive("Resetting...", async () => {
    const result = await writePolicy("/api/reset", "{}", "Reset failed");
    if (!result)
      return;
    if (await reloadAfterWrite())
      setAppStatus(\`Reset \${result.data.path} to defaults.\`, "ok");
  });
};
setRawCopyCopied(false);
qs("raw-copy").onclick = () => {
  copyRawToClipboard();
};
var themeOrder = ["auto", "light", "dark"];
var themeIcons = {
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="1.5"></rect><path d="M8 20h8M12 16v4"></path></svg>',
  light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"></path></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>'
};
var themeLabels = { auto: "Auto", light: "Light", dark: "Dark" };
var applyTheme = (pref) => {
  document.documentElement.style.colorScheme = pref === "auto" ? "light dark" : pref;
  qs("theme-toggle").innerHTML = \`\${themeIcons[pref]}<span>\${themeLabels[pref]}</span>\`;
  qs("theme-toggle").setAttribute("aria-label", \`Color theme: \${themeLabels[pref]}. Click to change.\`);
};
var themePref = themeOrder.includes(localStorage.getItem("cc-safety-net-theme")) ? localStorage.getItem("cc-safety-net-theme") : "auto";
applyTheme(themePref);
qs("theme-toggle").onclick = () => {
  themePref = themeOrder[(themeOrder.indexOf(themePref) + 1) % themeOrder.length] ?? "auto";
  if (themePref === "auto")
    localStorage.removeItem("cc-safety-net-theme");
  else
    localStorage.setItem("cc-safety-net-theme", themePref);
  applyTheme(themePref);
};
window.addEventListener("beforeunload", (event) => {
  if (!dirty)
    return;
  event.preventDefault();
  event.returnValue = "";
});
window.addEventListener("hashchange", applyView);
applyView();
Promise.all([loadIntegrations(), requestJson("/api/health")]).then(([, health]) => renderHealthStrip(health));
load().then((loaded) => {
  if (loaded)
    loadStarContext();
  activityFilters.days = Math.min(activityFilters.days, retentionDays());
  loadOverview();
  loadActivity();
}).catch((error) => {
  setAppStatus("Load failed", "error");
  setDetailStatus(String(error), "error");
});

  </script>
</body>
</html>
`;var Ud='<script id="ccsn-data" type="application/json">';function Gd(P){return Hd.replace(Ud,()=>Ud+JSON.stringify({token:P}).replaceAll("<","\\u003c"))}var oo="kenryu42/cc-safety-net",Ly=`https://github.com/${oo}`,Mi=1e4,wy=7,ky="The project draft directory changed; reload the draft before applying.",xy="audit settings are user scope only; remove the audit section from a project proposal";async function Jd(P,A={}){let q=xt({label:"gui",booleans:{noOpen:["--no-open"]}},P),V=A.log??console.log,ee=A.error??console.error;if(q.errors.length>0){for(let ce of q.errors)ee(ce);return ee("Usage: cc-safety-net gui [--no-open]"),1}let ne=await Cy(c,A);if(V(`CC Safety Net policy GUI: ${ne.url}`),!q.flags.noOpen)try{await(A.openBrowser??Oy)(ne.url)}catch(ce){ee(`Failed to open browser: ${ce instanceof Error?ce.message:String(ce)}`),ee(`Open this URL manually: ${ne.url}`)}if(A.keepAlive===!1)return await ne.close(),0;return await $y(ne),0}async function Cy(P,A={}){let q=hy(24).toString("base64url"),V={dir:null,revision:0},ee=vy((he,ye)=>{Sy(P,he,ye,q,A,V)});await new Promise((he,ye)=>{ee.once("error",ye),ee.listen(0,"127.0.0.1",()=>{ee.off("error",ye),he()})});let ce=`http://127.0.0.1:${ee.address().port}`;return{origin:ce,token:q,url:`${ce}/?token=${encodeURIComponent(q)}`,close:()=>Iy(ee)}}async function Sy(P,A,q,V,ee,ne){let ce=P(),he=new URL(A.url??"/","http://127.0.0.1");if(A.method==="GET"&&he.pathname==="/favicon.ico"){q.writeHead(204,{"cache-control":"no-store"}),q.end();return}if(!Ay(A,he,V)){ht(q,403,{error:"Forbidden"});return}if(A.method==="GET"&&he.pathname==="/"){Ty(q,Gd(V));return}if(A.method==="GET"&&he.pathname==="/api/policy"){let ye=Gc(ce,ee),be=E(ce,Ni(ee));ht(q,200,{...ye,configState:Ne(be),...be.policyScopes?{projectPolicy:{path:b(ee.cwd??process.cwd()),weakenings:be.policyScopes.weakenings}}:{},destructiveCommandRules:G,secretPatterns:Ke,version:wt(),preview:ye.errors.length>0?null:Ae(ye.policy,ce.env)});return}if(A.method==="POST"&&he.pathname==="/api/policy/preview"){let ye=await tr(A);if(!ye.ok){ht(q,ye.status,{errors:[ye.error]});return}let be=Bc(ce,ye.value);ht(q,be.errors.length>0?400:200,be);return}if(A.method==="POST"&&he.pathname==="/api/policy/explain"){let ye=await tr(A);if(!ye.ok){ht(q,ye.status,{errors:[ye.error]});return}let be=ye.value;if(be===null||typeof be.command!=="string"){ht(q,400,{errors:["command must be a string"]});return}let xe=Yn(be.policy,ce.home);if(xe.length>0){ht(q,400,{errors:xe});return}ht(q,200,Ey(ce,be.command,be.policy,ee));return}if(A.method==="POST"&&he.pathname==="/api/policy"){let ye=await tr(A);if(!ye.ok){ht(q,ye.status,{errors:[ye.error]});return}let be=Vt(ce,ye.value,ee);ht(q,be.errors.length>0?400:200,be);return}if(A.method==="POST"&&he.pathname==="/api/reset"){ht(q,200,Vt(ce,X,ee));return}if(A.method==="POST"&&he.pathname==="/api/repair"){ht(q,200,qc(ce,ee));return}if(A.method==="POST"&&he.pathname==="/api/policy/project/choose-directory"){let ye=await(ee.chooseDirectory??Fi)();if("path"in ye)ne.dir=ye.path,ne.revision+=1;ht(q,200,{cancelled:"cancelled"in ye,..."error"in ye?{error:ye.error}:{}});return}if(A.method==="GET"&&he.pathname==="/api/policy/project"){let ye=Wd(ne,ee),be=Bd(ye,ce.home),xe=Xn(ce,ee);ht(q,200,{path:b(ye),revision:ne.revision,baseline:xe.baseline,userPolicyDiagnostics:xe.diagnostics,projection:be.projection,projectionDiagnostics:be.diagnostics,canPickDirectory:Oi(process.platform,process.env)});return}if(A.method==="POST"&&he.pathname==="/api/policy/project/diff"){let ye=await qd(ce,A,q,ne,ee);if(!ye)return;let be=Bd(ye.dir,ce.home),xe=Xn(ce,ee).baseline,Ie=Z(xe,ae(ye.proposal,ce.home).policy);ht(q,200,{rows:qr(Z(xe,be.projection).policy,Ie.policy,!1),weakenings:Ie.weakenings,existingFileDiagnostics:be.diagnostics});return}if(A.method==="POST"&&he.pathname==="/api/policy/project/apply"){let ye=await qd(ce,A,q,ne,ee);if(!ye)return;let be=Py(ye.dir,ye.proposal,ce.home);ht(q,be.errors.length>0?500:200,be);return}if(A.method==="GET"&&he.pathname==="/api/activity"){let ye=te(ce,ee),be=Dy(he.searchParams.get("days"),ye);if(be===null){ht(q,400,{error:`days must be an integer between 1 and ${ye}`});return}ht(q,200,Fd(ce,be,ee.activityLogsDir));return}if(A.method==="POST"&&he.pathname==="/api/rules/choose-directory"){ht(q,200,await Fi());return}if(A.method==="GET"&&he.pathname==="/api/rules"){let ye=Y(ce,Ni(ee)),be=new Map(ye.rules.map((xe)=>[xe.name,xe]));ht(q,200,{projectPath:ee.cwd??process.cwd(),canPickDirectory:Oi(process.platform,process.env),rulebooks:ye.rulebooks.map((xe)=>({source:xe.source,spec:xe.spec,name:xe.name,version:xe.version,rules:xe.rules.flatMap((Ie)=>{let Xe=be.get(Ie);if(!Xe)return[];return[{name:Xe.name,command:Xe.command,subcommand:Xe.subcommand,block_args:Xe.block_args,reason:Xe.reason}]})})),errors:ye.errors,warnings:ye.warnings});return}if(A.method==="GET"&&he.pathname==="/api/star/context"){ht(q,200,await(ee.fetchStarContext??(()=>Uy(ce,{logsDir:ee.activityLogsDir})))());return}if(A.method==="POST"&&he.pathname==="/api/star"){let ye=await(ee.starRepo??Fy)();ht(q,200,ye.ok?{ok:!0}:{ok:!1,fallbackUrl:Ly});return}if(A.method==="GET"&&he.pathname==="/api/integrations"){ht(q,200,await(ee.fetchIntegrations??(()=>Ny(ce)))());return}if(A.method==="GET"&&he.pathname==="/api/health"){ht(q,200,await(ee.fetchHealth??My)());return}if(A.method==="POST"&&(he.pathname==="/api/install"||he.pathname==="/api/uninstall")){let ye=await tr(A);if(!ye.ok){ht(q,ye.status,{errors:[ye.error]});return}let be=ye.value?.target;if(typeof be!=="string"||!Ht.some((Ie)=>Ie.target===be)){ht(q,400,{error:"unknown target"});return}let xe=he.pathname==="/api/install"?"install":"uninstall";ht(q,200,await(ee.runIntegration??Hy)(xe,be));return}ht(q,404,{error:"Not found"})}function Ni(P){return{...P,cwd:P.cwd??process.cwd()}}function Wd(P,A){return P.dir??A.cwd??process.cwd()}function Bd(P,A){let q=b(P),V=yy(q)?pn(q):{value:void 0,errors:[]},ee=ae(V.value,A);return{projection:ee.policy,diagnostics:[...V.errors,...ee.diagnostics]}}async function qd(P,A,q,V,ee){let ne=Wd(V,ee),ce=V.revision,he=await tr(A);if(!he.ok)return ht(q,he.status,{errors:[he.error]}),null;let ye=he.value;if(typeof ye?.revision!=="number")return ht(q,400,{errors:["revision must be a number"]}),null;if(ye.revision!==ce)return ht(q,409,{errors:[ky]}),null;let be=Ry(ye.proposal,P.home);if(be.length>0)return ht(q,400,{errors:be}),null;return{dir:ne,proposal:ye.proposal}}function Ry(P,A){let q=Yn(P,A);if(q.length>0)return q;return P?.audit===void 0?[]:[xy]}function Py(P,A,q){let V=b(P),ee=Vr(A,C(A,q));try{return g(i(v(P,"project policy"),V),`${JSON.stringify(ee,null,2)}
`),{path:V,errors:[]}}catch(ne){return{path:V,errors:[ne instanceof Error?ne.message:String(ne)]}}}function Ey(P,A,q,V){let ee=C(q,P.home),ne=E(P,Ni(V)),ce=Ee({rules:ne.policy.rules,transparentWrappers:ne.policy.transparentWrappers,safety:De(ee.safety),worktreeMode:ee.workflow.worktree_mode,destructiveCommandProtectionEnabled:ee.destructive_command_protection.enabled,destructiveCommandRuleOverrides:ee.destructive_command_protection.overrides,destructiveCommandAllowPaths:ee.destructive_command_protection.allow_paths,secretProtection:{enabled:ee.secret_protection.enabled,disabledRules:Oe(ee.secret_protection.overrides),denyPaths:ee.secret_protection.deny_paths,allowPaths:ee.secret_protection.allow_paths}});return qn(A,{policySnapshot:ce,cwd:V.cwd,userConfigDir:V.userConfigDir},P)}function Dy(P,A){if(P===null)return Math.min(wy,A);let q=Number(P);if(!Number.isInteger(q)||q<1||q>A)return null;return q}function Ay(P,A,q){if(A.searchParams.get("token")!==q)return!1;if(P.method!=="POST")return!0;return P.headers["x-cc-safety-net-token"]===q}var _y=1048576;async function tr(P){let A=[],q=0;for await(let V of P){let ee=V;if(q+=ee.byteLength,q>_y)return{ok:!1,status:413,error:"Request body is too large"};A.push(ee)}try{return{ok:!0,value:JSON.parse(Buffer.concat(A).toString("utf-8")||"{}")}}catch(V){return{ok:!1,status:400,error:`Invalid JSON: ${V instanceof Error?V.message:String(V)}`}}}function Ty(P,A){P.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}),P.end(A)}function ht(P,A,q){P.writeHead(A,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}),P.end(JSON.stringify(q))}function Iy(P){return new Promise((A,q)=>{P.close((V)=>V?q(V):A())})}function $y(P){return new Promise((A)=>{let q=()=>{process.off("SIGINT",V),process.off("SIGTERM",V)},V=()=>{q(),P.close().then(A)};process.once("SIGINT",V),process.once("SIGTERM",V)})}function Oy(P){let A=process.platform==="darwin"?"open":process.platform==="win32"?"cmd":"xdg-open",q=process.platform==="win32"?["/c","start","",P]:[P];return new Promise((V,ee)=>{let ne=zd(A,q,{detached:!0,stdio:"ignore"}),ce=(ye)=>{ne.off("spawn",he),ee(ye)},he=()=>{ne.off("error",ce),ne.unref(),V()};ne.once("error",ce),ne.once("spawn",he)})}async function Fy(P="gh",A=Mi){return{ok:await ji(P,["api","-X","PUT",`/user/starred/${oo}`],A)===0}}async function Ny(P,A={}){let q=await pr((ee)=>kn({environment:P,cwd:process.cwd(),openCodeVersion:ee}).status!=="n/a",A.fetcher),V=jy(P,q);return{targets:$t.map((ee)=>{let ne=V.find((ce)=>ce.platform===ee.id);return{target:ee.id,label:bt(ee.id),version:q.versions[ee.id]??null,status:ne?.configured?"active":ne?.detected?"disabled":ne?.inspectionStatus==="not-inspected"?"not-inspected":"not-installed"}}),system:{version:q.version,nodeVersion:q.nodeVersion,platform:q.platform}}}function jy(P,A){return xn(P,process.cwd(),{ampPluginListOutput:A.ampPluginListOutput,codexPluginListOutput:A.codexPluginListOutput,copilotCliVersion:A.versions["copilot-cli"],openCodeVersion:A.versions.opencode,openCodePluginListOutput:A.openCodePluginListOutput})}async function My(P={}){let A=await(P.checkUpdates??Wt)();return{update:{latestVersion:A.latestVersion??null,updateAvailable:A.updateAvailable}}}var Vd=Promise.resolve();function Hy(P,A,q={}){let V=async()=>{let ne=[],{log:ce,error:he}=console;console.log=(...ye)=>ne.push(ye.map(String).join(" ")),console.error=console.log;try{return{ok:await Kn(P,[],{selectTargets:async()=>[A],output:new by({write(be,xe,Ie){ne.push(String(be).replace(/\n$/,"")),Ie()}}),...q})===0,output:ne.join(`
`)}}finally{console.log=ce,console.error=he}},ee=Vd.then(V);return Vd=ee.then(()=>{return},()=>{return}),ee}async function Uy(P,A={}){let[q,V,ee]=await Promise.all([Gy(A.command),By(A.fetchRepo),Promise.resolve(ar(P,te(P),A.logsDir).totalBlocked)]);return{starred:q,starCount:V,blockedTotal:ee}}async function Gy(P="gh",A=Mi){if(await ji(P,["auth","status"],A)!==0)return null;let q=await ji(P,["api",`/user/starred/${oo}`],A);if(q===0)return!0;if(q===null)return null;return!1}function ji(P,A,q){return new Promise((V)=>{let ee=zd(P,A,{stdio:"ignore",windowsHide:!0}),ne=!1,ce=setTimeout(()=>{ee.kill(),he(null)},q),he=(ye)=>{if(ne)return;ne=!0,clearTimeout(ce),V(ye)};ee.once("error",()=>he(null)),ee.once("close",he)})}async function By(P=fetch){try{let A=await P(`https://api.github.com/repos/${oo}`,{headers:{accept:"application/vnd.github+json"},signal:AbortSignal.timeout(Mi)});if(!A.ok)return null;let q=await A.json();return typeof q.stargazers_count==="number"?q.stargazers_count:null}catch{return null}}function qy(P){if(P[0]!=="help")return!1;let A=P[1];if(!A)di(),process.exit(0);if(Vn(A))process.exit(0);console.error(`Unknown command: ${A}`),console.error("Run 'cc-safety-net --help' for available commands."),process.exit(1)}var Vy={hook:async()=>{console.error("hook requires exactly one integration flag. Try: cc-safety-net hook --kimi-code"),Vn("hook",console.error),process.exit(1)},install:async(P)=>{process.exit(await Kn("install",P))},update:async(P)=>{process.exit(await xi(P))},uninstall:async(P)=>{process.exit(await Kn("uninstall",P))},rule:async(P)=>{process.exit(await Id(c(),P))},policy:async(P)=>{process.exit(await Wc(c(),P))},status:async(P)=>{if(Ut(xt({label:"status"},P).errors))process.exit(1);Od(c())},statusline:async(P)=>{let A=xt({label:"statusline",booleans:{claudeCode:["-cc","--claude-code"]}},P);if(A.errors.length===0&&A.flags.claudeCode){await $i(c());return}if(Ut(A.errors),!A.flags.claudeCode)console.error("statusline requires --claude-code (-cc)");Vn("statusline",console.error),process.exit(1)},doctor:async(P)=>{let A=ni(P);if(!A)process.exit(1);let q=await Ll(c(),{json:A.json,skipUpdateCheck:A.skipUpdateCheck});process.exit(q)},logs:async(P)=>{process.exit(await Ji(c(),P))},gui:async(P)=>{process.exit(await Jd(P))},explain:async(P)=>{process.exit(await _l(c(),P))}};async function zy(P){let A=xt({label:"cc-safety-net",booleans:{version:["-V","--version"]},positionals:"list"},P);if(qy(P))return;let q=P[0],V=q?sr(q):void 0;if(A.help&&V&&V.name!=="rule")Vn(V.name),process.exit(0);if(!q||A.help&&!V)di(),process.exit(0);if(A.flags.version)$l(),process.exit(0);if(V){await Vy[V.name](P.slice(1));return}if(q==="--statusline"){await $i(c());return}console.error(q.startsWith("-")?`Unknown option: ${q}`:`Unknown command: ${q}`),console.error("Run 'cc-safety-net --help' for usage."),process.exit(1)}export{zy as runCli};
