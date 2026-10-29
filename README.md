# EventHub

Plataforma acadêmica da UECE para gerenciamento de eventos, com microsserviços Node.js e Python.

## Estado atual

Etapa 3: cadastro de participantes, login JWT, perfil e organizações com responsáveis e organizadores estão implementados de ponta a ponta, sobre a base de cinco serviços, Gateway, React/TypeScript/Vite, Nginx, PostgreSQL e RabbitMQ. Eventos, inscrições, pagamentos e notificações de negócio ainda não estão implementados. Não há consumidor RabbitMQ nesta etapa.

As telas de acesso são provisórias; a adaptação ao Figma será feita quando o link for fornecido. O painel de diagnóstico permanece disponível em /diagnostico.

## Pré-requisitos e execução

Docker Desktop em modo Linux e Docker Compose. Node.js 24 para desenvolvimento local do frontend/Gateway/serviços Node. Python 3.13 para desenvolvimento local dos serviços FastAPI.

No PowerShell, na raiz:

```powershell
Copy-Item .env.example .env
node scripts/init-identity-keys.mjs
docker compose up --build -d --wait --wait-timeout 180
```

Não sobrescreva um `.env` existente. Os valores de exemplo são exclusivos para desenvolvimento local. O arquivo `.env` é ignorado pelo Git. O script gera as chaves RSA locais sem exibi-las e preserva um par existente; usa Node.js 24 no host.

Abra http://localhost:8080 e escolha Participante ou Organização. O participante usa /participante/login e /participante/cadastro; a organização usa /organizacao/login e /organizacao/cadastro. Após entrar, os destinos são /perfil e /organizacoes, respectivamente. A senha deve ter entre 8 e 128 caracteres. A sessão dura até 15 minutos e fica somente na memória da aba; atualizar a página exige novo login. O Nginx publica somente em loopback. Os bancos, broker e aplicações internas não possuem portas publicadas.

A área da organização autentica a conta pessoal do responsável ou organizador. Quem já possui conta de participante pode usá-la nessa área; os vínculos OWNER/ORGANIZER continuam sendo verificados pelo Identity. O cadastro da organização começa pela conta do responsável e continua, após o login, com a criação da organização. Não há senha compartilhada da equipe. /login leva à escolha de acesso; /cadastro redireciona ao cadastro de participante para compatibilidade.

```powershell
docker compose ps
docker compose logs --tail 100
docker compose down
```

O último comando encerra os containers e preserva os volumes. Não apague volumes para reiniciar o ambiente. O script de bancos só executa em um volume novo; alterar senhas no `.env` não altera usuários já criados no PostgreSQL.

Identity aplica suas migrações versionadas automaticamente antes de abrir a porta HTTP. Isso atualiza volumes existentes sem recriar bancos. Para reaplicar a verificação manualmente: `docker compose exec identity node src/database/migrate.js`. Migrações aplicadas não devem ser editadas; crie um novo arquivo numerado em services/identity/src/database/migrations.

## Validação

Com o ambiente iniciado:

```powershell
node --test tests/integration/platform.test.mjs tests/integration/identity.test.mjs
node --test tests/integration/identity-migrations.test.mjs
node --test tests/integration/organizations.test.mjs
```

Os testes verificam Nginx → Gateway → aplicações Node/Python → bancos, respostas 404, rastreabilidade e isolamento dos cinco usuários de banco. A verificação de permissões utiliza `docker compose exec`.

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

## Diagnóstico e contratos

- `GET /api/health`: processo do Gateway ativo.
- `GET /api/status`: consulta em paralelo a prontidão dos cinco serviços; retorna 200 ou 503.
- Internamente, `GET /health`: processo ativo; `GET /ready`: consulta real `SELECT 1` ao banco próprio.
- Serviços FastAPI disponibilizam `/docs` apenas na rede interna.
- Cadastro e login são públicos; consulta e atualização do próprio perfil exigem token válido no Gateway e no Identity.

A prontidão atual verifica bancos; não verifica entrega de mensagens ou funcionalidades futuras. RabbitMQ tem seu próprio healthcheck no Compose.

Veja [arquitetura](docs/architecture/README.md), [organização do código](docs/architecture/repository-structure.md), [diagnóstico](docs/api/health.md), [API de identidade](docs/api/identity.md), [decisão de autenticação](docs/adr/002-identity-authentication.md) e [plano](docs/PLAN.md).

## Cloudflare Tunnel

O cloudflared já está instalado no computador. Depois de validar localmente, um túnel temporário poderá apontar para `http://localhost:8080`. Nenhum túnel é iniciado automaticamente. Autenticação e regras de acesso devem ser implementadas antes da demonstração com dados pessoais.

