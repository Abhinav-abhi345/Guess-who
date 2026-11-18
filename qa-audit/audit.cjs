const {chromium}=require('C:/Users/User/Downloads/api-flow/api-flow/.qa-tools/node_modules/playwright-core');
const fs=require('fs');
const path=require('path');
const out=__dirname; const evidence={tests:[],errors:[],requests:[]};
const record=(name,data)=>evidence.tests.push({name,...data});
(async()=>{
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 await context.route('**/*',async route=>{const r=route.request(); if(['DELETE','PUT','PATCH'].includes(r.method()))return route.abort(); return route.continue();});
 const page=await context.newPage();
 page.on('pageerror',e=>evidence.errors.push(e.message));
 page.on('dialog',async d=>{record('dialog',{message:d.message()}); await d.dismiss()});
 const shot=async(name,p=page)=>p.screenshot({path:path.join(out,'screenshots',name+'.png'),fullPage:true});
 for(const url of ['/','/guessWho.html','/admin.html','/adminDashboard.html','/viewDetails.html','/results.html']){
  const r=await page.goto('http://localhost:3000'+url); await page.waitForTimeout(400);
  record('desktop navigation',{url,status:r.status(),title:await page.title(),text:(await page.locator('body').innerText()).slice(0,800)});
  await shot(url==='/'?'main-desktop':url.slice(1,-5)+'-desktop');
 }
 await page.goto('http://localhost:3000/'); await page.click('#login');
 await page.fill('#username','QA_Audit_20261116'); await page.click('#login'); await page.waitForURL('**/guessWho.html'); record('login',{url:page.url(),username:await page.evaluate(()=>sessionStorage.username)});
 await page.goto('http://localhost:3000/admin.html'); await page.getByRole('button',{name:'Add Details',exact:true}).click(); record('add navigation',{url:page.url()});
 await page.click('#submit'); await page.fill('#name','QA_Audit_20261116'); await page.click('#submit'); await page.selectOption('#gender','male'); await page.click('#submit');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 await page.setInputFiles('#file',[{name:'qa1.png',mimeType:'image/png',buffer:png},{name:'qa2.png',mimeType:'image/png',buffer:png}]);
 await page.route('https://api.cloudinary.com/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({secure_url:'https://example.invalid/qa.png'})}));
 await page.route('https://guess-who-amw8.onrender.com/**',r=>{evidence.requests.push({url:r.request().url(),method:r.request().method(),body:r.request().postData()});return r.fulfill({status:400,contentType:'application/json',body:'{"message":"Missing data"}'});});
 await page.click('#submit'); await page.waitForTimeout(500); record('save rejected',{nameAfter:await page.inputValue('#name')}); await shot('save-error-cleared');
 await page.fill('#name','QA network failure'); await page.selectOption('#gender','male'); await page.setInputFiles('#file',[{name:'qa1.png',mimeType:'image/png',buffer:png},{name:'qa2.png',mimeType:'image/png',buffer:png}]);
 await page.route('https://api.cloudinary.com/**',r=>r.abort('failed')); await page.click('#submit'); await page.waitForTimeout(500); await shot('upload-network-error'); record('network failure UI',{text:await page.locator('body').innerText()});
 for(const url of ['/','/admin.html','/adminDashboard.html','/guessWho.html','/viewDetails.html','/results.html']){
  await page.setViewportSize({width:390,height:844}); await page.goto('http://localhost:3000'+url); await page.waitForTimeout(300); record('mobile',{url,...await page.evaluate(()=>({innerWidth,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,viewport:document.querySelector('meta[name=viewport]')?.content||null}))}); await shot(url==='/'?'main-mobile':url.slice(1,-5)+'-mobile');
 }
 await page.setViewportSize({width:1440,height:900});
 await page.route('https://guess-who-amw8.onrender.com/admin/results',r=>{evidence.requests.push({url:r.request().url(),method:r.request().method()});return r.fulfill({status:404,contentType:'text/html',body:'Not Found'});});
 await page.goto('http://localhost:3000/adminResults.html'); await page.waitForTimeout(500); await shot('admin-results-error');
 // All quiz mutations below target the isolated server, never port 3000.
 await page.goto('http://localhost:3002/guessWho.html');
 await page.evaluate(()=>{window.qaQuestions=[];socket.on('newQuestion',d=>qaQuestions.push(d));socket.emit('startQuiz')});
 await page.waitForFunction(()=>document.querySelectorAll('#options button').length===4);
 record('question answer disclosure',await page.evaluate(()=>({answer:qaQuestions[0].question.answer,correctInDOM:document.querySelector('[data-correct="true"]').innerText})));
 await shot('quiz-answer-desktop');
 await page.evaluate(()=>{socket.emit('submitAnswer',qaQuestions[0].question.answer);socket.emit('submitAnswer',qaQuestions[0].question.answer);socket.emit('submitAnswer',qaQuestions[0].question.answer)});
 await page.setViewportSize({width:390,height:844}); await page.click('[data-correct="true"]'); await shot('quiz-two-images-mobile'); record('quiz mobile',await page.evaluate(()=>({innerWidth,scroll:document.documentElement.scrollWidth,images:[...document.images].map(i=>({width:i.getBoundingClientRect().width,x:i.getBoundingClientRect().x}))})));
 await page.waitForTimeout(200); await shot('timer-no-progress');
 await page.setViewportSize({width:1440,height:900});
 await page.waitForURL('**/results.html',{timeout:140000}); record('completed quiz',{text:await page.locator('body').innerText()}); await shot('quiz-completed');
 await page.goto('http://localhost:3002/guessWho.html'); await page.evaluate(()=>{window.qaQuestions=[];socket.on('newQuestion',d=>qaQuestions.push(d));socket.emit('startQuiz')}); await page.waitForTimeout(500);
 record('late player / restart',{text:await page.locator('body').innerText()});
 // Browser-local synthetic report fixture: harmless HTML marker proves unsafe interpolation.
 await page.evaluate(()=>sessionStorage.setItem('quizResults',JSON.stringify({qa:{username:'<b id="qa-html-marker">QA HTML MARKUP</b>',score:1}})));
 await page.goto('http://localhost:3002/results.html'); record('report HTML injection',{htmlRendered:await page.locator('#qa-html-marker').count()}); await shot('report-html-injection');
 // Safe invalid requests: required fields omitted, therefore no writes.
 for(const body of [{},{answer:'QA'}]){const r=await fetch('http://localhost:3000/details',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});record('API missing fields',{status:r.status,body:await r.text()});}
 const r=await fetch('http://localhost:3000/admin/results');record('local admin results endpoint',{status:r.status});
 await browser.close(); fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(evidence,null,2));
})().catch(e=>{fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify({...evidence,fatal:e.stack},null,2));console.error(e);process.exitCode=1});
