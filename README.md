# EventHub

Plataforma acadêmica da UECE para gerenciamento de eventos, com microsserviços Node.js e Python.

## Estado atual

O backend acadêmico possui oito serviços com bancos próprios: Identity, Event, Registration, Payment, Notification, Attendance, Certificate e Reporting. Inclui gestão de inscritos, reservas/fila, presença, certificados PDF e relatórios com projeções próprias. As integrações usam APIs e RabbitMQ, sem SQL entre bancos de domínio. O pagamento permanece simulado, conforme o escopo escolhido.

Veja a [implementação e validação do backend acadêmico](docs/validation/2026-11-04-backend-implemented.md), com resultados dos testes e próximas integrações visuais.

O participante possui catálogo, aviso antecipado de inscrição existente, checkout, perfil e Minhas inscrições. A ação de certificado solicita e baixa o PDF autenticado, com requisitos decididos pelo servidor. Gestão de inscritos, check-in, relatórios e confirmação de e-mail estão disponíveis pelas APIs; suas novas telas organizadoras e a tela de confirmação ainda precisam de integração visual. Diagnóstico em /diagnostico. Veja [negócio](docs/api/business.md), [presença](docs/api/attendance.md), [certificados](docs/api/certificates.md) e [relatórios](docs/api/reporting.md).

Consulte a [revisão visual e lista de páginas/popups](docs/validation/2026-10-30-visual-review.md) para rotas, correções e validação em desktop e celular.

## Pré-requisitos e execução

Docker Desktop em modo Linux e Docker Compose. Node.js 24 para desenvolvimento local do frontend/Gateway/serviços Node. Python 3.13 para desenvolvimento local dos serviços FastAPI.

No PowerShell, na raiz:

```powershell
if (-not (Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
node scripts/init-identity-keys.mjs
node scripts/init-internal-key.mjs
node scripts/init-backend-config.mjs
docker compose up -d --wait --wait-timeout 180 postgres rabbitmq
node scripts/provision-backend-databases.mjs
docker compose --parallel 1 build
docker compose up -d --wait --wait-timeout 180
```

Não sobrescreva um `.env` existente. Os valores de exemplo são exclusivos para desenvolvimento local. O arquivo `.env` é ignorado pelo Git. O script gera as chaves RSA locais sem exibi-las e preserva um par existente; usa Node.js 24 no host.

Abra http://localhost:8080 e escolha Participante ou Organização. O participante usa /participante/login e /participante/cadastro; a organização usa /organizacao/login e /organizacao/cadastro. Após entrar, os destinos são /eventos e /organizacoes, respectivamente. A senha deve ter entre 8 e 128 caracteres. A sessão dura uma hora desde o login e é restaurada ao atualizar a página ou reabrir o navegador. O prazo original é preservado; sair da conta remove a sessão salva e desconecta as outras abas do mesmo navegador. O Nginx publica somente em loopback. Os bancos, broker e aplicações internas não possuem portas publicadas.

A área da organização autentica a conta pessoal do responsável ou organizador. Quem já possui conta de participante pode usá-la nessa área; os vínculos OWNER/ORGANIZER continuam sendo verificados pelo Identity. O cadastro institucional cria a conta e a organização com vínculo OWNER na mesma transação. Contas existentes também podem criar organizações em /organizacoes. Não há senha compartilhada da equipe. /login leva à escolha de acesso; /cadastro redireciona ao cadastro de participante para compatibilidade.

O perfil participante fica em /perfil; o institucional em /organizacao/perfil. Logout revoga o token no servidor; troca/reset de senha e confirmação de e-mail invalidam todas as sessões anteriores. Se o servidor estiver indisponível ao sair, o navegador limpa a sessão local e informa que a revogação não foi confirmada. “Lembrar de mim” guarda somente e-mail. Alteração/verificação de e-mail e remoção de membros estão documentadas na [API de identidade](docs/api/identity.md).

Minhas Inscrições separa ativas, confirmadas cujo período terminou e canceladas/expiradas. O término sozinho não comprova presença. Ao solicitar o PDF, Certificate revalida inscrição, evento e presença; requisitos ausentes ou dependência indisponível não geram sucesso fictício. As referências visuais e a logo transparente estão descritas na [validação de 04/11](docs/validation/2026-11-04-participant.md).

Participantes encontram /eventos e /minhas-inscricoes no menu. Organizações encontram /organizacao/eventos e /organizacao/eventos/novo. Salve um rascunho com ao menos uma atividade e publique para aparecer no catálogo. Preço e capacidade ficam fixos após publicação. Os detalhes e a seleção da atividade mostram vagas restantes consultadas no Registration, considerando reservas e a fila existente. Gratuitas confirmam com vaga; pagas exigem aprovação simulada antes do prazo. Não são coletados dados bancários.

```powershell
docker compose ps
docker compose logs --tail 100
docker compose down
```

O último comando encerra os contêineres e preserva os volumes. Não apague volumes para reiniciar o ambiente. Em volumes existentes, atualize a configuração do PostgreSQL e execute `node scripts/provision-backend-databases.mjs` para adicionar os domínios de forma idempotente. Dados e senhas existentes são preservados; alterar `.env` não modifica senhas já cadastradas no PostgreSQL. Em computadores com pouca memória, separe builds e Playwright.

Identity aplica suas migrações versionadas automaticamente antes de abrir a porta HTTP. Isso atualiza volumes existentes sem recriar bancos. Para reaplicar a verificação manualmente: `docker compose exec identity node src/database/migrate.js`. Migrações aplicadas não devem ser editadas; crie um novo arquivo numerado em services/identity/src/database/migrations.

## Validação

Com o ambiente iniciado:

```powershell
node --test tests/integration/platform.test.mjs tests/integration/identity.test.mjs
node --test tests/integration/identity-migrations.test.mjs
node --test tests/integration/organizations.test.mjs
node --test tests/integration/figma-identity.test.mjs
node --test tests/integration/business.test.mjs
node --test tests/integration/backend-completion.test.mjs
```

Os testes verificam Nginx → Gateway → aplicações Node/Python → bancos, respostas 404, rastreabilidade e isolamento dos oito usuários de banco (64 combinações de CONNECT). A integração de conclusão cobre gestão, presença, PDF, privacidade da validação, projeções, replay RabbitMQ, sessões e e-mail. Usa apenas contas/eventos sintéticos; a passagem do tempo é simulada nos registros da própria fixture usando cada domínio e seu banco. A verificação de permissões utiliza `docker compose exec`. Resultados da rodada devem ser separados de testes de interface com respostas controladas.

O teste Identity cria contas sintéticas com prefixo qa- e domínio example.test; verifica cadastro, duplicidade, login, hash persistido, perfil e isolamento entre usuários. As contas ficam no banco para evidência. Cadastro e login possuem limite compartilhado de 30 chamadas por IP em 15 minutos por instância; muitas repetições podem retornar 429, exigindo aguardar a janela.

Para o teste controlado de indisponibilidade e recuperação:

```powershell
powershell -ExecutionPolicy Bypass -File tests/integration/notification-recovery.ps1
```

Esse teste para Notification, confirma degradação com os demais serviços disponíveis e inicia Notification novamente em um bloco `finally`. Ainda não testa entrega de mensagens ou confirmação de inscrições.

Testes unitários Node, após `npm ci` no diretório correspondente:

```powershell
npm --prefix gateway test
npm --prefix services/identity test
npm --prefix services/payments test
```

## Desenvolvimento do frontend

Após entrar, acesse /organizacoes pelo link no perfil. Você pode criar uma organização, editar seus dados como responsável e adicionar contas já cadastradas pelo e-mail. O usuário adicionado recebe vínculo de organizador imediatamente; não há envio de convite nesta etapa. Organizações de outras equipes não aparecem na sua lista. O vínculo não altera o papel global de participante nem exige novo login.

```powershell
cd frontend
npm ci
npm run dev
```

O Vite informa a URL local e encaminha `/api` para o Nginx na porta 8080. Se mudar HTTP_PORT, ajuste o alvo em `vite.config.ts`. Para validar tipos e gerar a versão de produção: `npm run build`.

Cada aplicação Node possui seu próprio `package-lock.json`. As dependências Python estão fixadas em seu respectivo `requirements.txt`; os containers usam ambientes isolados.

Para validar as telas com os serviços iniciados, instale as dependências do frontend e execute `npm --prefix frontend run test:e2e` na raiz. A configuração usa Microsoft Edge instalado, em sessão isolada sem interface. As capturas ficam em frontend/test-results, ignoradas pelo Git. Os testes criam contas sintéticas; respeite o limite de autenticação ao repetir as suítes.

## Diagnóstico e contratos

- `GET /api/health`: processo do Gateway ativo.
- `GET /api/status`: consulta em paralelo a prontidão dos oito serviços; retorna 200 ou 503.
- Internamente, `GET /health`: processo ativo; `GET /ready`: consulta real `SELECT 1` ao banco próprio.
- Serviços FastAPI disponibilizam `/docs` apenas na rede interna.
- Cadastro e login são públicos; consulta e atualização do próprio perfil exigem token válido no Gateway e no Identity.

A prontidão verifica bancos; não comprova entrega SMTP/RabbitMQ nem substitui testes de negócio. RabbitMQ tem seu próprio healthcheck no Compose.

## Mensagens e escopo acadêmico

`MAIL_MODE=mailbox` grava mensagens locais privadas e não envia e-mail externo. `MAIL_MODE=smtp` usa o servidor configurado nas variáveis de `.env.example`, com outbox, tentativas e fila de falhas. Nenhuma credencial real é versionada. A confirmação de e-mail usa um link único de 30 minutos; o consumo por API está documentado e a tela visual ainda não existe.

O pagamento é simulado, sem cobrança ou coleta de cartão. Backups/restauração, CI, hospedagem pública, identidades internas específicas por serviço e eventual cobrança real são evoluções de implantação, não afirmações de prontidão para produção.

Veja [arquitetura](docs/architecture/README.md), [organização do código](docs/architecture/repository-structure.md), [diagnóstico](docs/api/health.md), [API de identidade](docs/api/identity.md), [decisão de autenticação](docs/adr/002-identity-authentication.md) e [plano](docs/PLAN.md).

## Cloudflare Tunnel

O cloudflared já está instalado no computador. Depois de validar localmente, um túnel temporário poderá apontar para `http://localhost:8080`. Nenhum túnel é iniciado automaticamente. Autenticação e regras de acesso devem ser implementadas antes da demonstração com dados pessoais.

