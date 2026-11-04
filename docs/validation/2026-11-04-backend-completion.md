# Avaliação do backend em 04/11/2026

> Registro histórico anterior à implementação dos módulos restantes. Consulte a [entrega do backend acadêmico e sua validação](2026-11-04-backend-implemented.md) para o estado atual. As lacunas e falhas abaixo descrevem somente esta avaliação inicial.

O backend do fluxo principal está implementado e é utilizado pelo frontend. A avaliação abaixo distingue o protótipo atual dos módulos previstos no plano; não atribui um percentual de conclusão.

## Implementado

| Parte | Implementação verificada |
| --- | --- |
| Contas e acesso | Identity possui cadastro, login, perfis, troca de senha, organizações e vínculos de membros. Senhas usam scrypt; JWT tem validade de uma hora. |
| Eventos e programação | Event persiste eventos, atividades e palestrantes; autoriza gestão por vínculo institucional e oferece rascunho, publicação e cancelamento. Contatos administrativos de palestrantes não aparecem no catálogo público. |
| Inscrições e vagas | Registration persiste inscrições, controla capacidade sob bloqueio transacional, rejeita duplicidade, mantém reservas com prazo, cancela e promove a fila de espera. A disponibilidade pública é calculada no servidor. |
| Pagamento simulado | Payment registra aprovação ou recusa simulada, protege a operação por inscrição e retoma a conciliação após falha de dependência. Não cobra valores nem coleta dados bancários. |
| Mensageria | Registration grava a outbox na transação da inscrição; RabbitMQ entrega ao Notification, que deduplica, registra a entrega simulada e mantém tentativas e fila de falhas. |
| Infraestrutura local | Docker Compose configura Gateway, cinco aplicações e cinco bancos lógicos próprios, além de Nginx, PostgreSQL e RabbitMQ. Há logs com identificador de requisição e consultas de saúde/prontidão. |

Fontes: [Identity](../../services/identity/src/users/service.js), [organizações](../../services/identity/src/routes/organizations.js), [Event](../../services/events/app/domain.py), [Registration](../../services/registrations/app/domain.py), [Payment](../../services/payments/src/payments.js), [Notification](../../services/notifications/app/consumer.py) e [Compose](../../compose.yaml).

## O que falta no produto previsto

Além dos módulos abaixo, a validação operacional atual encontrou indisponibilidade no cadastro; estabilizar esse caminho é uma pendência para considerar a entrega validada. Os detalhes estão na seção de validação.

1. Gestão de inscrições pelo organizador: a listagem atual retorna somente inscrições do próprio usuário. Faltam contratos e telas para consultar e gerenciar os participantes de eventos da organização, com autorização correspondente.
2. Attendance: check-in e registro de presença sem duplicidade. Esse serviço está apenas modelado, sem aplicação, container ou banco.
3. Certificate: emissão, download e validação de certificados após término e presença válida. Está apenas modelado; o término da atividade exibido no histórico não comprova presença.
4. Reporting: relatórios e projeções do domínio. Também está apenas modelado.
5. Entrega real de e-mail: a recuperação usa uma caixa local simulada; o Notification registra `SENT` sem enviar mensagem externa.
6. Ciclo de contas e sessões: JWTs já emitidos continuam válidos até expirar depois de sair ou alterar/redefinir a senha. Revogação imediata, alteração/verificação do e-mail e remoção de membros não estão implementadas nos contratos atuais.

Essas lacunas estão apoiadas no [plano](../PLAN.md), na [arquitetura](../architecture/README.md), na [listagem de inscrições](../../services/registrations/app/domain.py), no [contrato de identidade](../api/identity.md) e nos [contratos de negócio](../api/business.md).

## Escopo acadêmico e uso público

Para um MVP acadêmico de cadastro, publicação de eventos, inscrição e pagamento simulado, o backend principal existe. A conclusão desse recorte depende dos requisitos da entrega e da validação atual dos fluxos. Os módulos de presença, certificados e relatórios são necessários para concluir o produto mais amplo descrito no plano.

Pagamento real é uma evolução separada, caso a entrega exija cobrança: seriam necessários provedor, confirmação autenticada e estornos. Hospedagem contínua, backups com restauração testada, monitoramento, automação de validação e identidades internas específicas por serviço são preparações para operação pública; não são automaticamente requisitos do protótipo acadêmico. O repositório contém infraestrutura local e testes, mas não foram encontrados workflows de CI nem scripts de backup/restauração nesta inspeção.

## Validação desta avaliação

Esta entrega fez inspeção do código, contratos, infraestrutura e testes, além das tentativas de integração descritas abaixo. A suíte completa não está aprovada nesta rodada. Relatórios de validação anteriores continuam sendo evidências históricas dos respectivos recortes.

O teste de concorrência RN01 em [business.test.mjs](../../tests/integration/business.test.mjs) foi alinhado à rejeição atual de duplicidade: doze solicitações concorrentes com chaves distintas entre dois usuários devem criar duas inscrições, rejeitar dez duplicidades com `409`, persistir uma inscrição por usuário e manter uma confirmação e uma espera para a última vaga. As verificações de propriedade, cancelamento e promoção da fila foram preservadas.

Resultados desta rodada:

- Frontend: TypeScript/Vite e build Docker aprovados; **11 testes de interface aprovados**, incluindo inscrição existente antes dos dados pessoais e o checkout de quatro etapas. São cenários com API controlada, separados da integração real. Veja [aviso antecipado](2026-11-04-existing-enrollment.md).
- Os dez contêineres foram restabelecidos e chegaram a `healthy`. O frontend respondeu `200` com o novo bundle. `/api/status` chegou a indicar os cinco serviços `ready`.
- A imagem em execução do Registration foi comparada ao `services/registrations/app/domain.py`: conteúdos iguais.
- `node --test tests/integration/business.test.mjs` foi tentado duas vezes: ambas falharam no cadastro inicial da conta sintética, com `503` em vez de `201`. Portanto, **RN01 e os demais subtestes não chegaram a ser executados nesta rodada**. Logs: `tmp/early-enrollment-business-initial.log` e `tmp/early-enrollment-business.log`.
- Os logs do Gateway registraram os retornos `503` em aproximadamente 5,5 e 8,3 segundos; o encaminhamento de identidade possui prazo de 5 segundos. Em uma consulta posterior, o Identity respondeu `/ready` com `503`, enquanto os outros quatro serviços responderam prontos. O diagnóstico de saúde não comprova o funcionamento de cadastro/login.
- Foi observada pressão de memória no computador durante a rodada, chegando a cerca de 13 MB livres e a requisições simples de saúde que demoraram vários segundos. Isso pode contribuir para os timeouts; não foi comprovado como causa única. O limite de tempo e a proteção de senhas não foram alterados para contornar a falha.

O ambiente terminou com os serviços religados. A estabilidade do Identity e uma nova execução da integração real permanecem pendentes; não declarar o backend integralmente validado com base nos testes de interface.

O arquivo [gateway/test/status.test.js](../../gateway/test/status.test.js) verifica somente o diagnóstico diante de dependência indisponível; não mede a conclusão de todos os recursos do backend.
