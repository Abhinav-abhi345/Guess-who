// Run: $env:PLAYWRIGHT_MODULE='<path to playwright-core>'; node qa-audit/regression.cjs
// All writes and quiz mutations target a synthetic fixture server, never port 3000.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const root = path.resolve(__dirname, '..');
const baseline = process.argv.includes('--baseline');
const runDir = fs.mkdtempSync(path.join(__dirname, baseline ? 'baseline-' : 'regression-'));
const shots = path.join(runDir, 'screenshots'); fs.mkdirSync(shots);
const port = Number(process.env.QA_PORT || 3197);
const base = `http://127.0.0.1:${port}`;
const duration = Number(process.env.QA_DURATION_MS || 1500);
const results = []; let browser, server; let logs='';
const hash = () => createHash('sha256').update(fs.readFileSync(path.join(root,'details.json'))).digest('hex');
const originalHash = hash();
const people = Array.from({length:4},(_,i)=>({id:i+1,answer:`QA Person ${i+1}`,gender:'female',image1:`${base}/next_9653622.png?person=${i+1}`,image2:`${base}/next_9653622.png?reveal=${i+1}`}));
fs.writeFileSync(path.join(runDir,'details.json'),JSON.stringify({details:people}));
let source = fs.readFileSync(path.join(root,'server.js'),'utf8');
if(baseline) source=source.replace('setTimeout(sendQuestion, 15000)',`setTimeout(sendQuestion, ${duration})`);
fs.writeFileSync(path.join(runDir,'server.js'),source);
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS',name)}catch(e){results.push({name,status:'FAIL',error:e.message});console.log('FAIL',name,e.message)}}
async function snap(p,name){await p.screenshot({path:path.join(shots,name+'.png'),fullPage:true})}
async function fill(p){await p.fill('#name','QA New Person');await p.selectOption('#gender','male');const buffer=fs.readFileSync(path.join(root,'public/next_9653622.png'));await p.setInputFiles('#file',[{name:'qa1.png',mimeType:'image/png',buffer},{name:'qa2.png',mimeType:'image/png',buffer}]);}
async function waitServer(){for(let i=0;i<80;i++){try{if((await fetch(base)).ok)return}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Fixture server did not start')}
async function startServer(){
 server=spawn(process.execPath,[path.join(runDir,'server.js')],{cwd:root,env:{...process.env,PORT:String(port),PUBLIC_DIR:path.join(root,'public'),DATA_FILE:path.join(runDir,'details.json'),RESULTS_FILE:path.join(runDir,'results.json'),QUESTION_DURATION_MS:String(duration)},stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
 // Never mistake another application on QA_PORT for this fixture server.
 await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(Error('Fixture server startup timed out')),8000);
  server.once('error',error=>{clearTimeout(timeout);reject(error)});
  server.once('exit',code=>{clearTimeout(timeout);reject(Error('Fixture server exited: '+code))});
  server.stdout.on('data',b=>{if(String(b).includes('Server running on port '+port)){clearTimeout(timeout);resolve()}});
 });
 await waitServer();
}
async function restartServer(){const previous=server;await new Promise(resolve=>{previous.once('exit',resolve);previous.kill()});await startServer()}
(async()=>{
 await startServer(); browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const unexpected=[];
 await context.route('**/*',route=>{const r=route.request();if(['DELETE','PUT','PATCH'].includes(r.method())){unexpected.push('Destructive request '+r.method());return route.abort()}if(!r.url().startsWith(base)&&!r.url().startsWith('data:')){unexpected.push('External request '+r.url());return route.abort()}return route.continue()});
 const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));const page=await context.newPage();page.on('dialog',d=>d.dismiss());
 if(!baseline){
  await check('Running backend protocol and frontend cache policy match',async()=>{const health=await fetch(base+'/health');assert.equal(health.status,200);assert.equal((await health.json()).protocolVersion,2);const script=await fetch(base+'/script.js');assert.equal(script.headers.get('cache-control'),'no-cache')});
  await check('Legacy question never renders NaN or selectable stale answers',async()=>{await page.goto(base+'/guessWho.html');await page.waitForFunction(()=>activeQuestion===null);await page.evaluate(()=>socket.emitEvent(['newQuestion',{time:15,question:{image1:'/next_9653622.png',options:['A','B','C','D']}}]));assert.equal(await page.locator('#timeText').innerText(),'0');assert.match(await page.locator('#gameStatus').innerText(),/server.*update/i);assert.equal(await page.locator('#options button').count(),0);assert.equal(await page.locator('a').count(),0);await snap(page,'legacy-backend-safe-state')});
  await check('Admin detects stale server and status sits below action buttons',async()=>{const p=await context.newPage();await p.route('**/health',r=>r.fulfill({status:404,body:'Old server'}));await p.goto(base+'/admin.html');await p.waitForFunction(()=>socket.connected);await p.click('.quiz-btn');await p.waitForFunction(()=>document.querySelector('#quizStatus').textContent.includes('server needs an update'));const bounds=await p.evaluate(()=>({status:document.querySelector('#quizStatus').getBoundingClientRect().top,buttons:document.querySelector('.button-container').getBoundingClientRect().bottom,style:getComputedStyle(document.querySelector('.nav-button')).borderRadius}));assert.ok(bounds.status>bounds.buttons);assert.notEqual(bounds.style,'0px');await snap(p,'admin-stale-server-message');await p.close()});
  await check('Each player independently shuffles the same options without mutating the question',async()=>{
   const players=await Promise.all([context.newPage(),context.newPage()]);
   try{
    const orders=[];
    const question={questionId:'qa-shuffle',deadline:Date.now()+15000,durationMs:15000,question:{image1:base+'/next_9653622.png',options:['Alpha','Bravo','Charlie','Delta']}};
    for(let i=0;i<players.length;i++){
     const p=players[i];await p.goto(base+'/guessWho.html');await p.waitForFunction(()=>activeQuestion===null);
     orders.push(await p.evaluate(({question,random})=>{
      const original=Math.random;
      try{Math.random=()=>random;socket.emitEvent(['newQuestion',question]);return {rendered:[...document.querySelectorAll('#options button')].map(b=>b.textContent),original:question.question.options};}
      finally{Math.random=original;}
     },{question,random:i===0?0:0.999}));
     await snap(p,'shuffle-player-'+(i+1));
    }
    assert.notDeepEqual(orders[0].rendered,orders[1].rendered);
    for(const order of orders){assert.deepEqual([...order.rendered].sort(),question.question.options);assert.deepEqual(order.original,question.question.options);}
   }finally{await Promise.all(players.map(p=>p.close()))}
  });
 }
 await check('QA-08 admin report navigation',async()=>{await page.goto(base+'/admin.html');assert.equal(await page.locator('a[href="adminResults.html"]').count(),1);await page.click('a[href="adminResults.html"]');assert.match(page.url(),/adminResults/);await snap(page,'admin-report-navigation')});
 await check('QA-06 local report endpoint and empty state',async()=>{const r=await fetch(base+'/admin/results');assert.equal(r.status,200);assert.deepEqual(await r.json(),[]);await page.goto(base+'/adminResults.html');await page.waitForFunction(()=>document.body.innerText.includes('No completed quizzes'));await snap(page,'reports-empty')});
 await check('QA-07 waiting state',async()=>{await page.goto(base+'/guessWho.html');await page.waitForFunction(()=>/waiting for/i.test(document.body.innerText),{},{timeout:1500});assert.equal(await page.locator('#options button').count(),0);await snap(page,'game-waiting')});
 await check('QA-10 usernames render as text',async()=>{await page.goto(base+'/');await page.evaluate(()=>sessionStorage.setItem('quizResults',JSON.stringify({qa:{username:'<b id="qa-html-marker">QA HTML</b>',score:1}})));await page.goto(base+'/results.html');assert.equal(await page.locator('#qa-html-marker').count(),0);assert.match(await page.locator('body').innerText(),/<b id=/);await snap(page,'results-escaped')});
 await check('QA-11 loaded images fit narrow viewport',async()=>{await page.setViewportSize({width:390,height:844});await page.goto(base+'/guessWho.html');if(!baseline)await page.waitForFunction(()=>activeQuestion===null);await page.evaluate(async()=>{document.querySelector('#imageContainer').hidden=false;for(const i of document.images){i.src='/next_9653622.png';i.hidden=false;i.style.display='block';await i.decode()}});const bounds=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,images:[...document.images].map(i=>({x:i.getBoundingClientRect().x,right:i.getBoundingClientRect().right,width:i.getBoundingClientRect().width}))}));assert.ok(bounds.scroll<=bounds.width,JSON.stringify(bounds));assert.ok(bounds.images.every(i=>i.width>0&&i.x>=0&&i.right<=bounds.width));await snap(page,'game-mobile-images');await page.setViewportSize({width:1440,height:900})});
 for(const mode of ['same-origin','save-error','upload-error'])await check({'same-origin':'QA-01 same-origin save','save-error':'QA-02 rejected save retains form','upload-error':'QA-03 upload failure visible and retryable'}[mode],async()=>{
  const p=await context.newPage();const dialogs=[];p.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss()});let saveURL;
  await p.route('https://api.cloudinary.com/**',r=>mode==='upload-error'?r.abort('failed'):r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({secure_url:base+'/next_9653622.png'})}));
  await p.route('**/details',r=>{if(r.request().method()!=='POST')return r.continue();saveURL=r.request().url();return r.fulfill({status:mode==='save-error'?400:201,contentType:'application/json',body:mode==='save-error'?'{"message":"QA save rejected"}':'{"message":"Data saved successfully"}'})});
  await p.goto(base+'/adminDashboard.html');await fill(p);await p.click('#submit');
  if(mode==='same-origin'){await p.waitForFunction(()=>document.querySelector('#name').value==='');assert.equal(saveURL,base+'/details')}
  else{await p.waitForTimeout(350);assert.equal(await p.inputValue('#name'),'QA New Person');assert.equal(await p.locator('#file').evaluate(e=>e.files.length),2);assert.match(await p.locator('body').innerText(),mode==='save-error'?/QA save rejected/:/upload.*failed|unable.*upload|failed to fetch/i);assert.equal(await p.locator('#submit').isEnabled(),true);assert.ok(!dialogs.includes('Person added successfully!'))}
  await snap(p,mode);await p.close();
 });
 await check('QA-04 question payload and DOM do not disclose answer',async()=>{
  await page.goto(base+'/guessWho.html');await page.evaluate(()=>{window.qaEvents=[];socket.on('newQuestion',d=>qaEvents.push(d));socket.emit('startQuiz')});await page.waitForFunction(()=>window.qaEvents.length>0);
  const event=await page.evaluate(()=>qaEvents[0]);assert.equal(event.question.answer,undefined);assert.equal(event.question.image2,undefined);assert.equal(await page.locator('[data-correct]').count(),0);assert.equal(await page.locator('#options button').count(),4);await snap(page,'question-no-disclosure');
  assert.equal(await page.locator('a').count(),0);assert.ok(await page.locator('#options button').first().isEnabled());
  await page.locator('#options button').first().click();await page.waitForFunction(()=>/Correct!|Answer recorded/.test(document.querySelector('#gameStatus').textContent));assert.equal(await page.locator('#photo2').isVisible(),true);await snap(page,'answer-selected');
  if(duration>=2500){await page.waitForTimeout(1150);const remaining=Number(await page.locator('#timeText').innerText());assert.ok(remaining<Math.ceil(duration/1000)&&remaining>0);assert.ok(Number(await page.locator('.progress').evaluate(e=>e.style.strokeDashoffset))>0);await snap(page,'timer-progress');}
  await page.waitForURL('**/results.html',{timeout:duration*7+8000});
 });
 await check('QA-09 one score per question and completed report',async()=>{
  // Fresh socket/round; do not reuse any submission from another case.
  await page.goto(base+'/guessWho.html');await page.evaluate(()=>{window.qaEvents=[];socket.on('newQuestion',d=>qaEvents.push(d));socket.emit('startQuiz')});await page.waitForFunction(()=>window.qaEvents.length>0);
  await page.evaluate(()=>{const q=qaEvents[0];const n=new URL(q.question.image1).searchParams.get('person');const answer='QA Person '+n;for(let i=0;i<4;i++)socket.emit('submitAnswer',q.questionId?{questionId:q.questionId,answer}:answer)});
  await page.waitForURL('**/results.html',{timeout:duration*7+8000});const report=await page.evaluate(()=>JSON.parse(sessionStorage.quizResults));const user=Object.values(report).find(u=>u.username==='Guest');assert.equal(user?.score,1);await snap(page,'quiz-one-point-results');
  const r=await fetch(base+'/admin/results');assert.equal(r.status,200);const history=await r.json();assert.ok(history.length>=1);assert.equal(Object.values(history.at(-1).results).find(u=>u.username==='Guest').score,1);
 });
 await check('QA-05 server rejects invalid fields without writes',async()=>{const before=fs.readFileSync(path.join(runDir,'details.json'),'utf8');for(const body of [{},{answer:'   ',image1:'not-a-url',image2:123,gender:'invalid'},null,[],{answer:'QA',image1:'javascript:alert(1)',image2:base+'/a',gender:'male'}]){const r=await fetch(base+'/details',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,400);assert.match(r.headers.get('content-type'),/json/)}assert.equal(fs.readFileSync(path.join(runDir,'details.json'),'utf8'),before)});
 if(!baseline && results.every(r=>r.status==='PASS')) await extended({context,page,runDir,base,people,snap,check,duration,fill,restartServer});
 await check('No unexpected external/destructive requests or JS errors',async()=>{assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[])});
 fs.writeFileSync(path.join(runDir,'server.log'),logs);
})().catch(e=>{results.push({name:'harness',status:'FAIL',error:e.stack});console.error(e)}).finally(async()=>{
 if(browser)await browser.close();if(server)server.kill();
 fs.writeFileSync(path.join(runDir,'server.log'),logs);
 const summary={baseline,questionDurationMs:duration,results,originalDataUnchanged:hash()===originalHash,originalDataSha256:originalHash};
 fs.writeFileSync(path.join(runDir,'results.json-summary'),JSON.stringify(summary,null,2));
 fs.writeFileSync(path.join(__dirname,baseline?'BASELINE.json':'REGRESSION.json'),JSON.stringify({...summary,artifacts:path.relative(root,runDir)},null,2));
 console.log('Artifacts:',runDir);console.log(`${results.filter(r=>r.status==='PASS').length}/${results.length} passed`);process.exitCode=results.some(r=>r.status==='FAIL')||!summary.originalDataUnchanged?1:0;
});

async function extended({context,page,runDir,base,people,snap,check,duration,fill,restartServer}){
 const jsonPost=body=>fetch(base+'/details',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 await check('HTTP malformed JSON, oversized body, URL schemes and types',async()=>{
  for(const [body,expected] of [['{',400],['null',400],['"string"',400],['{"answer":"'+'a'.repeat(40000)+'"}',413]]){
   const response=await fetch(base+'/details',{method:'POST',headers:{'Content-Type':'application/json'},body});assert.equal(response.status,expected);const data=await response.json();assert.ok(data.message);assert.ok(!JSON.stringify(data).includes('server.js'));
  }
  for(const change of [{answer:1},{answer:'a'.repeat(121)},{gender:{}},{image1:'data:image/png;base64,AAA'},{image1:'file:///C:/test.png'},{image2:'https://user:pass@example.com/a.png'},{image2:[]},{image2:' https://example.com/a.png'}])assert.equal((await jsonPost({...people[0],...change})).status,400);
 });
 await check('Keyboard login, empty validation and username persistence',async()=>{
  await page.goto(base+'/');await page.click('#login');assert.match(await page.locator('body').innerText(),/Please enter a username/);
  await page.fill('#username','QA Keyboard User');await page.press('#username','Enter');await page.waitForURL('**/guessWho.html');assert.equal(await page.evaluate(()=>sessionStorage.username),'QA Keyboard User');await snap(page,'keyboard-login');
 });
 await check('Form validation, upload response validation and recovery',async()=>{
  const p=await context.newPage();await p.goto(base+'/adminDashboard.html');
  await p.click('#submit');assert.match(await p.locator('#saveStatus').innerText(),/name/);await p.fill('#name','  ');await p.click('#submit');assert.match(await p.locator('#saveStatus').innerText(),/name/);
  await p.fill('#name','QA Validation');await p.click('#submit');assert.match(await p.locator('#saveStatus').innerText(),/gender/);await p.selectOption('#gender','male');await p.click('#submit');assert.match(await p.locator('#saveStatus').innerText(),/exactly 2/);
  await fill(p);let fail=true;
  await p.route('https://api.cloudinary.com/**',r=>r.fulfill({status:fail?400:200,contentType:'application/json',body:fail?'{"error":{"message":"Rejected"}}':JSON.stringify({secure_url:base+'/next_9653622.png'})}));
  await p.click('#submit');await p.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('upload failed'));assert.equal(await p.inputValue('#name'),'QA New Person');assert.ok(await p.locator('#submit').isEnabled());
  fail=false;await p.click('#submit');await p.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('successfully'));assert.equal(await p.inputValue('#name'),'');
  const records=await (await fetch(base+'/details')).json();assert.equal(records.filter(r=>r.answer==='QA New Person').length,1);
  await p.goto(base+'/viewDetails.html');await p.waitForSelector('.card');assert.equal(await p.locator('.card').count(),5);assert.match(await p.locator('body').innerText(),/QA New Person/);await snap(p,'saved-person-list');await p.close();
 });
 await check('Upload invalid JSON, missing URL and unsafe URL have visible errors',async()=>{
  const p=await context.newPage();await p.goto(base+'/adminDashboard.html');await fill(p);let body='not JSON';
  await p.route('https://api.cloudinary.com/**',r=>r.fulfill({status:200,contentType:'application/json',body}));
  for(const value of ['not JSON','{}','{"secure_url":"javascript:alert(1)"}']){body=value;await p.click('#submit');await p.waitForFunction(()=>!document.querySelector('#submit').disabled);assert.equal(await p.inputValue('#name'),'QA New Person');assert.match(await p.locator('#saveStatus').innerText(),/failed|invalid image URL/)}await snap(p,'invalid-upload-recovery');await p.close();
 });
 await check('Upload file count, type and size validation makes no request',async()=>{
  const p=await context.newPage();let uploads=0;await p.route('https://api.cloudinary.com/**',r=>{uploads++;return r.abort()});await p.goto(base+'/adminDashboard.html');await p.fill('#name','QA Files');await p.selectOption('#gender','male');
  const png={name:'qa.png',mimeType:'image/png',buffer:fs.readFileSync(path.join(root,'public/next_9653622.png'))};
  for(const files of [[png],[png,png,png]]){await p.setInputFiles('#file',files);await p.click('#submit');assert.match(await p.locator('#saveStatus').innerText(),/exactly 2/)}
  for(const files of [[png,{name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('QA')}],[png,{name:'large.png',mimeType:'image/png',buffer:Buffer.alloc(10*1024*1024+1)}]]){await p.setInputFiles('#file',files);await p.click('#submit');assert.match(await p.locator('#saveStatus').innerText(),/PNG or JPEG.*10 MB/)}
  assert.equal(uploads,0);await p.close();
 });
 await check('Concurrent form submission sends only one save',async()=>{
  const p=await context.newPage();let release;const gate=new Promise(resolve=>release=resolve);let uploads=0,saves=0;
  await p.route('https://api.cloudinary.com/**',async r=>{uploads++;await gate;return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({secure_url:base+'/next_9653622.png'})})});
  await p.route('**/details',r=>{saves++;return r.fulfill({status:201,contentType:'application/json',body:'{"message":"Data saved successfully"}'})});await p.goto(base+'/adminDashboard.html');await fill(p);await p.click('#submit');assert.ok(await p.locator('#submit').isDisabled());assert.ok(await p.locator('#name').isDisabled());await p.evaluate(()=>document.querySelector('#upload').requestSubmit());release();await p.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('successfully'));assert.equal(uploads,2);assert.equal(saves,1);await p.close();
 });
 await check('Reports and details HTTP failure, retry, malformed data',async()=>{
  const p=await context.newPage();let fail=true;
  await p.route('**/admin/results',r=>fail?r.fulfill({status:503,contentType:'text/html',body:'Unavailable'}):r.continue());await p.goto(base+'/adminResults.html');await p.waitForFunction(()=>document.querySelector('#reportStatus').textContent.includes('Unable'));assert.equal(await p.locator('#resultsBody tr').count(),0);await snap(p,'report-error');fail=false;await p.click('#refreshResults');await p.waitForFunction(()=>document.querySelector('#reportStatus').textContent.includes('completed quiz report'));assert.ok(await p.locator('#resultsBody tr').count());
  let bad=true;await p.route('**/details',r=>bad?r.fulfill({status:500,body:'error'}):r.continue());await p.goto(base+'/viewDetails.html');await p.waitForFunction(()=>document.querySelector('#detailsStatus').textContent.includes('Unable'));bad=false;await p.click('#retryDetails');await p.waitForSelector('.card');assert.equal(await p.locator('.card').count(),5);
  await p.route('**/admin/results',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));await p.goto(base+'/adminResults.html');await p.waitForFunction(()=>document.querySelector('#reportStatus').textContent.includes('Invalid results format'));await p.close();
 });
 await check('Report fixtures: malicious names, corrupted storage, empty state',async()=>{
  await page.goto(base+'/');await page.evaluate(()=>sessionStorage.setItem('quizResults','{'));await page.goto(base+'/results.html');assert.match(await page.locator('#reportStatus').innerText(),/Unable to load/);
  await page.evaluate(()=>sessionStorage.removeItem('quizResults'));await page.reload();assert.match(await page.locator('#reportStatus').innerText(),/No quiz results/);
  const p=await context.newPage();await p.route('**/admin/results',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{completedAt:new Date().toISOString(),results:{qa:{username:'<img id="qa-injection" src=x onerror="window.qaInjected=1">',score:2}}}])}));await p.goto(base+'/adminResults.html');await p.waitForSelector('#resultsBody tr');assert.equal(await p.locator('#qa-injection').count(),0);assert.equal(await p.evaluate(()=>window.qaInjected),undefined);await snap(p,'admin-report-escaped');await p.close();
 });
 await check('Socket security: invalid, stale, duplicate, late, unregistered answers',async()=>{
  await page.goto(base+'/guessWho.html');await page.evaluate(()=>{window.qaEvents=[];socket.on('newQuestion',q=>qaEvents.push(q));socket.emit('startQuiz')});await page.waitForFunction(()=>qaEvents.length>0);
  const replies=await page.evaluate(async()=>{
   const send=(event,data)=>new Promise(resolve=>socket.timeout(2000).emit(event,data,(error,response)=>resolve(error?{error:error.message}:response)));
   const first=qaEvents[0];const person=new URL(first.question.image1).searchParams.get('person');const correct=person?'QA Person '+person:'QA New Person';
   const invalid=await send('submitAnswer',{questionId:first.questionId,answer:'not an option'});
   const legacy=await send('submitAnswer',correct);
   const stale=await send('submitAnswer',{questionId:'old-question',answer:correct});
   const wrong=first.question.options.find(a=>a!==correct);
   const accepted=await send('submitAnswer',{questionId:first.questionId,answer:wrong});
   const duplicate=await send('submitAnswer',{questionId:first.questionId,answer:correct});
   const restart=await new Promise(resolve=>socket.emit('startQuiz',resolve));
   const outsider=io();await new Promise(resolve=>outsider.on('connect',resolve));
   const unauth=await new Promise(resolve=>outsider.emit('submitAnswer',{questionId:first.questionId,answer:correct},resolve));outsider.disconnect();
   return {invalid,legacy,stale,accepted,duplicate,restart,unauth,first};
  });
  for(const key of ['invalid','legacy','stale','duplicate','restart','unauth'])assert.equal(replies[key].ok,false,key);assert.equal(replies.accepted.ok,true);assert.equal(replies.accepted.correct,false);
  await page.waitForFunction(()=>qaEvents.length>=2);const replay=await page.evaluate(q=>new Promise(resolve=>socket.emit('submitAnswer',{questionId:q.questionId,answer:q.question.options[0]},resolve)),replies.first);assert.equal(replay.ok,false);
  await page.waitForURL('**/results.html',{timeout:duration*8+8000});const late=await page.evaluate(async base=>{
   // Reports do not create a socket themselves; load the same-origin client explicitly.
   await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=base+'/socket.io/socket.io.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s)});
   const s=io();await new Promise(resolve=>s.on('connect',resolve));const response=await new Promise(resolve=>s.emit('submitAnswer',{questionId:'ended',answer:'anything'},resolve));s.disconnect();return response;
  },base);assert.equal(late.ok,false);await snap(page,'security-round-results');
 });
 await check('New quiz resets scores; late join and reconnect receive current question',async()=>{
  await page.goto(base+'/guessWho.html');await page.evaluate(()=>{window.qaEvents=[];socket.on('newQuestion',q=>qaEvents.push(q));socket.emit('startQuiz')});await page.waitForFunction(()=>qaEvents.length>0);
  const late=await context.newPage();await late.goto(base+'/guessWho.html');await late.waitForSelector('#options button');assert.equal(await late.locator('#options button').count(),4);const id=await late.evaluate(()=>activeQuestion);
  await late.evaluate(()=>socket.disconnect());assert.match(await late.locator('#gameStatus').innerText(),/Disconnected/);await late.evaluate(()=>socket.connect());await late.waitForFunction(()=>socket.connected && document.querySelectorAll('#options button').length===4);assert.ok(await late.evaluate(()=>activeQuestion));await snap(late,'late-join-reconnected');await late.close();
  await page.waitForURL('**/results.html',{timeout:duration*8+8000});const report=await page.evaluate(()=>JSON.parse(sessionStorage.quizResults));assert.ok(Object.values(report).every(u=>u.score===0));
 });
 await check('Report persistence survives server restart',async()=>{
  const before=await (await fetch(base+'/admin/results')).json();assert.ok(before.length>=4);await page.goto(base+'/');await restartServer();assert.deepEqual(await (await fetch(base+'/admin/results')).json(),before);await page.goto(base+'/adminResults.html');await page.waitForSelector('#resultsBody tr');await snap(page,'reports-after-restart');
 });
 await check('Insufficient data and storage errors are visible without data loss',async()=>{
  const filename=path.join(runDir,'details.json');const original=fs.readFileSync(filename,'utf8');
  try{
   fs.writeFileSync(filename,JSON.stringify({details:people.slice(0,3)}));await page.goto(base+'/admin.html');await page.waitForFunction(()=>socket.connected);await page.click('.quiz-btn');await page.waitForFunction(()=>document.querySelector('#quizStatus').textContent.includes('at least 4'));await snap(page,'insufficient-data');
   fs.writeFileSync(filename,'invalid JSON');const response=await fetch(base+'/details');assert.equal(response.status,500);const body=await response.json();assert.ok(!JSON.stringify(body).includes('server.js'));await page.goto(base+'/viewDetails.html');await page.waitForFunction(()=>document.querySelector('#detailsStatus').textContent.includes('Unable'));
  }finally{fs.writeFileSync(filename,original)}
 });
 await check('Desktop/tablet/mobile navigation and overflow (320/390/768/1440)',async()=>{
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});for(const route of ['/','/admin.html','/adminDashboard.html','/guessWho.html','/viewDetails.html','/results.html','/adminResults.html']){
   const response=await page.goto(base+route);assert.equal(response.status(),200);await page.waitForTimeout(60);assert.equal(await page.locator('meta[name="viewport"]').count(),1,route);
   const bounds=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(bounds.scroll<=bounds.width,`${route} at ${width}: ${JSON.stringify(bounds)}`);
   if(width===320||width===1440)await snap(page,`${route==='/'?'main':route.slice(1,-5)}-${width}`);
  }}
 });
}
