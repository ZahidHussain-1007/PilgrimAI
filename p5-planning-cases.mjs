/* Live A–G behavior against real catalog, Next API and provider adapters.
   Separate pytest fixtures exercise missing PRIMARY hours and locatable hotels.
   No fake data is injected into production records or API responses. */
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_IMPORT||'playwright');
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1568,height:882}}),page=await ctx.newPage();
const base=process.env.PILGRIM_BASE_URL||'http://127.0.0.1:3100';
const source=JSON.parse(await fs.readFile('shots/p5-v21-original-result.json','utf8')).request;
const cases=[
 ['A',{days:1,include_attractions:false,stay:'none'}],
 ['B',{}],
 ['C',{stay_mode:'overnight'}],
 ['D',{temple_ids:['T0001','T0006'],days:1,include_attractions:false}],
 ['E',{elderly:1,adults:2,special:'elder',rest_minutes:30,avoid_climbing:true}],
 ['F',{days:1,include_attractions:false,budget_cap:100}],
 ['G',{days:1,food:'jain'}],
];
const results=[];
try{
 await page.goto(base+'/itinerary');
 for(const [name,updates] of cases){
  const res=await page.request.post(base+'/api/planning/jobs',{data:{...source,...updates}});
  if(res.status()!==202)throw new Error(name+': '+await res.text());
  let job=await res.json();
  for(let n=0;n<100&&['queued','running'].includes(job.status);n++){
   await page.waitForTimeout(1000);job=await(await page.request.get(base+'/api/planning/jobs/'+job.id)).json();
  }
  const r=job.result;if(!r)throw new Error(name+': no result '+JSON.stringify(job));
  const codes=r.conflicts.map(c=>c.code),actual=r.days.flatMap(d=>d.items).filter(i=>i.type==='visit');
  let pass;
  if(name==='A')pass=job.status==='completed'&&actual.some(i=>i.place_id==='T0001')&&r.days.length===1;
  if(name==='B')pass=job.status==='completed'&&r.days.every(d=>d.items.some(i=>i.type==='visit'))&&r.budget.items.filter(e=>e.category==='stay').every(e=>e.high===0);
  if(name==='C')pass=job.status==='needs_changes'&&codes.includes('HOTEL_REQUIREMENTS_UNVERIFIED');
  if(name==='D')pass=job.status==='needs_changes'&&r.alternatives.some(a=>a.checked_feasible&&a.checked_days.flatMap(d=>d.items).filter(i=>i.type==='visit').some(i=>i.place_id==='T0006'));
  if(name==='E')pass=r.days.every(d=>d.items.some(i=>i.type==='visit'))&&actual.every(i=>i.duration_minutes>=95)&&!r.attractions.some(a=>a.classification==='scheduled'&&['climbing','assisted_access'].includes(a.effort));
  if(name==='F')pass=job.status==='needs_changes'&&codes.includes('PRICED_COSTS_EXCEED_CAP')&&r.budget.within_cap===false;
  if(name==='G')pass=job.status==='needs_changes'&&r.budget.missing.includes('food')&&r.attractions.some(a=>a.reason==='coordinates_or_hours_missing'&&a.classification!=='scheduled');
  const row={case:name,pass:!!pass,status:job.status,codes,dates:r.days.map(d=>d.date),visits:actual.map(i=>({id:i.place_id,start:i.start,end:i.end})),budget:{low:r.budget.low,high:r.budget.high,missing:r.budget.missing},alternatives:r.alternatives.map(a=>({action:a.action,days:a.suggested_days,checked_feasible:a.checked_feasible}))};
  results.push(row);console.log(`${pass?'PASS':'FAIL'} case ${name} ${JSON.stringify(row)}`);
  await fs.writeFile('shots/p5-v21-case-'+name+'.json',JSON.stringify(job,null,2));
  if(['D','E','F','G'].includes(name)){
    await page.goto(base+'/itinerary/'+job.id);await page.locator('[data-itinerary-workspace]').waitFor();
    await page.screenshot({path:'shots/p5-v21-case-'+name+'.png',fullPage:true});
  }
 }
}catch(e){results.push({case:'flow',pass:false,error:String(e)});console.error(e);}
finally{await fs.writeFile('shots/p5-v21-live-cases.json',JSON.stringify(results,null,2));await browser.close();}
if(results.some(r=>!r.pass))process.exitCode=1;
