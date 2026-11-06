import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { providerPayment } from '../src/provider.js';
import { reconcile } from '../src/payments.js';

const env={PAYMENT_PROVIDER_URL:'http://provider',PAYMENT_PROVIDER_API_KEY:'test-only-provider-key'};
function row(){return {registration_id:randomUUID(),amount_cents:1234,status:'PENDING',outcome:'APPROVED',provider_mode:'EXTERNAL_SIMULATOR',reservation_expires_at:new Date(Date.now()+60000)};}
function decision(r,status='APPROVED'){return {id:randomUUID(),reference:r.registration_id,amountCents:r.amount_cents,currency:'BRL',status,expiresAt:r.reservation_expires_at.toISOString(),simulated:true};}
test('adapter sends the provider key, authoritative price and stable idempotency reference',async()=>{
  const r=row(),value=decision(r);
  const result=await providerPayment(r,'trace-test',async(url,init)=>{
    assert.equal(url,'http://provider/v1/payments');assert.equal(init.headers.authorization,'Bearer test-only-provider-key');
    assert.equal(init.headers['idempotency-key'],r.registration_id);assert.equal(init.headers['x-request-id'],'trace-test');
    assert.deepEqual(JSON.parse(init.body),{reference:r.registration_id,amountCents:1234,currency:'BRL',expiresAt:r.reservation_expires_at.toISOString(),simulation:{outcome:'APPROVED'}});
    return Response.json({payment:value});
  },env);
  assert.equal(result.status,'APPROVED');
});
test('adapter fails closed on mismatched or malformed provider replies',async()=>{
  const r=row(),value=decision(r);
  for(const change of [{amountCents:1},{reference:randomUUID()},{currency:'USD'},{status:'PENDING'},{simulated:false},{expiresAt:'bad'},{id:'bad'}])
    await assert.rejects(providerPayment(r,'',async()=>Response.json({payment:{...value,...change}}),env));
  await assert.rejects(providerPayment(r,'',async()=>Response.json({},{status:503}),env));
});
function harness(t,r){
  const previous=globalThis.fetch, saved=Object.fromEntries(Object.keys(env).concat(['REGISTRATIONS_URL','INTERNAL_API_KEY']).map(k=>[k,process.env[k]]));
  Object.assign(process.env,env,{REGISTRATIONS_URL:'http://registrations',INTERNAL_API_KEY:'internal-test'});
  t.after(()=>{globalThis.fetch=previous;for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
  return {query:async(sql,p)=>{
    if(sql.startsWith('SELECT'))return {rows:[{...r}]};
    if(sql.includes('SET provider_id')){r.provider_id=p[1];r.provider_status=p[2];return {rows:[]};}
    if(sql.includes('SET status=')){if(r.status!=='PENDING')return {rows:[]};r.status=p[1];return {rows:[{...r}]};}
    throw Error('Unexpected SQL');
  }};
}
test('Payment applies the provider decision rather than the selected demonstration outcome',async t=>{
  const r=row(),pool=harness(t,r),value=decision(r,'DECLINED');
  globalThis.fetch=async(url,init)=>{
    if(url.startsWith('http://provider'))return Response.json({payment:value});
    assert.deepEqual(JSON.parse(init.body),{outcome:'DECLINED'});return Response.json({registration:{status:'CANCELLED'}});
  };
  assert.equal((await reconcile(pool,r.registration_id)).status,'DECLINED');assert.equal(r.provider_id,value.id);
});
test('provider failure leaves the payment recoverable and never confirms the registration',async t=>{
  const r=row(),pool=harness(t,r);let callbacks=0;
  globalThis.fetch=async url=>{if(url.startsWith('http://registrations'))callbacks++;return Response.json({},{status:503});};
  await assert.rejects(reconcile(pool,r.registration_id));assert.equal(r.status,'PENDING');assert.equal(callbacks,0);
});
test('callback failure resumes the same provider payment without another creation',async t=>{
  const r=row(),pool=harness(t,r),value=decision(r);let first=true,creates=0,reads=0;
  globalThis.fetch=async(url,init)=>{
    if(url.startsWith('http://provider')){init.method==='POST'?creates++:reads++;return Response.json({payment:value});}
    if(first){first=false;return Response.json({},{status:503});}return Response.json({registration:{status:'CONFIRMED'}});
  };
  await assert.rejects(reconcile(pool,r.registration_id));assert.equal(r.provider_id,value.id);assert.equal(r.status,'PENDING');
  assert.equal((await reconcile(pool,r.registration_id)).status,'APPROVED');assert.equal(creates,1);assert.equal(reads,1);
});
test('late provider approval cannot override an expired reservation',async t=>{
  const r=row(),pool=harness(t,r),value=decision(r);
  globalThis.fetch=async url=>Response.json(url.startsWith('http://provider')?{payment:value}:{registration:{status:'EXPIRED'}});
  assert.equal((await reconcile(pool,r.registration_id)).status,'EXPIRED');
});
