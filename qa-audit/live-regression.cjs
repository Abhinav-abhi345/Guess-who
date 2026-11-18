// Explicit live verification: creates one additive quiz report on localhost:3000.
// Never creates/deletes people or sends destructive requests.
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(__dirname, 'live-'));
const base = 'http://localhost:3000';
const digest = () => createHash('sha256').update(fs.readFileSync(path.join(root,'details.json'))).digest('hex');
const before = digest();
const username = 'QA Live Regression 20261117';
const summary = { base, username, checks: [] };
let browser;
async function capture(page,name){await page.screenshot({path:path.join(out,name+'.png'),fullPage:true})}
(async()=>{
 const health = await fetch(base+'/health');assert.equal(health.status,200);assert.equal((await health.json()).protocolVersion,2);
 const people = await (await fetch(base+'/details')).json();
 const previous = await (await fetch(base+'/admin/results')).json();
 browser = await chromium.launch();const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const blocked=[];const errors=[];
 await context.route('**/*',route=>{const req=route.request();if(['DELETE','PUT','PATCH'].includes(req.method())||(!req.url().startsWith(base)&&req.method()!=='GET')){blocked.push(req.method()+' '+req.url());return route.abort()}return route.continue()});
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 const game=await context.newPage();await game.goto(base+'/');await game.fill('#username',username);await game.press('#username','Enter');await game.waitForURL('**/guessWho.html');await game.waitForFunction(()=>activeQuestion===null);
 const admin=await context.newPage();await admin.goto(base+'/admin.html');await admin.waitForFunction(()=>socket.connected);await capture(admin,'admin-ready');await admin.click('.quiz-btn');
 await game.waitForSelector('#options button');assert.ok(await game.locator('#options button').first().isEnabled());assert.equal(await game.locator('a').count(),0);assert.ok(Number.isFinite(Number(await game.locator('#timeText').innerText())));
 await game.waitForTimeout(1150);const remaining=Number(await game.locator('#timeText').innerText());assert.ok(remaining>0&&remaining<15);await capture(game,'game-active');
 await game.locator('#options button').first().click();await game.waitForFunction(()=>/Correct!|Answer recorded/.test(document.querySelector('#gameStatus').textContent));await capture(game,'answer-recorded');await capture(admin,'admin-started');
 summary.checks.push('Actual localhost backend protocol and report endpoint','Login to game','Finite countdown decreases from 15','Answer options enabled before selection','Answer accepted and acknowledged','No in-game Login link','Admin start acknowledged');
 await game.waitForURL('**/results.html',{timeout:people.length*15000+30000});assert.match(await game.locator('body').innerText(),new RegExp(username));await capture(game,'player-results');
 await admin.click('a[href="adminResults.html"]');await admin.waitForSelector('#resultsBody tr');assert.match(await admin.locator('body').innerText(),new RegExp(username));await capture(admin,'admin-results');
 const reports = await (await fetch(base+'/admin/results')).json();assert.equal(reports.length,previous.length+1);assert.ok(Object.values(reports.at(-1).results).some(p=>p.username===username));
 await admin.goto(base+'/viewDetails.html');await admin.waitForSelector('.card');await capture(admin,'details-buttons');
 await admin.setViewportSize({width:390,height:844});await admin.goto(base+'/admin.html');await capture(admin,'admin-mobile');
 assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);assert.equal(digest(),before);
 summary.checks.push('Automatic quiz-to-results redirect','Admin report includes live player','One additive report persisted','Original people data unchanged','No destructive requests or JS errors');summary.status='PASS';
})().catch(error=>{summary.status='FAIL';summary.error=error.stack;console.error(error)}).finally(async()=>{
 if(browser)await browser.close();summary.originalDataUnchanged=digest()===before;summary.artifacts=path.relative(root,out);fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));fs.writeFileSync(path.join(__dirname,'LIVE-REGRESSION.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));process.exitCode=summary.status==='PASS'?0:1;
});
