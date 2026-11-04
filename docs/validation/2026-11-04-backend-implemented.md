# Implementação do backend acadêmico — 04/11/2026

Esta entrega complementa a [avaliação inicial](2026-11-04-backend-completion.md). Os módulos que naquela inspeção estavam somente modelados agora possuem aplicação, banco, contêiner, contratos e testes. O pagamento permanece simulado por decisão do usuário. Não houve cobrança, envio de e-mail externo ou publicação pública.

## Implementação

| Área | Resultado |
| --- | --- |
| Gestão de inscrições | Organizador consulta participantes por evento, filtra e pagina, exporta CSV protegido contra fórmulas e cancela inscrições com auditoria e promoção da fila. Vínculo organizacional é verificado em cada operação. |
| Presença | Attendance registra check-in idempotente de inscrição confirmada, dentro da janela da atividade. Titular e organização consultam a presença; outro organizador não acessa os dados. |
| Certificados | Certificate exige inscrição confirmada, evento publicado, atividade encerrada e presença compatível. Emissão idempotente, PDF real, QR Code e verificação pública com dados mínimos. Download e verificação reconsultam as condições atuais. |
| Relatórios | Reporting mantém projeções próprias, consome RabbitMQ com deduplicação e reconcilia as fontes por APIs paginadas. Retorna totais por estado/atividade, presença, receita simulada e CSV. Falhas ou páginas incompletas não produzem um relatório completo fictício. |
| Sessões | Logout revoga o token corrente. Troca/reset de senha e confirmação de e-mail invalidam todas as sessões anteriores. O Gateway consulta a revogação antes de encaminhar operações protegidas. |
| Contas e membros | Alteração/verificação de e-mail usa link único de 30 minutos; preserva o endereço antigo até confirmar. OWNER remove ORGANIZER sem apagar a conta e sem poder remover o responsável. |
| Mensagens | Outbox e Notification suportam mailbox local ou SMTP configurável, com tentativas persistidas. Sucesso só é registrado após entrega aceita; falhas não são tratadas como envio concluído. |
| Infraestrutura | Oito serviços com oito bancos e usuários próprios; 13 contêineres no Compose. Provisionamento idempotente preserva volumes e dados existentes. APIs internas não são expostas pelo Gateway. |
| Interface existente | O botão de certificado em Minhas inscrições emite e baixa o PDF autenticado, com mensagens de requisito ausente/indisponibilidade. A saída aguarda revogação e trata falhas e respostas atrasadas sem apagar uma sessão mais recente. |

Novos contratos: [gestão de inscritos](../api/organizer-registrations.md), [presença](../api/attendance.md), [certificados](../api/certificates.md), [relatórios](../api/reporting.md) e [identidade](../api/identity.md).

Confirmações não podem ser canceladas depois do início da atividade, preservando as regras de presença e certificado. Reservas não pagas e entradas na fila ainda podem ser canceladas após o início; esses estados não comprovam presença.

## Verificação

As imagens atualizadas passaram nos três grupos de integração real:

| Grupo | Resultado final |
| --- | --- |
| `platform.test.mjs` | 3 testes aprovados: aplicações, respostas HTTP/rastreabilidade e isolamento de bancos |
| `business.test.mjs` | 7 cenários aprovados, mais o agrupador: concorrência, pagamento, fila, expiração, notificações, cancelamento e recuperação |
| `backend-completion.test.mjs` | 8 cenários aprovados, mais o agrupador: gestão/vínculos, presença, certificado/PDF, relatórios/replay, cancelamento não confirmado, sessões e e-mail |

Total: **18 cenários de integração real aprovados**. O executor Node contabiliza 20 testes ao incluir os dois agrupadores. A rodada final da complementação terminou com 9/9, sem falhas ou casos ignorados, em aproximadamente três minutos. Os testes mantêm erros 503/504 como falhas, sem repetição automática que esconda indisponibilidade.

Testes unitários aprovados: 112 casos — Gateway 8, Identity 21, Event 18, Registration 24, Attendance 9, Certificate 14, Reporting 11 e Notification 7. Os casos de formatação do PDF verificam mudança de dia entre UTC e Fortaleza e preservação de minutos/segundos. Dependências SMTP são controladas nesses testes; isso não comprova entrega em um provedor externo.

Frontend: build TypeScript/Vite e imagem Docker aprovados. Os 39 testes Playwright de certificado, logout, aviso antecipado de inscrição e telas do participante passaram com respostas de API controladas. Essa validação não substitui a integração real dos serviços.

O teste de plataforma passou em 3 casos, incluindo os oito serviços e as 64 combinações de permissão CONNECT entre usuários/bancos. A regressão real de negócio passou em 8 casos, cobrindo última vaga concorrente, duplicidade, fila, pagamento aprovado/recusado, expiração, cancelamento de evento e recuperação/reentrega de notificações.

O PDF baixado pela integração final foi renderizado com Poppler e inspecionado visualmente: uma página A4 em paisagem, texto acentuado legível, datas locais, duração sem frações extensas e QR Code sem cortes. O arquivo contém 48.773 bytes, formato PDF 1.4 e nenhum JavaScript. A revisão não altera o snapshot nem seu hash.

Ao encerrar, `/api/status` respondeu 200 com os oito serviços `ready`; os 13 contêineres do Compose estavam `running / healthy`. O frontend permanece em `http://localhost:8080`. O provisionamento de bancos foi executado duas vezes para comprovar a repetição idempotente; nenhum volume foi apagado. `git diff --check` terminou sem erros de whitespace; o Git apenas informou a conversão habitual entre LF e CRLF no Windows.

Execuções sucessivas atingiram o limite de autenticação (`429`), por isso os grupos finais foram isolados por reinício da instância Identity, preservando o banco. Uma tentativa posterior ao build também parou com timeout no cadastro; a consulta subsequente confirmou os oito serviços prontos e a repetição integral passou. Os limites e as asserções de erro foram preservados; as tentativas malsucedidas não contam como sucesso. Logs de diagnóstico permanecem em `tmp/backend-completion-*`. O computador tem aproximadamente 8 GB de RAM e apresentou pressão de memória/latência após builds; não executar build e Playwright juntos nesse ambiente.

As fixtures criam somente contas `qa-backend-completion-*` em `example.test` e eventos sintéticos. Para verificar atividade em andamento e encerrada sem alterar o relógio do computador, o teste ajusta somente datas da própria fixture, com guardas de IDs, título e conjunto de inscrições no banco de cada domínio. Nenhum serviço usa SQL entre bancos de domínio.

## Próximas integrações

- Criar as telas organizadoras para gestão de inscritos, check-in e relatórios usando as APIs implementadas.
- Integrar a interface de alteração/confirmação de e-mail. O link e o consumo por API estão documentados; a rota visual ainda não existe.
- Configurar SMTP externo quando necessário. A demonstração atual usa mailbox privado local.
- Para operação pública, preparar hospedagem, CI, backups com restauração testada, monitoramento e credenciais internas específicas por serviço.

O PDF não tem assinatura ICP-Brasil; inclui hash do registro e consulta de validade atual pelo QR Code. Relatórios financeiros representam preços de inscrições confirmadas em pagamento simulado, sem liquidação bancária. Essas limitações estão explícitas nos contratos.
