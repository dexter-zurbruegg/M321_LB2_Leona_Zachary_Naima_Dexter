// Node 22+. Run one VM at a time after all nodes and all 3 PostgreSQL instances are healthy.
// Copy isolate-vm-test.sh to /home/ubuntu/m321-ha-20261024/isolate-vm.sh on the target.
// SSH key/agent access as ubuntu is required. Example: node scripts/cluster-failure-test.cjs 11
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const net=require('node:net');
const target=process.argv[2];
assert(['11','13','16','17'].includes(target));
const origins=['11','13','16','17'].map(n=>`http://10.4.31.${n}:30080`);
const survivor=origins.find(x=>!x.includes(`.${target}:`));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let token, user, start, isolated=false, writesDuringOutage=0;
const acknowledged=[], samples=[];
const api=async(origin,method,path,body)=>{
 const r=await fetch(origin+'/api'+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(6000)});
 const text=await r.text(); let data;try{data=JSON.parse(text);}catch{data=text;}
 if(!r.ok)throw new Error(`${method} ${path}: ${r.status}`);
 return data;
};
const ssh=command=>new Promise((resolve,reject)=>{const p=spawn('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=10','ubuntu@10.4.31.'+target,command],{stdio:['ignore','pipe','pipe']}); let out='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>out+=x);p.on('error',reject);p.on('close',c=>c?reject(new Error(out)):resolve(out));});
const reachable=()=>new Promise(resolve=>{const s=net.connect({host:'10.4.31.'+target,port:22}); const done=b=>{s.destroy();resolve(b);};s.setTimeout(800,()=>done(false));s.on('connect',()=>done(true));s.on('error',()=>done(false));});
(async()=>{
 try{
 const email=`ha-${target}-${Date.now()}@example.com`,password='HaTestOnly-'+Date.now();
 user=await api(survivor,'POST','/users',{email,password,displayName:'HA temporary test'});
 token=(await api(survivor,'POST','/auth/login',{email,password})).token;
 const category=await api(survivor,'POST','/categories',{name:'Baseline persisted'}); acknowledged.push(category.id);
 const todo=await api(survivor,'POST','/todos',{title:'HA persistence',categoryId:category.id});
 for(const origin of origins){assert.equal((await api(origin,'GET',`/todos/${todo.id}`)).title,'HA persistence');assert.ok(await api(origin,'GET','/stats'));}
 console.log('PRECHECK: same user/category/todo/statistics through all four VM addresses');
 console.log((await ssh('sudo sh /home/ubuntu/m321-ha-20261024/isolate-vm.sh')).trim());
 start=Date.now();
 for(let i=0;Date.now()-start<155000;i++){
 const t=Number(((Date.now()-start)/1000).toFixed(1));const up=await reachable();if(!up)isolated=true;
 try{
  const c=await api(survivor,'POST','/categories',{name:'Write '+i});acknowledged.push(c.id);
  assert.equal((await api(survivor,'GET',`/todos/${todo.id}`)).title,'HA persistence');
  await api(survivor,'GET','/stats');
  if(!up)writesDuringOutage++;
  samples.push({t,vmReachable:up,ok:true});console.log(`${t}s VM=${up?'up':'DOWN'} write/read/stats=OK`);
 }catch(e){samples.push({t,vmReachable:up,ok:false,error:e.message});console.log(`${t}s VM=${up?'up':'DOWN'} ${e.message}`);}
 await sleep(2000);
 }
 assert(isolated,'Network outage was not observed');
 assert(writesDuringOutage>0,'No complete operation succeeded while VM was isolated');
 assert(await reachable(),'VM did not return');
 for(const origin of origins){const rows=await api(origin,'GET','/categories');const ids=new Set(rows.map(c=>c.id));assert(acknowledged.every(id=>ids.has(id)),'An acknowledged write was lost');}
 console.log(`PASS: ${writesDuringOutage} full operations during outage; all ${acknowledged.length} acknowledged categories persisted on all endpoints`);
 }finally{
 fs.writeFileSync(`ha-vm-${target}.json`,JSON.stringify({target,isolated,writesDuringOutage,acknowledgedCount:acknowledged.length,samples},null,2));
 if(token)await api(survivor,'DELETE','/users/me').catch(e=>console.error('Test cleanup:',e.message));
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
