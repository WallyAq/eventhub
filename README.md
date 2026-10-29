# EventHub

Plataforma acadêmica da UECE para gerenciamento de eventos, com microsserviços Node.js e Python.

## Estado atual

Etapa 1: base de infraestrutura e conectividade. Há cinco aplicações de negócio independentes, Gateway, React/TypeScript/Vite, Nginx, PostgreSQL e RabbitMQ. As aplicações possuem diagnóstico e acesso ao próprio banco, mas **não implementam ainda cadastro, autenticação, eventos, inscrições, pagamentos ou notificações**. Não há consumidor RabbitMQ nesta etapa.

A página inicial é provisória; a implementação das telas seguirá o Figma quando o link for fornecido.

## Pré-requisitos e execução

Docker Desktop em modo Linux e Docker Compose. Node.js 24 para desenvolvimento local do frontend/Gateway/serviços Node. Python 3.13 para desenvolvimento local dos serviços FastAPI.

No PowerShell, na raiz:

```powershell
Copy-Item .env.example .env
docker compose up --build -d --wait --wait-timeout 180
```

Não sobrescreva um `.env` existente. Os valores de exemplo são exclusivos para desenvolvimento local. O arquivo `.env` é ignorado pelo Git.

Abra http://localhost:8080. O Nginx publica somente em loopback. Os bancos, broker e aplicações internas não possuem portas publicadas.

```powershell
docker compose ps
docker compose logs --tail 100
docker compose down
```

O último comando encerra os containers e preserva os volumes. Não apague volumes para reiniciar o ambiente. O script de bancos só executa em um volume novo; alterar senhas no `.env` não altera usuários já criados no PostgreSQL.

## Validação

Com o ambiente iniciado:

```powershell
node --test tests/integration/platform.test.mjs
```

Os testes verificam Nginx → Gateway → aplicações Node/Python → bancos, respostas 404, rastreabilidade e isolamento dos cinco usuários de banco. A verificação de permissões utiliza `docker compose exec`.

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
- Não há rotas de negócio expostas sem autenticação.

A prontidão atual verifica bancos; não verifica entrega de mensagens ou funcionalidades futuras. RabbitMQ tem seu próprio healthcheck no Compose.

Veja [arquitetura](docs/architecture/README.md), [contrato inicial](docs/api/health.md), [decisões](docs/adr/001-foundation.md) e [plano](docs/PLAN.md).

## Cloudflare Tunnel

O cloudflared já está instalado no computador. Depois de validar localmente, um túnel temporário poderá apontar para `http://localhost:8080`. Nenhum túnel é iniciado automaticamente. Autenticação e regras de acesso devem ser implementadas antes da demonstração com dados pessoais.

