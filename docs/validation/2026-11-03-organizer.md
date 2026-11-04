# Fluxo de organizador - formulários de programação

Referência: [EventHub no Figma, página Organizador](https://www.figma.com/design/qfUJ0Eroc1V4MhHwvjQkPl/EventHub--Copy-?node-id=2052-2).

## Recorte implementado

Os frames `2053:2773` (Cadastrar Professor/Palestrante) e `2053:2589` (Nova Atividade do Evento) foram consultados com contexto de implementação e screenshot. Os SVGs originais foram baixados para `frontend/public/figma/organizer`. Os componentes usam React, TypeScript, CSS e os tokens existentes; nenhuma biblioteca visual foi adicionada.

A imagem exportada enviada pelo usuário complementa a referência dos estados de consulta/edição do perfil institucional (`2053:2098` e `2052:1962`) e das sugestões de responsável (`2053:2843`). O perfil usa os dados retornados pelo Identity. O seletor consulta a lista de palestrantes do próprio formulário, sem exemplos fixos na interface.

O painel sem eventos inclui o convite para cadastrar o primeiro evento e a orientação em três etapas. Quando a organização já possui eventos, mas a busca não encontra resultados, a página oferece a limpeza dos filtros. As orientações descrevem apenas funcionalidades disponíveis.

Os formulários são modais acessíveis do editor existente. Funcionam em `/organizacao/eventos/novo` e `/organizacao/eventos/:id`; não constituem páginas com endpoints próprios.

- Professor/palestrante: nome, titulação, instituição, contato e mini-biografia de até 400 caracteres. Cadastro e edição usam um rascunho local; cancelar ou pressionar Escape descarta essa edição.
- Atividade: nome, tipo, descrição/requisitos, palestrante vinculado, data, horários, local, capacidade, política de espera e preço. Datas ficam dentro do período do evento; atividades legadas que atravessam dias preservam a data final.
- Um novo palestrante pode ser cadastrado de dentro do modal de atividade. A seleção guarda seu identificador, e o servidor deriva o nome do responsável a partir desse vínculo.
- A seleção de responsável oferece busca por nome, instituição e titulação, sem distinção de acentos ou maiúsculas. A lista permite navegação por teclado, seleção e troca do vínculo; remover a seleção não exclui o palestrante do evento.
- O perfil institucional abre em modo de consulta. Apenas o responsável da organização pode entrar na edição, salvar ou descartar as alterações. A troca da senha da conta é expandida separadamente e reutiliza o formulário autenticado existente.
- Um CNPJ já cadastrado não pode ser apagado silenciosamente no formulário. Durante uma atualização de senha, o botão de cancelar fica desabilitado junto com os demais controles até a resposta da API; cancelar antes do envio descarta os campos locais.
- Salvar um modal atualiza o formulário do evento. O botão **Salvar rascunho** persiste o conjunto no Event Service, utilizando os endpoints existentes `POST /api/events` e `PUT /api/events/:id`.
- Eventos publicados permanecem imutáveis. A política de lista de espera também fica fixa após a publicação.

## Dados e autorização

Os metadados pertencem ao Event Service e são persistidos no seu JSONB. Os novos campos possuem defaults compatíveis com os eventos já existentes. Não foi criado banco compartilhado nem acesso SQL entre serviços.

`GET /api/events/:id?managed=true` exige vínculo institucional e inclui o contato do palestrante. A consulta pública de detalhes e o catálogo omitem esse e-mail, inclusive para visitantes com sessão. Identificadores de palestrantes duplicados ou referências a palestrantes de outro evento são rejeitados.

O Registration Service continua decidindo ocupação sob o bloqueio do inventário. Quando a atividade lota e `waitlistEnabled=false`, retorna 409 sem criar inscrição em espera. Eventos antigos mantêm a fila habilitada por padrão.

## Validação

Testes unitários: `services/events/test/test_organizer_contract.py` e `services/registrations/test/test_waitlist_policy.py`.

Integração HTTP: `tests/integration/organizer.test.mjs`.

Navegador: `frontend/tests/organizer.spec.ts`; o fluxo ponta a ponta existente em `frontend/tests/business.spec.ts` foi adaptado aos modais.

As capturas de desktop e celular são gravadas no diretório de resultados do Playwright. Os cenários verificam cancelamento, foco, modais aninhados, datas inválidas, assets, ausência de overflow, persistência após reload, autorização, contatos privados, concorrência e compatibilidade com eventos antigos.

Resultados da etapa de programação, em 03/11/2026, antes da complementação por imagem:

| Verificação | Resultado |
| --- | --- |
| TypeScript e build Vite no Docker | Passou |
| Testes unitários do Event | 18 passaram |
| Testes unitários do Registration | 8 passaram |
| Integração HTTP da programação | 6 passaram, incluindo o agrupador e seus cinco cenários |
| Navegador: formulários do organizador | Passou, incluindo cadastro aninhado, cancelamento, foco, desktop/celular e atividade legada de dois dias |
| Navegador: criar/publicar, reservar e pagar | Passou |
| Navegador: recuperação de senha | Passou |
| Revisão das capturas finais | Ícones, campos, header/footer e scroll conferidos em desktop e celular |

Na revisão visual foi corrigida uma sobreposição de ícones nos campos de local e preço. A regressão agora verifica também os espaçamentos efetivos dos inputs, além do carregamento e das proporções dos SVGs.

As execuções iniciais da integração e da preparação do navegador receberam 503/504 enquanto o ambiente estava lento. A consulta final `/api/status` voltou a informar os cinco serviços prontos; as execuções acima foram repetidas com sucesso. A preparação dos testes de navegador aguarda readiness antes de cadastrar contas sintéticas. Não foram ampliados timeouts da aplicação nem reduzidos os parâmetros de proteção das senhas.

Comandos principais executados:

```powershell
docker compose up -d --build --no-deps --wait --wait-timeout 120 events registrations frontend
node --test tests/integration/organizer.test.mjs
npm --prefix frontend run test:e2e -- tests/business.spec.ts -g "organizer creates"
npm --prefix frontend run test:e2e -- tests/organizer.spec.ts
```

Após a correção dos estilos, o frontend foi reconstruído e o teste de organizador foi executado novamente. As verificações de recuperação e do fluxo completo também tiveram execuções aprovadas, sem repetir os cenários já aprovados após uma alteração exclusivamente de CSS dos novos modais.

Na complementação por imagem, a primeira execução aprovou o perfil institucional e o teste de organizador; o fluxo completo encontrou timeout no pagamento. Uma nova execução aprovou novamente o cadastro/perfil, mas encontrou 503 nos detalhes públicos do evento e timeout ao persistir a programação. Os logs do Event registraram `psycopg.errors.ConnectionTimeout` ao abrir conexão (`connect_timeout=3`), enquanto o PostgreSQL tinha apenas sete conexões de cem permitidas, sem bloqueios registrados. O host Windows apresentava cerca de 715 MiB livres e paginação intensa. Essa evidência é compatível com latência sob pressão de memória; não demonstra uma falha de validação dos novos campos. Não foram alterados timeouts, parâmetros de senha ou recursos do Docker para encobrir o resultado.

Validação da versão final, incluindo o painel sem eventos:

| Verificação | Resultado |
| --- | --- |
| TypeScript, build Vite e atualização do frontend pelo Compose | Passou; container saudável |
| Cadastro institucional, edição persistida do perfil e CNPJ obrigatório | Passou em 12,2 s |
| Perfil, cancelamento local, senha pendente, painel vazio, teclado e modais aninhados | As verificações passaram até o envio do evento; capturas desktop/celular revisadas |
| Teste completo de organizador | Falhou ao salvar o evento, com `signal timed out`; não considerado aprovado nesta versão |
| Fluxo completo até pagamento | Não aprovado na complementação: timeout/503 nas dependências |

O comando final foi `npm --prefix frontend run test:e2e -- tests/figma.spec.ts tests/organizer.spec.ts -g 'institution signup|organizer dialogs'`. O log foi salvo em `tmp/organizer-ui-final.log`; os contextos anteriores de erro estão em `tmp/organizer-failures-2026-11-03`. As capturas finais em `frontend/test-results` cobrem o painel vazio, perfil e seletor de responsável. Essa revisão visual não substitui a execução integrada completa, que precisa ser repetida em um ambiente estável.

## Referências e rotas

A integração do Figma atingiu o limite de consultas do plano Starter após devolver os dois formulários completos. A comparação dos estados restantes usa a imagem exportada fornecida pelo usuário, que inclui o perfil institucional e o seletor de responsável. As regras de autorização e validação continuam determinadas pelas APIs e pelos dados reais do sistema.

| Página ou componente | Rota da interface | API utilizada |
| --- | --- | --- |
| Login da organização | `/organizacao/login` | `POST /api/auth/login` |
| Cadastro institucional | `/organizacao/cadastro` | `POST /api/auth/register` |
| Recuperação de acesso | `/recuperar-senha?area=organization` e `/redefinir-senha` | `POST /api/auth/password/forgot`, `POST /api/auth/password/reset` |
| Gestão de eventos, filtros e painel sem eventos | `/organizacao/eventos` | `GET /api/events?managed=true` |
| Perfil institucional: consulta e edição | `/organizacao/perfil` e `/organizacao/perfil/:id` | `GET /api/organizations`, `GET /api/organizations/:id`, `PATCH /api/organizations/:id` |
| Troca de senha da conta | Seção expansível do perfil | `POST /api/users/me/password` |
| Professor/palestrante, atividade e busca de responsável | Modais do editor em `/organizacao/eventos/novo` e `/organizacao/eventos/:id` | Rascunho local; persistência por `POST /api/events` e `PUT /api/events/:id` |

Os popups não possuem endpoints separados. A busca opera sobre a programação do evento em edição; não expõe contatos privados por uma nova API.

O seletor de titulação usa as opções do cadastro de palestrante. O filtro de status mantém os estados reais do Event (`DRAFT`, `PUBLISHED`, `CANCELLED`); grupos por datas distinguem inscrições abertas, eventos em andamento e concluídos. Não há uma janela de inscrições separada que permita inventar outro estado de domínio.

A ação **Abrir Frequência** da imagem depende do Attendance, ainda modelado. A emissão de certificados também permanece fora da implementação inicial; o editor indica essa indisponibilidade. Os links `XXXXXXXXX` do protótipo foram substituídos pela navegação real do projeto.
