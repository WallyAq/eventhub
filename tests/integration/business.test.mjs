import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const base=process.env.EVENTHUB_URL || 'http://127.0.0.1:8080';
const docker=(...args)=>execFileSync('docker',['compose',...args],{encoding:'utf8',timeout:90000,stdio:['ignore','pipe','pipe']});
async function call(path,token,method='GET',body,key){
  const response=await fetch(base+'/api'+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...(key?{'idempotency-key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  return {status:response.status,body:await response.json()};
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function eventually(fn){for(let i=0;i<20;i++){if(await fn())return;await pause(1000);}assert.fail('O estado esperado não foi alcançado.');}

test('business rules: ownership, concurrency, payment, expiry, cancellation, outbox and recovery', {timeout:240000},async t=>{
  const suffix=randomUUID();
  async function account(label){const email='qa-business-'+label+'-'+suffix+'@example.test';assert.equal((await call('/auth/register',null,'POST',{name:'Pessoa QA '+label,email,password:'Teste123'})).status,201);const login=await call('/auth/login',null,'POST',{email,password:'Teste123'});assert.equal(login.status,200);return {email,token:login.body.accessToken,id:login.body.user.id};}
  const owner=await account('owner'),a=await account('a'),b=await account('b'),outsider=await account('outsider');
  const org=await call('/organizations',owner.token,'POST',{name:'Instituto QA '+suffix});assert.equal(org.status,201);
  const startsAt=new Date(Date.now()+86400000).toISOString(),endsAt=new Date(Date.now()+2*86400000).toISOString();
  const activity=(title,priceCents=0)=>({title,startsAt,endsAt,location:'Sala QA',responsible:'Docente QA',capacity:1,priceCents});
  const payload={organizationId:org.body.organization.id,title:'Evento QA '+suffix,description:'Evento de validação integrado com dados sintéticos.',category:'Simpósio',hours:8,modality:'Presencial',location:'Campus QA',streamUrl:'',startsAt,endsAt,sessionTime:'BRT',featured:true,speakers:[{name:'Docente QA',institution:'UECE'}],activities:[activity('Última vaga'),activity('Pagamento aprovado',5000),activity('Pagamento recusado',5000),activity('Reserva expirada',5000),activity('Falha de notificação'),activity('Cancelamento do evento')]};
  assert.equal((await call('/events',outsider.token,'POST',payload)).status,404);
  assert.equal((await call('/events',owner.token,'POST',{...payload,activities:[{...activity('Inválida'),capacity:0}]})).status,422);
  const created=await call('/events',owner.token,'POST',payload);assert.equal(created.status,201,JSON.stringify(created.body));const event=created.body.event;
  assert.equal((await call('/events/'+event.id,outsider.token)).status,404);
  assert.equal((await call('/events?managed=true',outsider.token)).body.events.some(item=>item.id===event.id),false);
  assert.equal((await call('/events/'+event.id+'/publish',owner.token,'POST',{})).status,200);
  assert.equal((await call('/events/'+event.id,owner.token,'PUT',payload)).status,409);
  assert.equal((await call('/events')).body.events.some(item=>item.id===event.id),true);
  const reserve=(who,index,key=randomUUID())=>call('/registrations',who.token,'POST',{eventId:event.id,activityId:event.activities[index].id},key);

  await t.test('RN01: concurrent last seat, duplicate protection and ordered waitlist promotion',async()=>{
    const results=await Promise.all(Array.from({length:12},(_,i)=>reserve(i%2?a:b,0)));
    const created=results.filter(result=>result.status===201),duplicates=results.filter(result=>result.status===409);
    assert.equal(created.length,2,JSON.stringify(results));assert.equal(duplicates.length,10,JSON.stringify(results));
    for(const result of duplicates)assert.equal(result.body.detail,'Você já está inscrito nesta atividade.');
    const unique=[...new Map(created.map(result=>[result.body.registration.id,result.body.registration])).values()];
    assert.equal(unique.length,2);assert.equal(unique.filter(item=>item.status==='CONFIRMED').length,1);assert.equal(unique.filter(item=>item.status==='WAITLISTED').length,1);
    assert.deepEqual(unique.map(item=>item.userId).sort(),[a.id,b.id].sort());
    const stored=(await Promise.all([a,b].map(who=>call('/registrations',who.token)))).flatMap(result=>{assert.equal(result.status,200);return result.body.registrations.filter(item=>item.activityId===event.activities[0].id);});
    assert.deepEqual(stored.map(item=>item.id).sort(),unique.map(item=>item.id).sort());
    const confirmed=unique.find(item=>item.status==='CONFIRMED'),waiting=unique.find(item=>item.status==='WAITLISTED');
    const user=confirmed.userId===a.id?a:b,waiter=waiting.userId===a.id?a:b;
    assert.equal((await call('/registrations/'+confirmed.id,outsider.token)).status,404);
    assert.equal((await call('/registrations/'+confirmed.id+'/cancel',user.token,'POST',{})).body.registration.status,'CANCELLED');
    assert.equal((await call('/registrations/'+waiting.id,waiter.token)).body.registration.status,'CONFIRMED');
  });
  await t.test('RN02: paid registration confirms only after approval; payment retries are idempotent',async()=>{
    const key=randomUUID(),r=(await reserve(a,1,key)).body.registration;
    assert.equal(r.status,'PENDING_PAYMENT');assert.equal((await reserve(a,1,key)).body.registration.id,r.id);
    const duplicate=await reserve(a,1);assert.equal(duplicate.status,409);assert.match(duplicate.body.detail,/já está inscrito/);
    const wrong=await call('/payments/'+r.id,outsider.token,'POST',{outcome:'APPROVED'});assert.equal(wrong.status,404);
    const results=await Promise.all([1,2,3].map(()=>call('/payments/'+r.id,a.token,'POST',{outcome:'APPROVED'})));
    for(const result of results)assert.equal(result.body.payment.status,'APPROVED',JSON.stringify(result.body));
    assert.equal((await call('/registrations/'+r.id,a.token)).body.registration.status,'CONFIRMED');
    assert.equal((await call('/payments/'+r.id,a.token,'POST',{outcome:'DECLINED'})).status,409);
  });
  await t.test('RN03: declined payment releases capacity and promotes the waiting participant',async()=>{
    const r=(await reserve(a,2)).body.registration,waiting=(await reserve(b,2)).body.registration;
    assert.equal(waiting.status,'WAITLISTED');assert.equal((await call('/payments/'+r.id,a.token,'POST',{outcome:'DECLINED'})).body.payment.status,'DECLINED');
    assert.equal((await call('/registrations/'+r.id,a.token)).body.registration.status,'CANCELLED');
    assert.equal((await call('/registrations/'+waiting.id,b.token)).body.registration.status,'PENDING_PAYMENT');
  });
  await t.test('RN02/RN03: expired reservation rejects late approval and releases its seat',async()=>{
    const r=(await reserve(a,3)).body.registration;
    // Advance only this synthetic reservation's deadline using its owning service and role.
    docker('exec','-T','registrations','python','-c',"import sys;from app.domain import db\nwith db() as c:c.execute(\"UPDATE registrations SET expires_at=now()-interval '1 second' WHERE id=%s AND status='PENDING_PAYMENT'\",(sys.argv[1],))",r.id);
    assert.equal((await call('/registrations/'+r.id,a.token)).body.registration.status,'EXPIRED');
    assert.equal((await call('/payments/'+r.id,a.token,'POST',{outcome:'APPROVED'})).status,409);
    assert.equal((await reserve(b,3)).body.registration.status,'PENDING_PAYMENT');
  });
  await t.test('RN05: notification outage does not undo registration; delivery recovers and deduplicates',async()=>{
    let r;
    try {docker('stop','notifications');r=(await reserve(a,4)).body.registration;assert.equal(r.status,'CONFIRMED');}
    finally {docker('up','-d','--no-deps','--wait','--wait-timeout','90','notifications');}
    const count=()=>Number(docker('exec','-T','notifications','python','-c',"import sys;from app.consumer import db\nwith db() as c:print(c.execute(\"SELECT count(*) FROM deliveries WHERE payload->>'registrationId'=%s AND status='SENT'\",(sys.argv[1],)).fetchone()[0])",r.id).trim());
    await eventually(()=>count()===1);
    docker('exec','-T','registrations','python','-c',"import sys;from app.domain import db\nwith db() as c:c.execute(\"UPDATE outbox SET published_at=NULL WHERE payload->>'registrationId'=%s\",(sys.argv[1],))",r.id);
    await pause(5000);assert.equal(count(),1);
  });
  await t.test('RN04/RN07: event cancellation cancels reservations and blocks new enrollment',async()=>{
    const r=(await reserve(a,5)).body.registration;
    assert.equal((await call('/events/'+event.id+'/cancel',outsider.token,'POST',{})).status,404);
    assert.equal((await call('/events/'+event.id+'/cancel',owner.token,'POST',{})).body.event.status,'CANCELLED');
    assert.equal((await call('/registrations/'+r.id,a.token)).body.registration.status,'CANCELLED');
    assert.equal((await reserve(b,5)).status,409);
  });
  await t.test('recovery: generic response, one-use token and new password persist',async()=>{
    const known=await call('/auth/password/forgot',null,'POST',{email:a.email}),unknown=await call('/auth/password/forgot',null,'POST',{email:'missing-'+suffix+'@example.test'});
    assert.equal(known.status,202);assert.deepEqual(known.body,unknown.body);
    const mail=JSON.parse(docker('exec','-T','identity','node','--input-type=module','-e',"import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';process.stdout.write(await readFile('/tmp/eventhub-mail/'+createHash('sha256').update(process.argv[1]).digest('hex')+'.json','utf8'));",a.email));
    const token=new URLSearchParams(mail.path.split('#')[1]).get('token');
    assert.equal((await call('/auth/password/reset',null,'POST',{token,password:'Nova1234'})).status,200);
    assert.equal((await call('/auth/password/reset',null,'POST',{token,password:'Outra123'})).status,400);
    assert.equal((await call('/auth/login',null,'POST',{email:a.email,password:'Teste123'})).status,401);
    assert.equal((await call('/auth/login',null,'POST',{email:a.email,password:'Nova1234'})).status,200);
  });
});
