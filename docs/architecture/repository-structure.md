# Organização do repositório

A estrutura externa foi mantida: frontend, Gateway, cinco serviços independentes, infraestrutura e testes de integração. A reorganização interna separa composição da aplicação, transporte HTTP, observabilidade e conexão ao banco. Não altera endpoints, nomes DNS, bancos, portas ou contratos existentes.

## Frontend

```text
frontend/src/
  main.tsx                    Entrada React e estilos globais
  App.tsx                     Rotas da aplicação
  auth/AuthContext.tsx        Sessão de uma hora, expiração e sincronização de abas
  auth/session.ts            Persistência e restauração com prazo absoluto
  auth/access.ts             Configuração dos dois fluxos de acesso
  components/AuthLayout.tsx   Layout contextual por área
  components/AppLayout.tsx    Navegação, menu da conta e confirmação de saída
  components/Brand.tsx        Marca com símbolo original do Figma
  components/auth/           Formulários compartilhados de conta
  components/form/           Campo de senha reutilizável
  components/profile/        Troca de senha autenticada
  components/events/         Programação do evento e modais de palestrante/atividade
  pages/AccessPage.tsx        Escolha entre participante e organização
  pages/participant/          Login e cadastro do participante
  pages/organization/         Login, cadastro e perfil institucional
  pages/ProfilePage.tsx       Dados pessoais e senha da conta
  pages/OrganizationsPage.tsx Organizações e equipe
  pages/EnvironmentPage.tsx    Página provisória de diagnóstico
  pages/RecoveryPage.tsx       Recuperação e redefinição com token de uso único
  pages/events/               Catálogo, gestão, detalhes e formulário de evento
  pages/registrations/        Reserva, pagamento e inscrições do participante
  services/business.ts        Contratos e acesso às APIs de negócio
  services/api.ts             Comunicação HTTP
  types/status.ts             Tipos do contrato de diagnóstico
```

Novas páginas entram em pages. React Router faz a navegação e o Context do React mantém a sessão em memória, restaurando o cache de localStorage por até uma hora, sem biblioteca de estado adicional. Reload não renova o prazo; logout remove o cache e sincroniza a saída entre abas.

frontend/public/figma guarda os assets locais exportados do design. Os estilos em style.css, auth.css e access.css adaptam as telas sem framework visual. frontend/tests contém testes de navegador Playwright; capturas ficam em frontend/test-results, fora do versionamento. Veja o [recorte aplicado](../validation/2026-10-29-figma.md).

O recorte de [formulários do organizador](../validation/2026-11-03-organizer.md) usa componentes em components/events. EventProgram compõe cards e edição; OrganizerDialog fornece o modal acessível; SpeakerDialog e ActivityDialog editam rascunhos locais. SpeakerPicker busca e seleciona responsáveis na lista de palestrantes desse rascunho. Somente salvar o formulário de evento persiste os dados, utilizando o cliente HTTP existente. O Event continua proprietário dos palestrantes e da programação; Registration aplica a política de espera recebida pela API, sem acesso ao banco de Event.

O perfil institucional mantém consulta e edição na mesma página em pages/organization, usando o cliente de organizations. O papel OWNER permite editar os dados da instituição; a troca de senha reutiliza components/profile/PasswordSection e altera a credencial pessoal da conta autenticada.

ManagePage diferencia a organização sem eventos de uma busca sem resultados. O convite para criar a primeira programação usa a rota do editor existente; os filtros continuam operando sobre os eventos que o usuário pode administrar.

O [fluxo do participante](../validation/2026-11-03-participant.md) mantém catálogo em pages/events e inscrições/checkout em pages/registrations. As quatro etapas reutilizam as APIs de Event, Registration e Payment; os respectivos estilos ficam em catalog.css, my-registrations.css e checkout.css. O comprovante representa uma inscrição confirmada e não antecipa a implementação de presença ou certificados.

As [referências complementares de 04/11](../validation/2026-11-04-participant.md) acrescentam details.css e participant-profile.css. AppLayout compartilha o rodapé participante; Brand usa a imagem com canal alpha em public/figma. A separação de inscrições em abas é uma projeção dos estados e datas recebidos, sem novos estados no Registration. A consulta e edição de perfil continuam utilizando o contrato Identity existente.

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

routes/identity.js encaminha endpoints de identidade e organizações. routes/business.js encaminha rotas explícitas de Event, Registration e Payment; não publica callbacks internos. security/tokens.js valida JWT com chave pública. O Gateway não é proprietário das regras de inscrição ou pagamento.

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

O comando Uvicorn usa app.main:app. Event e Registration mantêm regras, modelos e acesso ao banco em app/domain.py; Notification mantém consumo em app/consumer.py. Os módulos de diagnóstico não recebem regras de negócio. Essas unidades podem ser separadas em módulos menores quando a evolução do domínio justificar.

## Infraestrutura, testes e documentação

- infra/db inicializa bancos e permissões em um volume novo; não substitui migrações de tabelas.
- infra/nginx concentra o acesso HTTP. O Compose mantém a topologia existente de dez containers.
- Testes unitários Node permanecem junto ao serviço. tests/integration verifica contratos e comunicação entre aplicações.
- docs/api guarda contratos; docs/adr registra decisões; docs/validation guarda evidências.

Identity já inclui database/migrations, database/migrate.js, security (hash e JWT), users e organizations (repositórios e regras), routes/users.js, routes/organizations.js e middlewares de autenticação/erros. As migrações dos demais serviços serão introduzidas com suas primeiras tabelas. Não foram criados diretórios vazios de entidades, repositórios, mensageria ou serviços ainda não implementados.

## Avaliação e próximos passos

A divisão externa é adequada ao protótipo de cinco serviços e duas stacks. Separar arquivos internos facilita manutenção sem introduzir pacotes compartilhados ou novos frameworks. Essa organização, por si só, não implementa requisitos funcionais ou garante consistência distribuída.

Identity possui contas, organizações e recuperação. Event, Registration e Payment implementam o fluxo de evento/reserva/pagamento; Notification consome RabbitMQ. Os ADRs 004/005 documentam capacidade, conciliação e outbox. Attendance, Certificate e Reporting continuam modelados para evolução.
