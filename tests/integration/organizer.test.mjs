import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const base=process.env.EVENTHUB_URL || 'http://127.0.0.1:8080';
async function call(path,token,method='GET',body,key){
  const response=await fetch(base+'/api'+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...(key?{'idempotency-key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  return {status:response.status,body:await response.json()};
}

test('organizer program: rich drafts, private speaker contact, validation and optional waitlist',{timeout:120000},async t=>{
  const suffix=randomUUID();
  async function account(label){
    const email=`qa-program-${label}-${suffix}@example.test`;
    assert.equal((await call('/auth/register',null,'POST',{name:'Pessoa QA '+label,email,password:'Teste123'})).status,201);
    const login=await call('/auth/login',null,'POST',{email,password:'Teste123'});
    assert.equal(login.status,200);
    return {token:login.body.accessToken,id:login.body.user.id};
  }
  const owner=await account('owner'),a=await account('a'),b=await account('b');
  const org=await call('/organizations',owner.token,'POST',{name:'Instituto Programação QA '+suffix});
  assert.equal(org.status,201);
  const startsAt=new Date(Date.now()+7*86400000).toISOString(),endsAt=new Date(Date.now()+8*86400000).toISOString();
  const speaker={id:randomUUID(),name:'Professora QA',degree:'Doutorado',institution:'Instituto Sintético',email:`docente-${suffix}@example.test`,biography:'Pesquisadora de sistemas distribuídos e responsável pela oficina acadêmica de validação.'};
  const activity={title:'Oficina com uma vaga',startsAt,endsAt,location:'Laboratório QA',responsible:'Nome anterior ao vínculo',capacity:1,priceCents:0,kind:'Minicurso',description:'Oficina prática sobre integração entre serviços e controle concorrente de inscrições.',waitlistEnabled:false,speakerId:speaker.id};
  const payload={organizationId:org.body.organization.id,title:'Programação QA '+suffix,description:'Evento sintético para validar os formulários do organizador e os contratos dos serviços.',category:'Simpósio',hours:8,modality:'Presencial',location:'Campus QA',streamUrl:'',startsAt,endsAt,sessionTime:'08h às 18h',featured:false,speakers:[speaker],activities:[activity]};
  let event;

  await t.test('draft create, update and managed reload preserve rich fields and speaker link',async()=>{
    const created=await call('/events',owner.token,'POST',payload);
    assert.equal(created.status,201,JSON.stringify(created.body));event=created.body.event;
    assert.deepEqual(event.speakers,[speaker]);
    assert.equal(event.activities[0].responsible,speaker.name);
    const updatedPayload={...payload,speakers:[{...speaker,biography:speaker.biography+' Biografia revisada.'}],activities:[{...activity,description:activity.description+' Ementa revisada.'}]};
    const updated=await call('/events/'+event.id,owner.token,'PUT',updatedPayload);
    assert.equal(updated.status,200,JSON.stringify(updated.body));event=updated.body.event;
    const loaded=await call('/events/'+event.id+'?managed=true',owner.token);
    assert.equal(loaded.status,200);
    assert.deepEqual(loaded.body.event.speakers,updatedPayload.speakers);
    for(const key of ['kind','description','waitlistEnabled','speakerId'])assert.equal(loaded.body.event.activities[0][key],updatedPayload.activities[0][key]);
    assert.equal((await call('/events/'+event.id+'?managed=true',a.token)).status,404);
    assert.equal((await call('/events?managed=true',a.token)).body.events.some(item=>item.id===event.id),false);
  });

  await t.test('invalid contacts, references and duplicate speaker identifiers are rejected',async()=>{
    const invalid=[
      {name:'unknown speaker reference',value:{...payload,activities:[{...activity,speakerId:randomUUID()}]}},
      {name:'duplicate speaker IDs',value:{...payload,speakers:[speaker,{...speaker,name:'Outro docente'}]}},
      {name:'invalid email',value:{...payload,speakers:[{...speaker,email:'invalid-contact'}]}},
      {name:'oversized biography',value:{...payload,speakers:[{...speaker,biography:'x'.repeat(401)}]}},
      {name:'blank biography',value:{...payload,speakers:[{...speaker,biography:'   '}]}},
      {name:'invalid activity kind',value:{...payload,activities:[{...activity,kind:'Inválida'}]}},
      {name:'nonboolean waitlist',value:{...payload,activities:[{...activity,waitlistEnabled:'false'}]}}
    ];
    for(const item of invalid){const result=await call('/events',owner.token,'POST',item.value);assert.equal(result.status,422,item.name+': '+JSON.stringify(result.body));}
  });

  await t.test('published public detail and catalog redact email even for authenticated viewers',async()=>{
    assert.equal((await call('/events/'+event.id+'/publish',owner.token,'POST',{})).status,200);
    for(const token of [undefined,owner.token,a.token]){
      const detail=await call('/events/'+event.id,token);assert.equal(detail.status,200);
      assert.equal(Object.hasOwn(detail.body.event.speakers[0],'email'),false);
      assert.equal(detail.body.event.speakers[0].biography,event.speakers[0].biography);
      const list=await call('/events',token),listed=list.body.events.find(item=>item.id===event.id);
      assert.ok(listed);assert.equal(Object.hasOwn(listed.speakers[0],'email'),false);
    }
    const managed=await call('/events/'+event.id+'?managed=true',owner.token);
    assert.equal(managed.body.event.speakers[0].email,speaker.email);
    assert.equal((await call('/events/'+event.id+'?managed=true',a.token)).status,404);
    assert.equal((await call('/events/'+event.id,owner.token,'PUT',{...payload,activities:[{...activity,waitlistEnabled:true}]})).status,409);
  });

  await t.test('last-seat contention with disabled waitlist returns conflict without creating a waiting registration',async()=>{
    const keys=[randomUUID(),randomUUID()],users=[a,b];
    const reserve=(user,key)=>call('/registrations',user.token,'POST',{eventId:event.id,activityId:event.activities[0].id},key);
    const results=await Promise.all(users.map((user,index)=>reserve(user,keys[index])));
    assert.deepEqual(results.map(item=>item.status).sort(),[201,409]);
    const winnerIndex=results.findIndex(item=>item.status===201),loserIndex=1-winnerIndex;
    const registration=results[winnerIndex].body.registration;
    assert.equal(registration.status,'CONFIRMED');
    const replay=await reserve(users[winnerIndex],keys[winnerIndex]);assert.equal(replay.status,201);assert.equal(replay.body.registration.id,registration.id);
    assert.equal((await reserve(users[loserIndex],keys[loserIndex])).status,409);
    const registrations=(await Promise.all(users.map(user=>call('/registrations',user.token)))).flatMap(result=>result.body.registrations).filter(item=>item.activityId===event.activities[0].id);
    assert.equal(registrations.length,1);assert.equal(registrations[0].status,'CONFIRMED');
    assert.equal((await call('/registrations/'+registration.id+'/cancel',users[winnerIndex].token,'POST',{})).status,200);
    const afterRelease=await reserve(users[loserIndex],keys[loserIndex]);assert.equal(afterRelease.status,201);assert.equal(afterRelease.body.registration.status,'CONFIRMED');
  });

  await t.test('legacy event payloads retain defaults and allow the existing waitlist behavior',async()=>{
    const {kind,description,waitlistEnabled,speakerId,...legacyActivity}=activity;
    const legacy=await call('/events',owner.token,'POST',{...payload,title:'Compatibilidade QA '+suffix,speakers:[{name:speaker.name,institution:speaker.institution}],activities:[legacyActivity]});
    assert.equal(legacy.status,201,JSON.stringify(legacy.body));
    const legacyEvent=legacy.body.event,stored=legacyEvent.activities[0];
    assert.equal(stored.kind,'Workshop');assert.equal(stored.description,'');assert.equal(stored.waitlistEnabled,true);assert.equal(stored.speakerId,null);
    assert.equal((await call('/events/'+legacyEvent.id+'/publish',owner.token,'POST',{})).status,200);
    const first=await call('/registrations',a.token,'POST',{eventId:legacyEvent.id,activityId:stored.id},randomUUID());
    const second=await call('/registrations',b.token,'POST',{eventId:legacyEvent.id,activityId:stored.id},randomUUID());
    assert.equal(first.status,201);assert.equal(first.body.registration.status,'CONFIRMED');
    assert.equal(second.status,201);assert.equal(second.body.registration.status,'WAITLISTED');
  });
});
