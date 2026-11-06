import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const base=(process.env.EVENTHUB_URL || 'http://127.0.0.1:8080')+'/api';
const docker=(...args)=>execFileSync('docker',['compose',...args],{encoding:'utf8',timeout:120000,stdio:['ignore','pipe','pipe']}).trim();
async function request(path,token,method='GET',body,key,status=200){
  const response=await fetch(base+path,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'content-type':'application/json'}),...(key?{'idempotency-key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const text=await response.text();assert.equal(response.status,status,`${method} ${path}: ${text.slice(0,1200)}`);return JSON.parse(text);
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(read,accept,seconds=60){const deadline=Date.now()+seconds*1000;do{const value=await read();if(accept(value))return value;await pause(800);}while(Date.now()<deadline);assert.fail('Expected recovery/delivery did not happen');}

test('RF07/RF08: external simulator, durable recovery and explicit asynchronous notifications', {timeout:420000}, async t=>{
  await request('/status');
  const suffix=randomUUID(),password='QA-Payments-Notifications-123';
  async function account(label){
    const email=`qa-rf07-${label}-${suffix}@example.test`,name='Pessoa QA RF07 '+label;
    await request('/auth/register',null,'POST',{email,name,password},null,201);
    const session=await request('/auth/login',null,'POST',{email,password});return {token:session.accessToken,email};
  }
  const owner=await account('owner'),participant=await account('participant'),outsider=await account('outsider');
  const organization=(await request('/organizations',owner.token,'POST',{name:'Instituto QA RF07 '+suffix},null,201)).organization;
  const startsAt=new Date(Date.now()+86400000).toISOString(),endsAt=new Date(Date.now()+90000000).toISOString();
  const event=(await request('/events',owner.token,'POST',{organizationId:organization.id,title:'QA RF07 RF08 '+suffix,
    description:'Evento sintético de integração do provedor e das notificações.',category:'Workshop',hours:1,modality:'Presencial',location:'Campus QA A',streamUrl:'',startsAt,endsAt,sessionTime:'Manhã',speakers:[],
    activities:['Aprovação','Recusa com fila','Expiração','Recuperação'].map(title=>({title,startsAt,endsAt,location:'Sala QA',responsible:'Docente QA',capacity:1,priceCents:1234,waitlistEnabled:true}))},null,201)).event;
  t.after(async()=>{
    docker('up','-d','--no-deps','--wait','--wait-timeout','120','payment-provider','notifications');
    await request('/events/'+event.id+'/cancel',owner.token,'POST',{});
  });
  await request('/events/'+event.id+'/publish',owner.token,'POST',{});
  const reserve=async(person,index)=>(await request('/registrations',person.token,'POST',{eventId:event.id,activityId:event.activities[index].id},randomUUID(),201)).registration;
  const approved=await reserve(participant,0),declined=await reserve(participant,1),waiter=await reserve(owner,1),expired=await reserve(participant,2),recover=await reserve(participant,3);
  assert.equal(waiter.status,'WAITLISTED');
  docker('stop','notifications');
  try {
    const payment=(await request('/payments/'+approved.id,participant.token,'POST',{outcome:'APPROVED'})).payment;
    assert.equal(payment.status,'APPROVED');assert.equal(payment.providerMode,'EXTERNAL_SIMULATOR');assert.match(payment.providerPaymentId,/^[a-f0-9-]{36}$/);
    assert.equal(payment.amountCents,1234);assert.equal(payment.providerStatus,'APPROVED');
    assert.equal((await request('/payments/'+approved.id,participant.token,'POST',{outcome:'APPROVED'})).payment.providerPaymentId,payment.providerPaymentId);
    await request('/payments/'+approved.id,participant.token,'POST',{outcome:'DECLINED'},null,409);
    assert.equal((await request('/payments/'+declined.id,participant.token,'POST',{outcome:'DECLINED'})).payment.status,'DECLINED');
    assert.equal((await request('/registrations/'+declined.id,participant.token)).registration.status,'CANCELLED');
    assert.equal((await request('/registrations/'+waiter.id,owner.token)).registration.status,'PENDING_PAYMENT');
    assert.equal((await request('/payments/'+expired.id,participant.token,'POST',{outcome:'EXPIRED'})).payment.status,'EXPIRED');
    assert.equal((await request('/registrations/'+expired.id,participant.token)).registration.status,'EXPIRED');
    docker('stop','payment-provider');
    try {
      assert.equal((await request('/payments/'+recover.id,participant.token,'POST',{outcome:'APPROVED'},null,202)).payment.status,'PENDING');
      assert.equal((await request('/registrations/'+recover.id,participant.token)).registration.status,'PENDING_PAYMENT');
    } finally {docker('up','-d','--no-deps','--wait','--wait-timeout','120','payment-provider');}
    const recovered=await until(()=>request('/payments/'+recover.id,participant.token),value=>value.payment.status==='APPROVED');
    assert.equal(recovered.payment.providerMode,'EXTERNAL_SIMULATOR');
    assert.equal((await request('/registrations/'+recover.id,participant.token)).registration.status,'CONFIRMED');
    const information={title:event.title+' atualizado',description:event.description,location:'Campus QA B',streamUrl:'',sessionTime:'Manhã'};
    await request('/events/'+event.id+'/public-information',outsider.token,'PATCH',information,null,404);
    await request('/events/'+event.id+'/public-information',owner.token,'PATCH',{...information,capacity:10},null,422);
    assert.equal((await request('/events/'+event.id+'/public-information',owner.token,'PATCH',information)).notificationsQueued,true);
    assert.equal((await request('/events/'+event.id+'/public-information',owner.token,'PATCH',information)).notificationsQueued,false);
    const changed=(await request('/events/'+event.id,owner.token)).event;
    assert.deepEqual(changed.activities,event.activities);assert.equal(changed.startsAt,event.startsAt);
  } finally {docker('up','-d','--no-deps','--wait','--wait-timeout','120','notifications');}

  function mailbox(){
    const code=[
      'import json,sys,os', 'from pathlib import Path', 'suffix=sys.argv[1]',
      'assert len(suffix)==36 and all(c in "0123456789abcdef-" for c in suffix)',
      'result=[]',
      'for f in Path(os.environ.get("MAILBOX_DIRECTORY","/tmp/eventhub-mail")).glob("*.json"):',
      ' try: m=json.loads(f.read_text())', ' except (ValueError,OSError): continue',
      ' if m.get("to", "").startswith("qa-rf07-") and m["to"].endswith(suffix+"@example.test"): result.append(m)',
      'print(json.dumps(result))',
    ].join('\n');
    return JSON.parse(docker('exec','-T','notifications','python','-c',code,suffix));
  }
  const messages=await until(async()=>mailbox(),all=>[
    [approved.id,'payment.approved'],[declined.id,'payment.declined'],[expired.id,'payment.expired'],[recover.id,'payment.approved'],
  ].every(([id,type])=>all.some(m=>m.registrationId===id&&m.type===type))&&all.filter(m=>m.type==='event.updated').length===2,90);
  for(const [id,type] of [[approved.id,'payment.approved'],[declined.id,'payment.declined'],[expired.id,'payment.expired'],[recover.id,'payment.approved']]){
    const found=messages.filter(m=>m.registrationId===id&&m.type===type);assert.equal(found.length,1);assert.match(found[0].text,/R\$ 12,34/);assert.match(found[0].text,/nenhuma cobrança real/);
  }
  const updated=messages.filter(m=>m.type==='event.updated');assert.deepEqual(updated.map(m=>m.to).sort(),[owner.email,participant.email].sort());
  assert.ok(updated.every(m=>m.text.includes('Campus QA B')));
  await request('/events/'+event.id+'/cancel',owner.token,'POST',{});
  await request('/events/'+event.id+'/cancel',owner.token,'POST',{});
  const cancelled=await until(async()=>mailbox(),all=>all.filter(m=>m.type==='event.cancelled').length===2,90);
  assert.deepEqual(cancelled.filter(m=>m.type==='event.cancelled').map(m=>m.to).sort(),[owner.email,participant.email].sort());
  assert.ok(cancelled.filter(m=>m.type==='event.cancelled').every(m=>m.text.includes('cancelou o evento')));
  const providerCount=docker('exec','-T','payment-provider','node','--input-type=module','-e',
    'import pg from "pg";const p=new pg.Pool();const ids=JSON.parse(process.argv[1]);const r=await p.query("SELECT reference,count(*)::int AS n FROM provider_transactions WHERE reference=ANY($1::uuid[]) GROUP BY reference",[ids]);console.log(JSON.stringify(r.rows));await p.end();',
    JSON.stringify([approved.id,declined.id,expired.id,recover.id]));
  const transactions=JSON.parse(providerCount);assert.equal(transactions.length,4);assert.ok(transactions.every(row=>row.n===1));
  for(const path of ['/v1/payments','/internal/events/'+event.id+'/announcements'])await request(path,null,'POST',{},null,404);
});
