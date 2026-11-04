# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: organizer.spec.ts >> organizer dialogs: cancel, nested focus, responsive assets and persistent program
- Location: tests\organizer.spec.ts:26:1

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/organizacao\/eventos\/[a-f0-9-]+$/
Received string:  "http://127.0.0.1:8080/organizacao/eventos/novo"
Timeout: 10000ms

Call log:
  - Expect "toHaveURL" with timeout 10000ms
    22 × locator resolved to <html lang="pt-BR">…</html>
       - unexpected value "http://127.0.0.1:8080/organizacao/eventos/novo"

```

```yaml
- banner:
  - link "EventHub — início":
    - /url: /
    - img "EventHub"
  - navigation "Navegação principal":
    - link "Gerenciar Eventos":
      - /url: /organizacao/eventos
    - link "Organizações e equipe":
      - /url: /organizacoes
    - link "Meu Perfil":
      - /url: /organizacao/perfil
  - button "Menu da conta": RP Responsável Programação QA
- main:
  - link "← Gerenciar eventos":
    - /url: /organizacao/eventos
  - heading "Criar Novo Evento" [level=1]
  - paragraph: Preencha as diretrizes do evento acadêmico, defina modalidades, atividades e corpo docente convidado.
  - alert: signal timed out
  - group:
    - heading "1. Informações Gerais" [level=2]
    - paragraph: Identificação principal, carga horária e categorização oficial
    - text: Organização responsável
    - combobox "Organização responsável":
      - option "Selecione"
      - option "Instituto Programação UI 3ded103b Atualizado" [selected]
    - text: Nome do Evento/Curso
    - textbox "Nome do Evento/Curso": Congresso Programação UI 3ded103b
    - text: Tipo de Evento Acadêmico
    - combobox "Tipo de Evento Acadêmico":
      - option "Simpósio" [selected]
      - option "Congresso"
      - option "Curso"
      - option "Semana acadêmica"
      - option "Workshop"
      - option "Seminário"
    - text: Carga Horária
    - spinbutton "Carga Horária": "1"
    - text: Descrição Geral
    - textbox "Descrição Geral": Evento sintético para validar os diálogos e a persistência da programação acadêmica.
    - checkbox "Destacar no catálogo com imagem ilustrativa de congresso"
    - text: Destacar no catálogo com imagem ilustrativa de congresso
    - heading "2. Modalidade e Localização" [level=2]
    - paragraph: Formato de participação, infraestrutura e cronograma oficial
    - radio "Híbrido Atividades em campus físico com transmissão ao vivo."
    - text: Híbrido Atividades em campus físico com transmissão ao vivo.
    - radio "Presencial Encontro em auditórios, laboratórios e salas de aula." [checked]
    - text: Presencial Encontro em auditórios, laboratórios e salas de aula.
    - radio "100% Online Aulas virtuais e salas de webconferência."
    - text: 100% Online Aulas virtuais e salas de webconferência. Campus, Sala ou Auditório
    - textbox "Campus, Sala ou Auditório": Campus Sintético QA
    - text: Link de Transmissão / Plataforma
    - textbox "Link de Transmissão / Plataforma"
    - text: Data e hora de início
    - textbox "Data e hora de início": 2026-11-10T08:00
    - text: Data e hora de término
    - textbox "Data e hora de término": 2026-11-10T18:00
    - text: Horário Padrão das Sessões
    - textbox "Horário Padrão das Sessões":
      - /placeholder: 08:30 às 18:00 (BRT)
    - heading "3. Professores e Palestrantes Convidados" [level=2]
    - paragraph: Docentes e instituições participantes
    - button "Adicionar Palestrante"
    - article:
      - strong: Professora Principal QA
      - text: Doutorado
      - paragraph: Instituto Sintético QA
      - text: docente-principal-3ded103b@example.test
      - paragraph: Pesquisa e docência em sistemas distribuídos, com foco em integração e concorrência.
      - button "Editar palestrante 1": Editar
      - button "Remover palestrante 1"
    - article:
      - strong: Professor Vinculado QA
      - text: Doutorado
      - paragraph: Instituto Sintético QA
      - text: docente-vinculado-3ded103b@example.test
      - paragraph: Pesquisa e docência em sistemas distribuídos, com foco em integração e concorrência.
      - button "Editar palestrante 2": Editar
      - button "Remover palestrante 2"
    - checkbox "Gerar automaticamente certificado de palestrante / ministrante de curso A emissão de certificados será disponibilizada em uma próxima etapa." [disabled]
    - text: Gerar automaticamente certificado de palestrante / ministrante de curso A emissão de certificados será disponibilizada em uma próxima etapa.
    - heading "4. Sub-eventos e Atividades Vinculadas" [level=2]
    - paragraph: Oficinas, trilhas paralelas e minicursos da programação
    - button "Adicionar Minicurso/Oficina"
    - article:
      - text: Minicurso
      - heading "Minicurso Integrado QA" [level=3]
      - button "Editar atividade 1": Editar
      - button "Remover atividade 1"
      - paragraph: "Integração de APIs, filas e controle de concorrência. Requisito: programação básica."
      - paragraph: 10/11/2026, 11:00 até 10/11/2026, 12:00
      - paragraph: Laboratório de Integração QA
      - paragraph: "Responsável: Professor Vinculado QA"
      - text: 12 vagas · Lista de espera desativada
      - strong: R$ 25,50
    - status: Atividade atualizada no formulário. Salve o rascunho para persistir as alterações.
    - button "Salvar rascunho"
```

# Test source

```ts
  109 |   await addSpeaker.click();
  110 |   let speaker=page.getByRole('dialog',{name:'Cadastrar Professor/Palestrante',exact:true});
  111 |   await speaker.getByLabel('Nome Completo').fill('Nome descartado');
  112 |   await speaker.getByRole('button',{name:'Cancelar',exact:true}).click();
  113 |   await expect(speaker).toHaveCount(0);await expect(addSpeaker).toBeFocused();
  114 |   await addSpeaker.click();speaker=page.getByRole('dialog',{name:'Cadastrar Professor/Palestrante',exact:true});
  115 |   await expect(speaker.getByLabel('Nome Completo')).toHaveValue('');
  116 |   await fillSpeaker(speaker,'Professora Principal QA',`docente-principal-${suffix}@example.test`);
  117 |   await checkImages(speaker);await speaker.locator('.organizer-dialog__body').evaluate(body=>{body.scrollTop=0;});
  118 |   await page.screenshot({path:info.outputPath('speaker-dialog-desktop.png'),fullPage:false});
  119 |   await page.setViewportSize({width:390,height:844});
  120 |   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  121 |   expect(await speaker.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBeTruthy();
  122 |   await checkImages(speaker);await speaker.locator('.organizer-dialog__body').evaluate(body=>{body.scrollTop=0;});
  123 |   await page.screenshot({path:info.outputPath('speaker-dialog-mobile.png'),fullPage:false});
  124 |   await speaker.getByRole('button',{name:'Salvar',exact:true}).click();
  125 |   await expect(page.locator('.program-person')).toHaveCount(1);
  126 |   await expect(page).toHaveURL(/\/organizacao\/eventos\/novo$/);expect(eventMutations).toBe(0);
  127 |   await page.setViewportSize({width:1440,height:1024});
  128 |   await page.getByRole('button',{name:'Editar palestrante 1',exact:true}).click();
  129 |   const editing=page.getByRole('dialog',{name:'Editar Professor/Palestrante',exact:true});
  130 |   await editing.getByLabel('Nome Completo').fill('Alteração descartada');await page.keyboard.press('Escape');
  131 |   await expect(editing).toHaveCount(0);await expect(page.locator('.program-person')).toContainText('Professora Principal QA');
  132 |   await expect(page.locator('.program-person')).not.toContainText('Alteração descartada');
  133 | 
  134 |   const addActivity=page.getByRole('button',{name:'Adicionar Minicurso/Oficina',exact:true});
  135 |   await addActivity.click();
  136 |   const activity=page.getByRole('dialog',{name:'Nova Atividade do Evento',exact:true});
  137 |   await activity.getByLabel('Nome da atividade').fill('Minicurso Integrado QA');
  138 |   await activity.getByRole('radio',{name:'Minicurso',exact:true}).check();
  139 |   await activity.getByLabel('Descrição e Requisitos').fill('Integração de APIs, filas e controle de concorrência. Requisito: programação básica.');
  140 |   const picker=activity.getByRole('combobox',{name:/Responsável\/Palestrante/});
  141 |   await picker.fill('sInTeTiCo');
  142 |   await expect(activity.getByRole('listbox',{name:'Docentes disponíveis',exact:true})).toBeVisible();
  143 |   await expect(activity.getByRole('option')).toHaveCount(1);
  144 |   await expect(activity.getByRole('option')).toContainText('Professora Principal QA');
  145 |   await picker.press('ArrowDown');await picker.press('Enter');
  146 |   await expect(activity.getByTestId('speaker-selected')).toContainText('Professora Principal QA');
  147 |   await expect(activity.getByTestId('speaker-selected')).toContainText('Instituto Sintético QA');
  148 |   await activity.getByRole('button',{name:'Desvincular docente',exact:true}).click();
  149 |   await expect(activity.getByTestId('speaker-selected')).toHaveCount(0);
  150 |   await picker.fill('PRINCIPAL');await picker.press('ArrowUp');await picker.press('Enter');
  151 |   await expect(activity.getByTestId('speaker-selected')).toContainText('Professora Principal QA');
  152 |   await activity.getByRole('button',{name:'Trocar docente',exact:true}).click();
  153 |   await picker.fill('SINTETICO');
  154 |   await expect(activity.getByRole('option')).toHaveCount(1);
  155 |   await picker.scrollIntoViewIfNeeded();
  156 |   await page.screenshot({path:info.outputPath('speaker-picker-desktop.png'),fullPage:false});
  157 |   await page.setViewportSize({width:390,height:844});
  158 |   await picker.scrollIntoViewIfNeeded();
  159 |   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  160 |   expect(await activity.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBeTruthy();
  161 |   await page.screenshot({path:info.outputPath('speaker-picker-mobile.png'),fullPage:false});
  162 |   await page.setViewportSize({width:1440,height:1024});
  163 |   await picker.press('Escape');
  164 |   await expect(activity.getByRole('listbox',{name:'Docentes disponíveis',exact:true})).toHaveCount(0);
  165 |   await expect(activity).toBeVisible();
  166 |   await picker.click();
  167 |   const nestedOpener=activity.getByRole('button',{name:'Cadastrar novo docente agora',exact:true});
  168 |   await nestedOpener.click();
  169 |   speaker=page.getByRole('dialog',{name:'Cadastrar Professor/Palestrante',exact:true});
  170 |   await speaker.getByLabel('Nome Completo').fill('Docente descartado');await page.keyboard.press('Escape');
  171 |   await expect(speaker).toHaveCount(0);await expect(activity).toBeVisible();await expect(nestedOpener).toBeFocused();
  172 |   await expect(activity.getByLabel('Nome da atividade')).toHaveValue('Minicurso Integrado QA');
  173 |   expect(await page.evaluate(()=>document.body.style.overflow)).toBe('hidden');
  174 |   await nestedOpener.click();speaker=page.getByRole('dialog',{name:'Cadastrar Professor/Palestrante',exact:true});
  175 |   await expect(speaker.getByLabel('Nome Completo')).toHaveValue('');
  176 |   await fillSpeaker(speaker,'Professor Vinculado QA',`docente-vinculado-${suffix}@example.test`);
  177 |   await speaker.getByRole('button',{name:'Salvar',exact:true}).click();
  178 |   await expect(activity.getByTestId('speaker-selected')).toContainText('Professor Vinculado QA');
  179 |   await activity.getByLabel('Data da Atividade').fill(future);
  180 |   await activity.getByLabel('Horário de Início').fill('11:00');await activity.getByLabel('Horário de Término').fill('10:00');
  181 |   await activity.getByLabel('Local da atividade').fill('Laboratório de Integração QA');await activity.getByLabel('Número de vagas').fill('12');
  182 |   await activity.getByLabel('Permitir lista de espera',{exact:true}).uncheck();
  183 |   await activity.getByRole('radio',{name:'Não',exact:true}).check();
  184 |   await activity.getByLabel('Valor da inscrição').fill('25.50');
  185 |   await activity.getByRole('button',{name:'Salvar',exact:true}).click();
  186 |   await expect(activity.getByRole('alert')).toContainText('término deve ser posterior');
  187 |   await activity.getByLabel('Horário de Término').fill('12:00');
  188 |   await checkImages(activity);await activity.locator('.organizer-dialog__body').evaluate(body=>{body.scrollTop=0;});
  189 |   await page.screenshot({path:info.outputPath('activity-dialog-desktop.png'),fullPage:false});
  190 |   await activity.locator('.organizer-dialog__body').evaluate(body=>{body.scrollTop=body.scrollHeight;});
  191 |   await page.screenshot({path:info.outputPath('activity-dialog-desktop-bottom.png'),fullPage:false});
  192 |   await activity.locator('.organizer-dialog__body').evaluate(body=>{body.scrollTop=0;});
  193 |   await page.setViewportSize({width:390,height:844});
  194 |   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  195 |   expect(await activity.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBeTruthy();
  196 |   await checkImages(activity);await activity.locator('.organizer-dialog__body').evaluate(body=>{body.scrollTop=0;});
  197 |   await page.screenshot({path:info.outputPath('activity-dialog-mobile.png'),fullPage:false});
  198 |   await activity.locator('.organizer-dialog__body').evaluate(body=>{body.scrollTop=body.scrollHeight;});
  199 |   await page.screenshot({path:info.outputPath('activity-dialog-mobile-bottom.png'),fullPage:false});
  200 |   await activity.locator('.organizer-dialog__body').evaluate(body=>{body.scrollTop=0;});
  201 |   await activity.getByRole('button',{name:'Salvar',exact:true}).click();
  202 |   await expect(page.locator('.program-activity')).toHaveCount(1);await expect(addActivity).toBeFocused();
  203 |   expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
  204 |   await expect(page).toHaveURL(/\/organizacao\/eventos\/novo$/);expect(eventMutations).toBe(0);
  205 |   await page.setViewportSize({width:1440,height:1024});
  206 |   await expect(page.locator('.program-activity')).toContainText('Lista de espera desativada');
  207 |   await expect(page.locator('.program-activity')).toContainText('25,50');
  208 |   await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();
> 209 |   await expect(page).toHaveURL(/\/organizacao\/eventos\/[a-f0-9-]+$/);
      |                      ^ Error: expect(page).toHaveURL(expected) failed
  210 |   await expect(page.getByLabel('Nome do Evento/Curso',{exact:true})).toHaveValue(title);
  211 |   expect(eventMutations).toBe(1);
  212 |   await page.reload();await expect(page.locator('.program-person')).toHaveCount(2);
  213 |   await expect(page.locator('.program-person').filter({hasText:'Professor Vinculado QA'})).toContainText(`docente-vinculado-${suffix}@example.test`);
  214 |   await page.getByRole('button',{name:'Editar atividade 1',exact:true}).click();
  215 |   const savedActivity=page.getByRole('dialog',{name:'Editar Atividade do Evento',exact:true});
  216 |   await expect(savedActivity.getByRole('radio',{name:'Minicurso',exact:true})).toBeChecked();
  217 |   await expect(savedActivity.getByLabel('Permitir lista de espera',{exact:true})).not.toBeChecked();
  218 |   await expect(savedActivity.getByLabel('Valor da inscrição')).toHaveValue('25.50');
  219 |   await expect(savedActivity.getByTestId('speaker-selected')).toContainText('Professor Vinculado QA');
  220 |   await savedActivity.getByLabel('Descrição e Requisitos').fill('Ementa revisada com integração de serviços e prática orientada.');
  221 |   await savedActivity.getByRole('button',{name:'Salvar',exact:true}).click();
  222 |   expect(eventMutations).toBe(1);
  223 |   await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();
  224 |   await expect(page.getByText('Rascunho salvo. Revise os dados antes de publicar.',{exact:true})).toBeVisible();
  225 |   await page.reload();await expect(page.locator('.program-activity')).toContainText('Ementa revisada');
  226 |   const eventId=page.url().split('/').at(-1);
  227 |   const persisted=await request.get('/api/events/'+eventId+'?managed=true',{headers:{authorization:'Bearer '+accessToken}});
  228 |   expect(persisted.status()).toBe(200);
  229 |   const {event}=await persisted.json(),linked=event.speakers.find((item:{name:string})=>item.name==='Professor Vinculado QA');
  230 |   expect(event.activities[0]).toMatchObject({kind:'Minicurso',waitlistEnabled:false,priceCents:2550,capacity:12,responsible:'Professor Vinculado QA',speakerId:linked.id});
  231 |   await page.screenshot({path:info.outputPath('organizer-program-persisted.png'),fullPage:true});
  232 |   await page.getByRole('button',{name:'Publicar Evento',exact:true}).click();
  233 |   await expect(page.getByText('Evento publicado no catálogo.',{exact:true})).toBeVisible();
  234 |   await expect(addSpeaker).toBeDisabled();await expect(addActivity).toBeDisabled();
  235 | 
  236 |   // Legacy programs can span multiple days and keep a free-form responsible person.
  237 |   const nextDay=new Date(new Date(future+'T12:00:00-03:00').getTime()+86400000).toISOString().slice(0,10);
  238 |   const legacyStartsAt=future+'T08:00:00-03:00',legacyEndsAt=nextDay+'T12:00:00-03:00';
  239 |   const legacyCreated=await request.post('/api/events',{headers:{authorization:'Bearer '+accessToken},data:{
  240 |     organizationId:event.organizationId,title:'Programação legada UI '+suffix,description:'Evento sintético com uma atividade legada que atravessa dois dias.',category:'Simpósio',hours:8,modality:'Presencial',location:'Campus Sintético QA',streamUrl:'',startsAt:legacyStartsAt,endsAt:nextDay+'T18:00:00-03:00',sessionTime:'BRT',featured:false,
  241 |     speakers:[{name:'Docente legado QA',institution:'Instituto Sintético QA'}],
  242 |     activities:[{title:'Atividade legada em dois dias',description:'Atividade legada com programação distribuída em dois dias consecutivos.',startsAt:legacyStartsAt,endsAt:legacyEndsAt,location:'Laboratório Legado QA',responsible:'Responsável legado QA',capacity:10,priceCents:0}]
  243 |   }});
  244 |   expect(legacyCreated.status()).toBe(201);
  245 |   const {event:legacy}=await legacyCreated.json();
  246 |   await page.goto('/organizacao/eventos/'+legacy.id);
  247 |   await expect(page.getByLabel('Nome do Evento/Curso',{exact:true})).toHaveValue('Programação legada UI '+suffix);
  248 |   await page.getByRole('button',{name:'Editar atividade 1',exact:true}).click();
  249 |   const legacyDialog=page.getByRole('dialog',{name:'Editar Atividade do Evento',exact:true});
  250 |   await expect(legacyDialog.getByLabel('Data da Atividade')).toHaveValue(future);
  251 |   await expect(legacyDialog.getByLabel('Data de término da atividade')).toHaveValue(nextDay);
  252 |   await expect(legacyDialog.getByLabel('Horário de Início')).toHaveValue('08:00');
  253 |   await expect(legacyDialog.getByLabel('Horário de Término')).toHaveValue('12:00');
  254 |   await expect(legacyDialog.getByTestId('speaker-selected')).toContainText('Responsável legado QA');
  255 |   await legacyDialog.getByRole('button',{name:'Salvar',exact:true}).click();
  256 |   await expect(legacyDialog).toHaveCount(0);
  257 |   await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();
  258 |   await expect(page.getByText('Rascunho salvo. Revise os dados antes de publicar.',{exact:true})).toBeVisible();
  259 |   const legacyReloaded=await request.get('/api/events/'+legacy.id+'?managed=true',{headers:{authorization:'Bearer '+accessToken}});
  260 |   expect(legacyReloaded.status()).toBe(200);
  261 |   const {event:roundTrip}=await legacyReloaded.json();
  262 |   expect(new Date(roundTrip.activities[0].startsAt).toISOString()).toBe(new Date(legacyStartsAt).toISOString());
  263 |   expect(new Date(roundTrip.activities[0].endsAt).toISOString()).toBe(new Date(legacyEndsAt).toISOString());
  264 |   expect(roundTrip.activities[0].responsible).toBe('Responsável legado QA');
  265 |   expect(roundTrip.activities[0].speakerId).toBeNull();
  266 | 
  267 |   const memberEmail=`qa-organizer-member-ui-${suffix}@example.test`;
  268 |   expect((await request.post('/api/auth/register',{data:{name:'Organizador Membro QA',email:memberEmail,password}})).status()).toBe(201);
  269 |   expect((await request.post('/api/organizations/'+organization.id+'/members',{headers:{authorization:'Bearer '+accessToken},data:{email:memberEmail}})).status()).toBe(201);
  270 |   await page.getByRole('button',{name:'Menu da conta',exact:true}).click();
  271 |   await page.locator('.account-popover').getByRole('button',{name:'Sair',exact:true}).click();
  272 |   await page.getByRole('button',{name:'Sim, sair',exact:true}).click();
  273 |   await expect(page).toHaveURL(/\/organizacao\/login$/);
  274 |   await page.getByLabel('E-mail',{exact:true}).fill(memberEmail);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();
  275 |   await expect(page.getByRole('button',{name:'Menu da conta',exact:true})).toBeVisible();
  276 |   await page.goto('/organizacao/perfil/'+organization.id);
  277 |   await expect(page.getByRole('heading',{name:'Dados da Conta',exact:true})).toBeVisible();
  278 |   await expect(page.locator('.profile-card')).toContainText(organization.name+' Atualizado');
  279 |   await expect(page.getByRole('button',{name:'Editar Perfil',exact:true})).toHaveCount(0);
  280 |   await expect(page.locator('#institution-name')).toHaveCount(0);
  281 |   await page.screenshot({path:info.outputPath('organization-profile-member-readonly.png'),fullPage:true});
  282 | });
  283 | 
```