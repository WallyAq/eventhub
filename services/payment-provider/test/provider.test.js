import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';

async function fixture(t) {
  const rows = new Map();
  const pool = { query: async (sql, p) => {
    if (sql.startsWith('INSERT')) {
      if (rows.has(p[1])) return { rows: [] };
      const row = { id:p[0], reference:p[1], amount_cents:p[2], currency:p[3], requested_outcome:p[4],
        expires_at:p[5], status:Date.parse(p[5]) <= Date.now() ? 'EXPIRED' : p[4], created_at:new Date().toISOString() };
      rows.set(row.reference,row); return { rows:[row] };
    }
    if (sql.includes('WHERE reference=')) return { rows: rows.has(p[0]) ? [rows.get(p[0])] : [] };
    if (sql.includes('WHERE id=')) return { rows: [...rows.values()].filter(r=>r.id === p[0]) };
    return { rows:[] };
  } };
  const server=createApp(pool,'provider-test-key').listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());
  const base='http://127.0.0.1:'+server.address().port;
  const payload={reference:randomUUID(),amountCents:3500,currency:'BRL',expiresAt:new Date(Date.now()+60000).toISOString(),simulation:{outcome:'APPROVED'}};
  const send=(body=payload, key=body.reference, auth='provider-test-key')=>fetch(base+'/v1/payments',{method:'POST',headers:{authorization:'Bearer '+auth,'content-type':'application/json','idempotency-key':key},body:JSON.stringify(body)});
  return {base,send,payload,rows};
}
test('provider requires its own key and preserves one decision across retries',async t=>{
  const f=await fixture(t);
  assert.equal((await f.send(f.payload,f.payload.reference,'wrong')).status,401);assert.equal(f.rows.size,0);
  const first=await f.send();assert.equal(first.status,201);const value=(await first.json()).payment;
  const second=await f.send();assert.equal(second.status,200);assert.deepEqual((await second.json()).payment,value);
  assert.equal((await f.send({...f.payload,amountCents:1})).status,409);assert.equal(f.rows.size,1);
  const get=await fetch(f.base+'/v1/payments/'+value.id,{headers:{authorization:'Bearer provider-test-key'}});
  assert.deepEqual((await get.json()).payment,value);
});
test('provider validates amounts, references, deadlines and selected scenarios',async t=>{
  const f=await fixture(t);
  for(const change of [{amountCents:0},{amountCents:1.5},{reference:'bad'},{currency:'USD'},{expiresAt:'bad'},
    {expiresAt:'2026-11-06T10:00:00'},{simulation:{outcome:'UNKNOWN'}},{simulation:{outcome:'APPROVED',card:'not-accepted'}}])
    assert.equal((await f.send({...f.payload,...change})).status,422);
  assert.equal(f.rows.size,0);
});
test('provider returns refusal and expiration without simulating any real charge',async t=>{
  const f=await fixture(t);
  for(const outcome of ['DECLINED','EXPIRED']){
    const response=await f.send({...f.payload,reference:randomUUID(),simulation:{outcome}});
    assert.equal((await response.json()).payment.status,outcome);
  }
  const expired=await f.send({...f.payload,reference:randomUUID(),expiresAt:new Date(Date.now()-1000).toISOString()});
  const value=(await expired.json()).payment;assert.equal(value.status,'EXPIRED');assert.equal(value.simulated,true);
});
