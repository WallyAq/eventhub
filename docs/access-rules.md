# Perfis, instituições e responsabilidade de eventos

No código e nas APIs, `organization` representa a **instituição** do requisito. `OWNER` e `ORGANIZER` de `organization_members.role` são papéis administrativos dentro dessa instituição; o perfil exclusivo da conta é `users.role`.

## Diagnóstico anterior às alterações

| Regra explícita | Situação anterior | Correção e verificação |
|---|---|---|
| Uma conta possui somente PARTICIPANTE ou ORGANIZADOR | Conflitante: `users.role` aceitava somente `PARTICIPANT`, inclusive contas que criavam instituições e administravam eventos | Perfil escalar `PARTICIPANT` ou `ORGANIZER`; cadastro institucional transacional; API rejeita campos extras; testes HTTP e JWT |
| Organizador possui exatamente uma instituição | Ausente: PK de membros permitia o mesmo usuário em várias organizações e remoção do último vínculo | `UNIQUE(user_id)` e triggers diferidas verificam perfil/vínculo no commit; API não cria segundo vínculo nem remove o único |
| Uma instituição pode ter vários organizadores | Atendido na cardinalidade e preservado | Não existe unicidade de `organization_id` para organizadores; `organization_one_owner` continua limitando somente o papel OWNER |
| Instituição e responsabilidade devem autorizar cada evento | Parcial: qualquer membro da instituição administrava todos os eventos | `events.owner_user_id` e `payload.ownerUserId`, atribuídos pelo servidor ao criador; filtros e guardas conferem os dois vínculos |
| Perfil e instituição não podem vir de manipulação no cliente | Parcial: whitelist no perfil, mas APIs institucionais concediam administração a participantes | Perfil, instituição e versão da sessão confrontados com persistência em cada autenticação; URLs gerenciadas validam o responsável |

A auditoria somente de leitura executada em 10/11/2026 no ambiente Docker local configurado encontrou `identity.compatible=true`, nenhum conflito e zero eventos (`events.compatible=true`, `eventCount=0`). Isso não demonstra o estado de produção. Nenhuma migração foi executada nesse banco durante essa auditoria.

## Contratos

- `POST /auth/register`: corpo existente com `organization` institucional cria atomicamente conta `ORGANIZER`, instituição e vínculo `OWNER`. Sem `organization`, cria `PARTICIPANT`. Campos `role`, `organizationId`, listas de perfis ou identificadores arbitrários são recusados.
- `POST /auth/login`: as telas enviam `area: participant|organization`. Depois de conferir a senha, o servidor confronta a área com o perfil persistido. Área divergente retorna `403 account_area_mismatch` com orientação para a área correta, sem emitir token nem criar sessão. O formulário permanece aberto e mostra o erro; o link para a outra área fica disponível. Login sem `area` continua compatível com clientes de API existentes e não altera o perfil; valores de área inválidos retornam `400`, e senha incorreta mantém o erro genérico `401`.
- `GET /users/me`, cadastro e login retornam `user.role: PARTICIPANT|ORGANIZER` e `user.organizationId: UUID|null`, derivados do banco. O JWT assinado carrega os mesmos atributos; a sessão valida sua correspondência com o banco. Tokens anteriores de participantes sem `organizationId` continuam válidos quando não houve mudança de perfil; classificações de legado incrementam a versão da credencial.
- `/organizations/**` exige organizador com instituição. Criar outra instituição ou remover o vínculo pela API retorna `409 institution_fixed`. Adicionar participante retorna `409 organizer_required`; adicionar organizador de outra instituição retorna `409 institution_fixed`. Repetir um vínculo já existente na mesma instituição é idempotente.
- `GET /events?managed=true`, `GET /events/:id?managed=true`, edição, publicação, cancelamento e atualização de informações públicas exigem `user.role=ORGANIZER`, mesma instituição e `user.id=event.ownerUserId`. Igualdade institucional sozinha não concede acesso. O corpo do editor não aceita `ownerUserId`.
- O serviço Events guarda o UUID de identidade como referência externa; não acessa o banco de Identity. Confere o usuário e o vínculo por APIs explícitas de Identity. `GET /internal/users/:id`, protegido por chave interna, passa também `role` e `organizationId` para auditoria administrativa e integração.
- Serviços de inscrições, presença, certificados e relatórios devem continuar obtendo o evento por `?managed=true` antes das operações de organizador. O gateway não expõe endpoints internos. Dados públicos de eventos omitem `ownerUserId` e e-mails de palestrantes.
- Participantes permanecem livres para consultar eventos publicados de qualquer instituição; a restrição de instituição pertence à administração de eventos.

## Migrações e legado

Não modificar os SQLs `001`–`006` já aplicados. Identity aplica `007_exclusive_profiles_and_institution.sql` usando seu mecanismo existente, transação e checksum. Events passa a registrar migrações com checksum em `event_schema_migrations`; a primeira é `001_event_responsibility.sql`.

Antes de iniciar os serviços novos, construa as imagens e execute os preflights sem iniciar o servidor:

```powershell
docker compose run --rm --no-deps identity node src/database/access-preflight.js
docker compose run --rm --no-deps events python -m app.access_preflight
```

Esses comandos usam a configuração selecionada do Compose. Para homologação, usar obrigatoriamente projeto e arquivo de ambiente isolados, por exemplo `docker compose -p eventhub-rules-qa --env-file tmp/rules-qa/.env ...`. Os relatórios contêm apenas identificadores, perfis, contagens e motivos; não imprimem credenciais ou contatos.

As migrações abortam a transação se houver participantes com vínculos administrativos, organizadores sem uma única instituição, múltiplos vínculos, responsáveis ausentes ou identidade estrutural divergente no payload do evento. Nada é excluído ou escolhido automaticamente.

Uma conta legada `PARTICIPANT` com exatamente um vínculo administrativo só pode ser classificada após revisão explícita. O plano abaixo é um formato, e os UUIDs devem corresponder a dados revisados:

```json
[{"userId":"UUID_REVISADO","organizationId":"UUID_EXISTENTE_REVISADO","reason":"Justificativa documentada da classificação"}]
```

Com o plano montado no contêiner: `node src/database/resolve-legacy-profiles.js /tmp/reviewed-profiles.json`. O script valida cada vínculo existente, aceita somente vínculos únicos, registra `legacy_profile_resolutions` e invalida sessões antigas. Não cria ou remove vínculos. Fica indisponível após a migração 007.

Eventos antigos sem responsável exigem outro plano revisado:

```json
[{"eventId":"UUID_EVENTO_REVISADO","organizationId":"UUID_INSTITUICAO_EXISTENTE","ownerUserId":"UUID_ORGANIZADOR_REVISADO","reason":"Justificativa documentada da responsabilidade"}]
```

Executar `python -m app.resolve_legacy_responsibility /tmp/reviewed-events.json` após a classificação dos perfis e atualização de Identity. O script valida o perfil e instituição por Identity, preserva os demais campos e registra `event_ownership_resolutions`. Não transfere responsáveis já definidos e fica indisponível após a migração de responsabilidade.

Conflitos com múltiplas instituições e divergências estruturais exigem decisão específica e plano de saneamento que preserve o histórico. Esses scripts recusam esses casos. Não escolher a instituição mais antiga, o único OWNER ou o primeiro membro como heurística.

## Decisões ainda não definidas

O requisito não define ingresso, transferência institucional, desligamento de organizador ou delegação de responsabilidade de evento. O esquema permite vários organizadores na mesma instituição; a API pública não converte uma conta participante nem move um organizador para admiti-lo. Até existir uma política de ingresso aprovada, provisionamento administrativo de um novo organizador deve ser explícito, transacional e auditado, criando o perfil e seu vínculo juntos. Isso não é uma regra de aprovação automática inferida do documento.

Atualizar Identity primeiro, depois Events e os consumidores/gateway/frontend, em janela controlada. Conferir backup restaurável de todos os bancos e realizar todo o fluxo em homologação antes de produção. O binário antigo de Identity não suporta contas `ORGANIZER`; reverter somente esse binário sobre o banco migrado não é compatível. Prefira correção posterior; restauração exige parar gravações e restaurar o conjunto de backups consistente, preservando evidências e planejando reconciliação de operações posteriores ao backup.

## Testes reproduzíveis

```powershell
node --test tests/unit/identity-access.test.mjs
tmp/backend-completion-unit-env/Scripts/python.exe -m unittest discover -s tests/unit -p test_event_access.py -v
```

O segundo comando requer as dependências de Events e usa o virtualenv local já existente; um ambiente novo deve instalar `services/events/requirements.txt`. Os testes cobrem requisições HTTP diretas de perfil/vínculo, claims assinadas, divergência da sessão, responsabilidade dentro da mesma instituição, escopo de consultas, mutações e dados públicos. A validação com PostgreSQL e APIs integradas deve ser feita exclusivamente no Compose isolado da suíte de regras.
