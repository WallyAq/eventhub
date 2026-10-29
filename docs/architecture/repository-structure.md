# Organização do repositório

A estrutura externa foi mantida: frontend, Gateway, cinco serviços independentes, infraestrutura e testes de integração. A reorganização interna separa composição da aplicação, transporte HTTP, observabilidade e conexão ao banco. Não altera endpoints, nomes DNS, bancos, portas ou contratos existentes.

## Frontend

```text
frontend/src/
  main.tsx                    Entrada React e estilos globais
  App.tsx                     Rotas da aplicação
  auth/AuthContext.tsx        Sessão em memória e expiração
  auth/access.ts             Configuração dos dois fluxos de acesso
  components/AuthLayout.tsx   Layout contextual por área
  components/auth/           Formulários compartilhados de conta
  pages/AccessPage.tsx        Escolha entre participante e organização
  pages/participant/          Login e cadastro do participante
  pages/organization/         Login e cadastro do responsável
  pages/ProfilePage.tsx       Consulta e atualização do próprio nome
  pages/OrganizationsPage.tsx Organizações e equipe
  pages/EnvironmentPage.tsx    Página provisória de diagnóstico
  services/api.ts             Comunicação HTTP
  types/status.ts             Tipos do contrato de diagnóstico
```

Novas páginas entram em pages. React Router faz a navegação e o Context do React mantém a sessão em memória, sem biblioteca de estado adicional.

Os dois acessos possuem rotas, textos, navegação e destinos próprios. Os formulários de credenciais são compartilhados para manter validação e tratamento de erros consistentes. Eles usam o mesmo Identity; login de organização não cria papel global nem concede acesso a equipes sem vínculo. Uma sessão pessoal já válida pode ser reutilizada entre áreas. Logout e expiração nas páginas protegidas retornam ao login da área correspondente.

## Gateway

```text
gateway/src/
  server.js                      Inicialização e encerramento do processo
  app.js                         Composição Express
  config/services.js             Endereços das dependências
  middleware/request-logging.js  Rastreabilidade HTTP
  routes/health.js               Diagnóstico local e das dependências
```

routes/identity.js encaminha somente os endpoints explícitos de cadastro/login e perfil. security/tokens.js valida JWT com chave pública. O Gateway não é proprietário das regras de inscrição ou pagamento.

## Identity e Payment

Cada serviço Node mantém suas próprias dependências, Dockerfile e testes em test.

```text
src/
  server.js                      Inicialização e encerramento
  app.js                         Composição Express
  database/pool.js               Configuração e criação do pool PostgreSQL
  middleware/request-logging.js  Logs e requestId
  routes/health.js               Liveness e prontidão do banco
```

As operações de negócio devem ser agrupadas por funcionalidade à medida que surgirem. Acesso SQL fica no serviço proprietário; módulos não devem importar código-fonte de outros microsserviços.

## Event, Registration e Notification

Cada serviço Python mantém suas próprias dependências e Dockerfile.

```text
app/
  main.py          Composição FastAPI e registro das rotas
  api/health.py    Rotas HTTP de diagnóstico
  database.py      Verificação de conectividade com o banco próprio
  observability.py Logs e requestId
```

O comando Uvicorn continua usando app.main:app. Novas funcionalidades terão rotas e regras próprias; os módulos de diagnóstico não receberão regras de negócio.

## Infraestrutura, testes e documentação

- infra/db inicializa bancos e permissões em um volume novo; não substitui migrações de tabelas.
- infra/nginx concentra o acesso HTTP. O Compose mantém a topologia existente de dez containers.
- Testes unitários Node permanecem junto ao serviço. tests/integration verifica contratos e comunicação entre aplicações.
- docs/api guarda contratos; docs/adr registra decisões; docs/validation guarda evidências.

Identity já inclui database/migrations, database/migrate.js, security (hash e JWT), users e organizations (repositórios e regras), routes/users.js, routes/organizations.js e middlewares de autenticação/erros. As migrações dos demais serviços serão introduzidas com suas primeiras tabelas. Não foram criados diretórios vazios de entidades, repositórios, mensageria ou serviços ainda não implementados.

## Avaliação e próximos passos

A divisão externa é adequada ao protótipo de cinco serviços e duas stacks. Separar arquivos internos facilita manutenção sem introduzir pacotes compartilhados ou novos frameworks. Essa organização, por si só, não implementa requisitos funcionais ou garante consistência distribuída.

Identity possui participantes, organizações e vínculos de organizadores, com contratos, migrações e autorização por usuário e organização. O próximo incremento é implementar eventos e atividades, seguido do fluxo de reserva/pagamento com testes concorrentes e tratamento de falhas. A documentação arquitetural completa e os ADRs de consistência e mensageria continuam pendentes.
