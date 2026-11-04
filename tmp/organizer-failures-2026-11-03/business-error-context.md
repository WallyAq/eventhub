# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: business.spec.ts >> Figma: organizer creates and publishes; participant enrolls and pays
- Location: tests\business.spec.ts:4:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Sobre o evento', exact: true })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('heading', { name: 'Sobre o evento', exact: true }) with timeout 10000ms
  - waiting for getByRole('heading', { name: 'Sobre o evento', exact: true })

```

```yaml
- banner:
  - link "EventHub — início":
    - /url: /
    - img "EventHub"
  - navigation "Navegação principal":
    - link "Explorar Eventos":
      - /url: /eventos
    - link "Minhas Inscrições":
      - /url: /minhas-inscricoes
    - link "Meu Perfil":
      - /url: /perfil
  - button "Menu da conta": PQ Participante QA
- main:
  - link "← Explorar eventos":
    - /url: /eventos
  - alert: Serviço indisponível. Tente novamente com a mesma operação.
```

# Test source

```ts
  1   | import {test,expect} from '@playwright/test';
  2   | import {randomUUID} from 'node:crypto';
  3   | 
  4   | test('Figma: organizer creates and publishes; participant enrolls and pays',async({page,request},info)=>{
  5   |   test.setTimeout(120000);
  6   |   await expect.poll(async()=>(await request.get('/api/status')).status(),{timeout:60000,message:'Aguardar dependências prontas antes de cadastrar as contas de teste'}).toBe(200);
  7   |   const suffix=randomUUID().slice(0,8),owner='qa-ui-owner-'+suffix+'@example.test',participant='qa-ui-participant-'+suffix+'@example.test',password='Teste123',title='Congresso QA '+suffix;
  8   |   for(const email of [owner,participant])expect((await request.post('/api/auth/register',{data:{name:email===owner?'Responsável QA':'Participante QA',email,password}})).status()).toBe(201);
  9   |   const login=await request.post('/api/auth/login',{data:{email:owner,password}}),{accessToken}=await login.json();
  10  |   expect((await request.post('/api/organizations',{headers:{authorization:'Bearer '+accessToken},data:{name:'Instituto QA '+suffix}})).status()).toBe(201);
  11  |   await page.goto('/organizacao/login');
  12  |   await page.getByLabel('E-mail',{exact:true}).fill(owner);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();
  13  |   await page.locator('.topnav').getByRole('link',{name:'Gerenciar Eventos'}).click();
  14  |   await page.getByRole('link',{name:'Cadastrar Novo Evento'}).click();
  15  |   await page.getByLabel('Nome do Evento/Curso',{exact:true}).fill(title);
  16  |   await page.getByLabel('Descrição Geral',{exact:true}).fill('Congresso acadêmico de validação: dados sintéticos, serviços integrados e programação real.');
  17  |   await page.getByLabel('Carga Horária',{exact:true}).fill('8');
  18  |   await page.getByLabel('Destacar no catálogo',{exact:false}).check();
  19  |   await page.getByLabel('Campus, Sala ou Auditório',{exact:true}).fill('UECE · Campus Itaperi');
  20  |   const future=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  21  |   await page.getByLabel('Data e hora de início',{exact:true}).fill(future+'T08:00');
  22  |   await page.getByLabel('Data e hora de término',{exact:true}).fill(future+'T18:00');
  23  |   await page.getByLabel('Horário Padrão das Sessões',{exact:true}).fill('08:00 às 18:00 (BRT)');
  24  |   await page.getByRole('button',{name:'Adicionar Palestrante',exact:true}).click();
  25  |   const speaker=page.getByRole('dialog',{name:'Cadastrar Professor/Palestrante',exact:true});
  26  |   await speaker.getByLabel('Nome Completo').fill('Docente QA');
  27  |   await speaker.getByLabel('Titulação/Cargo Acadêmico').selectOption('Doutorado');
  28  |   await speaker.getByLabel('Instituição de Origem/Afiliação').fill('UECE');
  29  |   await speaker.getByLabel('E-mail Institucional ou de Contato').fill('docente-ui-'+suffix+'@example.test');
  30  |   await speaker.getByRole('button',{name:'Salvar',exact:true}).click();
  31  |   await page.getByRole('button',{name:'Adicionar Minicurso/Oficina',exact:true}).click();
  32  |   const activity=page.getByRole('dialog',{name:'Nova Atividade do Evento',exact:true});
  33  |   await activity.getByLabel('Nome da atividade').fill('Workshop de Microsserviços');
  34  |   await activity.getByLabel('Descrição e Requisitos').fill('Workshop prático de comunicação entre microsserviços com APIs e mensageria.');
  35  |   await activity.getByRole('combobox',{name:/Responsável\/Palestrante/}).fill('Docente QA');
  36  |   await activity.getByRole('option',{name:/Docente QA/}).click();
  37  |   await activity.getByLabel('Data da Atividade').fill(future);
  38  |   await activity.getByLabel('Horário de Início').fill('09:00');
  39  |   await activity.getByLabel('Horário de Término').fill('12:00');
  40  |   await activity.getByLabel('Local da atividade').fill('Sala 2 · NCAA');
  41  |   await activity.getByLabel('Número de vagas').fill('30');
  42  |   await activity.getByRole('radio',{name:'Não',exact:true}).check();
  43  |   await activity.getByLabel('Valor da inscrição').fill('50');
  44  |   await activity.getByRole('button',{name:'Salvar',exact:true}).click();
  45  |   await page.screenshot({path:info.outputPath('create-event.png'),fullPage:true});
  46  |   await page.setViewportSize({width:390,height:844});
  47  |   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  48  |   await page.screenshot({path:info.outputPath('mobile-create-event.png'),fullPage:true});
  49  |   await page.setViewportSize({width:1440,height:1024});
  50  |   await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();
  51  |   await expect(page).toHaveURL(/\/organizacao\/eventos\/[a-f0-9-]+$/);
  52  |   await page.getByRole('button',{name:'Publicar Evento',exact:true}).click();
  53  |   await expect(page.getByRole('status')).toHaveText('Evento publicado no catálogo.');
  54  |   await page.locator('.topnav').getByRole('link',{name:'Gerenciar Eventos'}).click();
  55  |   await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
  56  |   await page.screenshot({path:info.outputPath('manage-events.png'),fullPage:true});
  57  |   await page.getByRole('button',{name:'Menu da conta'}).click();await page.locator('.account-popover').getByRole('button',{name:'Sair',exact:true}).click();await page.getByRole('button',{name:'Sim, sair',exact:true}).click();
  58  |   await page.getByRole('link',{name:'Acesso de participante',exact:true}).click();
  59  |   await page.getByLabel('E-mail',{exact:true}).fill(participant);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();
  60  |   await page.locator('.topnav').getByRole('link',{name:'Explorar Eventos'}).click();
  61  |   await expect(page.getByRole('heading',{name:title,exact:true}).first()).toBeVisible();
  62  |   await page.evaluate(()=>document.fonts.ready);
  63  |   await expect(page.locator('.featured-event>img')).toBeVisible();
  64  |   await page.screenshot({path:info.outputPath('catalog.png'),fullPage:true});
  65  |   const searchPadding=await page.getByLabel('Buscar eventos').evaluate(element=>parseFloat(getComputedStyle(element).paddingLeft));
  66  |   expect(searchPadding).toBeGreaterThanOrEqual(40);
  67  |   await page.setViewportSize({width:390,height:844});
  68  |   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  69  |   await page.screenshot({path:info.outputPath('mobile-catalog.png'),fullPage:true});
  70  |   await page.setViewportSize({width:1440,height:1024});
  71  |   await page.getByLabel('Buscar eventos',{exact:true}).fill(title);
  72  |   await page.locator('.event-card').getByRole('link',{name:'Detalhes do Evento',exact:true}).click();
> 73  |   await expect(page.getByRole('heading',{name:'Sobre o evento',exact:true})).toBeVisible();
      |                                                                              ^ Error: expect(locator).toBeVisible() failed
  74  |   await page.screenshot({path:info.outputPath('event-details.png'),fullPage:true});
  75  |   await page.getByRole('link',{name:'Inscrever-se na atividade',exact:true}).click();
  76  |   await expect(page.getByRole('heading',{name:'Inscrição na Atividade',exact:true})).toBeVisible();
  77  |   await expect(page.getByRole('dialog',{name:'Inscrição na Atividade',exact:true})).toBeVisible();
  78  |   expect(await page.locator('.checkout-dialog').evaluate(element=>getComputedStyle(element,'::backdrop').backgroundColor)).toBe('rgba(30, 30, 30, 0.95)');
  79  |   await page.screenshot({path:info.outputPath('reservation.png'),fullPage:true});
  80  |   await page.getByRole('button',{name:'Confirmar e Continuar',exact:true}).click();
  81  |   await expect(page).toHaveURL(/\/pagamento\/[a-f0-9-]+$/);
  82  |   await expect(page.getByText('Aguardando pagamento',{exact:true})).toBeVisible();
  83  |   await page.screenshot({path:info.outputPath('payment.png'),fullPage:true});
  84  |   await page.getByRole('button',{name:'Simular pagamento',exact:true}).click();
  85  |   await expect(page.getByText('Confirmada',{exact:true})).toBeVisible();
  86  |   await page.screenshot({path:info.outputPath('confirmation.png'),fullPage:true});
  87  |   await page.setViewportSize({width:390,height:844});
  88  |   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  89  |   await expect(page.locator('.checkout-dialog')).toBeVisible();
  90  |   const images=await page.locator('.checkout-dialog img').evaluateAll(items=>items.map(image=>({src:image.getAttribute('src'),loaded:image.complete&&image.naturalWidth>0,width:image.getBoundingClientRect().width,height:image.getBoundingClientRect().height,natural:image.naturalWidth/image.naturalHeight})).filter(image=>image.width>0&&image.height>0));
  91  |   expect(images.length).toBeGreaterThan(0);
  92  |   expect(images.filter(image=>!image.loaded||Math.abs(image.width/image.height-image.natural)>=0.2)).toEqual([]);
  93  |   await page.screenshot({path:info.outputPath('mobile-checkout.png'),fullPage:true});
  94  |   await page.keyboard.press('Escape');
  95  |   await expect(page).toHaveURL(/\/minhas-inscricoes$/);
  96  |   await expect(page.getByRole('heading',{name:'Workshop de Microsserviços',exact:true})).toBeVisible();
  97  |   await page.screenshot({path:info.outputPath('my-registrations.png'),fullPage:true});
  98  | });
  99  | 
  100 | test('Figma: password recovery form uses generic simulated-delivery response',async({page},info)=>{
  101 |   await page.goto('/participante/login');await page.getByRole('link',{name:'Esqueci minha senha'}).click();
  102 |   await expect(page.getByRole('heading',{name:'Recuperar sua senha'})).toBeVisible();
  103 |   await page.evaluate(()=>document.fonts.ready);
  104 |   await page.screenshot({path:info.outputPath('recovery.png'),fullPage:true});
  105 |   await page.getByLabel('E-mail cadastrado',{exact:true}).fill('qa-recovery-ui@example.test');
  106 |   await page.getByRole('button',{name:'Enviar link de recuperação'}).click();
  107 |   await expect(page.getByRole('status')).toContainText('Se o e-mail estiver cadastrado');
  108 |   await page.setViewportSize({width:390,height:844});
  109 |   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  110 |   await page.screenshot({path:info.outputPath('mobile-recovery.png'),fullPage:true});
  111 |   await page.goto('/redefinir-senha#token=invalid-test-token');
  112 |   await expect(page.getByRole('heading',{name:'Redefinir sua senha',exact:true})).toBeVisible();
  113 |   await page.screenshot({path:info.outputPath('reset-password.png'),fullPage:true});
  114 | });
  115 | 
```