from pathlib import Path

path = Path('frontend/src/pages/events/EditorPage.tsx')
text = path.read_text(encoding='utf-8')
replacements = [
    ("import type { Activity,EventData,Speaker } from '../../services/business';", "import type { Activity,EventData,Speaker } from '../../services/business';\nimport { EventProgram } from '../../components/events/EventProgram';"),
    ("const emptyActivity=():ActivityForm=>({title:'',startsAt:'',endsAt:'',location:'',responsible:'',capacity:30,priceCents:0});\n", ''),
    ('activities:[emptyActivity()]', 'activities:[]'),
    ("api<{event:EventData}>('/events/'+id,session.token)", "api<{event:EventData}>('/events/'+id+'?managed=true',session.token)"),
    ('speakers:event.speakers,activities:', 'speakers:event.speakers.map(speaker=>({...speaker,id:speaker.id||crypto.randomUUID()})),activities:'),
    ("  function activity(index:number,patch:Partial<ActivityForm>){field('activities',form.activities.map((item,i)=>i===index?{...item,...patch}:item));}\n", ''),
    ("e.preventDefault();if(!session||busy)return;setBusy(true);", "e.preventDefault();if(!session||busy)return;if(!form.activities.length){setError('Adicione ao menos uma atividade antes de salvar o evento.');document.getElementById('event-program')?.scrollIntoView({behavior:'smooth'});return;}setBusy(true);"),
]
for before, after in replacements:
    if before not in text:
        raise RuntimeError('Trecho esperado não encontrado: ' + before[:100])
    text = text.replace(before, after, 1)

start = text.index('    <section className="business-card"><header className="section-toolbar"><div><h2>3.')
end = text.index('<div className="business-card editor-footer"><button className="primary-button" type="submit">', start)
text = text[:start] + '    <EventProgram speakers={form.speakers} activities={form.activities} event={{title:form.title,startsAt:form.startsAt,endsAt:form.endsAt}} disabled={busy||frozen} onChange={program=>setForm(current=>({...current,...program}))} />\n    ' + text[end:]
path.write_text(text, encoding='utf-8')
print('Editor integrado: seções gerais preservadas; programação usa modais.')
