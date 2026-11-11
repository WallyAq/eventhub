# Implantação das regras de negócio

Este procedimento prepara e valida a alteração usando o Docker Compose existente. O stack local acessível não comprova implantação remota em produção. Não há destino remoto nem mecanismo externo de publicação identificado no repositório. Homologação e diagnóstico são necessários antes de ativar novas restrições sobre dados reais.

## Preparação e preservação

Identifique explicitamente projeto Compose, arquivo de configuração, revisão anterior do código/imagens e responsável pelo ambiente. Preserve `.env` e as chaves JWT/credenciais internas em armazenamento protegido; não execute scripts de geração sobre a configuração de produção nem exponha valores em logs. Preserve volumes PostgreSQL e RabbitMQ. Não use `docker compose down -v`, não recrie bancos para contornar conflitos e não rode testes de falha contra o projeto real.

Faça backup consistente dos nove bancos de domínio (`identity_db`, `event_db`, `registration_db`, `payment_db`, `provider_db`, `attendance_db`, `certificate_db`, `notification_db`, `reporting_db`) e dos papéis PostgreSQL antes de migrações. Use `pg_dump --format=custom` para cada banco e `pg_dumpall --globals-only` para os papéis. Proteja backups porque contêm dados e hashes de senha. Preserve as definições/persistência RabbitMQ e o estado das outboxes; e-mails aceitos por SMTP não podem ser desfeitos por restauração de banco.

**Backup verificado** exige restaurar todos os dumps em PostgreSQL isolado compatível, executar `pg_restore --list` e restauração sem erro, conferir contagens, chaves e invariantes e registrar revisão/hora dos dumps. Tamanho não zero sozinho não demonstra restaurabilidade. Para consistência entre serviços, abra uma janela de manutenção de gravações, deixe transações terminarem e registre como tratar mensagens já publicadas e filas ao restaurar. Não restaure apenas um banco arbitrariamente após aceitar novas inscrições.

O auxiliar local abaixo usa explicitamente o projeto fonte `eventhub`/`.env` e o PostgreSQL isolado de `eventhub-rules-qa`/`tmp/rules-qa/.env`. Antes de executá-lo, confira esses destinos e prepare o QA. Ele exporta papéis e nove dumps custom, restaura cada dump em um banco novo `rules_backup_verify_<timestamp>_<índice>` no QA, conta tabelas, remove somente esse clone ao terminar e grava hashes/resultado em `tmp/rules-backups/<timestamp>/manifest.json`. Não altera os bancos de aplicação do QA nem restaura o arquivo de papéis no destino.

```powershell
node scripts/backup-local-verified.mjs
```

**Evidência local em 10/11/2026: nove dumps restaurados, 9/9, em clones de QA.** O manifesto `tmp/rules-backups/20261111005248655/manifest.json` registra `sourceProject=eventhub`, `verificationProject=eventhub-rules-qa`, SHA-256 dos dumps/papéis e `tableCount` por banco. A origem é o stack local; não é backup de produção. O manifesto demonstra restauração técnica dos dumps e contagem de tabelas; complete a comparação de linhas, chaves/invariantes, inspeção do catálogo com `pg_restore --list`, validação dos papéis e plano de RabbitMQ/outboxes exigidos acima. Os nove dumps sequenciais só representam um ponto consistente entre serviços quando não há gravações durante a captura.

## Diagnóstico antes de restrições

O script abaixo lê dados; o destino e o arquivo de ambiente devem ser escolhidos conscientemente. O arquivo de diagnóstico contém IDs operacionais e precisa de proteção.

```powershell
node scripts/audit-business-data.mjs --project eventhub --env-file .env --output tmp/rules-current-data-audit.json
```

Diagnostique contas com perfis inválidos/múltiplos, organizadores sem instituição ou com múltiplas, instituições inexistentes, eventos com instituição/responsável incompatíveis, ocupação excedente, inscrição/reserva/pagamento incoerentes e presença/certificado desconectados. Leitura sem linhas no stack local não é evidência sobre dados remotos.

Conflitos não são corrigidos com exclusão ou escolha automática. Produza mapeamento explícito aprovado para cada conta/evento legado, preservando IDs e histórico. Um organizador legado com múltiplas instituições requer decisão de qual vínculo manter e de quem assume os eventos restantes; isso não pode gerar novo segundo perfil na mesma conta. Um evento sem responsável exige mapear um organizador da sua instituição. Migrações devem parar com diagnóstico enquanto persistirem ambiguidades. Execute e arquive novamente o diagnóstico após aplicar os mapeamentos aprovados na cópia de homologação.

Para inscrições e pagamentos, o diagnóstico deve resultar em um plano por ID e evidência, antes de qualquer reparação:

- Ocupação excedente: confronte reservas vigentes, confirmações e histórico da capacidade. Reservas comprovadamente vencidas seguem a expiração existente; não cancele confirmações nem aumente a capacidade publicada para fazer a restrição passar. Os casos restantes exigem decisão do responsável pelo evento, preservando o histórico.
- Reserva pendente sem prazo válido: procure a configuração vigente na criação, mensagens e registros de execução. Não reconstrua um prazo desconhecido usando o TTL atual sem revisão explícita.
- Confirmação paga sem recibo local: confronte inscrição, usuário, valor e referência com a transação proprietária de Payments/Provider. Um recibo só pode ser reconstituído por reparação versionada e auditada quando houver prova de aprovação correspondente. Ausência de prova mantém o conflito; não crie uma aprovação fictícia.
- Pagamento tardio ou vínculo divergente: preserve transação e inscrição. Uma aprovação externa posterior ao cancelamento/expiração não reativa a inscrição. Identifique o estado efetivo e a referência correta por contratos/backup; pagamento sem inscrição não deve ser apagado. Reembolso real e casos sem prova exigem decisão específica, pois o projeto usa simulação.

O ambiente local diagnosticado nesta entrega estava vazio; nenhuma dessas reparações de histórico foi necessária ou executada nele. Os planos explícitos de perfil e responsabilidade descritos em `docs/access-rules.md` não saneiam automaticamente pagamentos.

## Homologação isolada

```powershell
node scripts/init-rules-qa.mjs
docker compose -p eventhub-rules-qa --env-file tmp/rules-qa/.env up -d --build --wait --wait-timeout 600
docker compose -p eventhub-rules-qa --env-file tmp/rules-qa/.env ps
$qaStatus = Invoke-RestMethod -Uri http://127.0.0.1:18080/api/status
if ($qaStatus.status -ne 'ready') { throw 'QA ainda não está pronto; verificar serviços e logs antes dos testes.' }
node --test tests/integration/business-rules.mjs
node --test tests/integration/capacity-isolation.mjs
node --test tests/integration/access-migrations.mjs
node --test tests/integration/payment-recovery.mjs
node tests/integration/frontend-live.mjs
```

O bootstrap de QA cria chaves e configuração novas no diretório temporário, porta 18080, `RESERVATION_TTL_SECONDS=120` e projeto/volumes separados; não reutiliza `.env` atual nem dados reais. Uma configuração QA já existente é preservada pelo bootstrap: conferir o TTL efetivo antes do ensaio, sem imprimir os demais valores/segredos. O prazo de 120 segundos é de teste; o padrão do produto continua 900 segundos.

Build e inicialização Docker podem demorar vários minutos com o stack frio. Aguarde o término dos builds e das restaurações; não concorra essas operações com a suíte HTTP. Nesta máquina com RAM limitada, mantenha somente um stack de aplicação completo ativo por vez; o backup usa apenas as instâncias PostgreSQL necessárias à restauração isolada. `--wait` aguarda os healthchecks, mas os checks de processo não substituem as dependências: `/api/status` precisa retornar `status=ready` e todos os serviços prontos antes da suíte. Se o comando falhar ou retornar `degraded`, examine `ps` e os logs dos serviços indicados, corrija a causa e repita a readiness. Não iniciar os testes durante migração/build nem interpretar conexão recusada nesse período como evidência sobre a regra de negócio.

A suíte fixa o projeto de QA e injeta falhas/fixtures somente nele. Não mude essas proteções para apontar a suíte para produção. Execute as quatro suítes integradas e a verificação de UI em sequência; os ensaios de negócio/recuperação param e reiniciam dependências de propósito. O ensaio de negócio cobre contratos entre Node/Python, concorrência, estados, propriedade, callbacks, presença e certificados; consultas aos relatórios devem distinguir falha parcial de Payments de zero pagamentos. A suíte de isolamento cria somente schemas descartáveis no PostgreSQL de QA, reproduz o problema histórico de snapshot de `REPEATABLE READ` com a migração `001` e verifica a correção `002` nos três níveis de isolamento. A reprodução deliberada da anomalia é confinada ao schema de teste. A suíte `access-migrations.mjs` confere preflight que preserva legado ambíguo e as restrições de perfil/instituição no commit, também em schemas descartáveis de QA. `payment-recovery.mjs` usa as fixtures de `business-rules.mjs` para testar provedor indisponível, reconciliação e aprovação posterior a cancelamento. `frontend-live.mjs` também usa as fixtures QA e o Chromium instalado nas dependências do frontend, exercitando APIs reais e gerando capturas/evidência de navegação.

**Estado registrado em 10/11/2026:** isolamento de capacidade aprovado no PostgreSQL QA (**5 PASS, 0 FAIL**, aproximadamente 140,8 s); migrações de acesso/legado aprovadas (**4 PASS, 0 FAIL**, aproximadamente 30,5 s); suíte HTTP de negócio aprovada (**8 PASS, 0 FAIL**, saída 0, aproximadamente 97,6 s); recuperação de pagamentos aprovada (**3 PASS, 0 FAIL**, aproximadamente 11,57 s). Somados aos 53 testes isolados/de navegador: **73 testes aprovados**. Saída final da suíte HTTP em `tmp/rules-qa/integration-results.log`. Tentativas anteriores tiveram timeout de inicialização e HTTP 503 no cadastro durante builds/restaurações concorrentes; a execução posterior à readiness passou. [Resumo de implementação e evidências](../validation/implementation-summary.md).

A navegação com backend QA real aprovou **7 verificações**, com **16 screenshots** em desktop de 1440 px e mobile de 390 px e `errors=[]`. Evidência: `output/visual-audit/2026-11-10/live/verification.json`. Os fluxos incluem entrada dos dois perfis, catálogo, inscrição gratuita/paga, aprovação, bloqueio de área indevida, instituição fixa, preview e indicadores reais. Essas verificações são adicionais aos 73 testes contabilizados.

As suites de domínio podem ser executadas em cada imagem ou ambiente Python com os requisitos do serviço. Exemplo a partir da raiz, usando a imagem de QA e os testes montados como leitura:

```powershell
docker compose -p eventhub-rules-qa --env-file tmp/rules-qa/.env run --rm --no-deps -v "${PWD}/services/reporting/test:/app/test:ro" reporting python -m unittest discover -s test -p test_rules.py -v
```

Repita para `attendance`, `certificates` e `notifications`, mudando serviço e diretório montado. Não é necessário subir o serviço para os testes de domínio: as dependências de API/banco são substituídas nas fronteiras relevantes. Testes de concorrência real e integridade persistente pertencem à suite integrada de QA.

## Ordem de atualização

1. Verifique restauração do backup, contrato novo em homologação, ausência de conflitos e revisão anterior disponível. Registre diagnóstico e revisão exata.
2. Provisione bancos de serviços que ainda não existirem pelo bootstrap idempotente existente, preservando usuários/senhas/volumes. `scripts/provision-backend-databases.mjs` usa o projeto padrão; para outro projeto, configure explicitamente `COMPOSE_PROJECT_NAME` e o ambiente do Compose antes de executar ou use o comando Compose equivalente com `-p` e `--env-file`.
3. Aplique Identity e Events compatíveis com os novos contratos e mapeamentos legados aprovados; valide perfil, instituição e responsabilidade antes de liberar operações administrativas. Uma interface antiga pode receber 403 de modo seguro, mas não deve permanecer disponível para gravações incompatíveis.
4. Atualize Registrations com `001_registration_integrity.sql` e depois `002_capacity_isolation.sql`; a segunda introduz a revisão do inventário para impedir escrita concorrente com snapshot antigo de `REPEATABLE READ`. Atualize Payments/Provider com query interna, tratamento idempotente e `001_payment_integrity.sql`. Confirme checksum de migrações e ausência de erros de inicialização. Workers só processam estados válidos; novos contratos são aditivos quando possível.
5. Atualize Attendance, Certificates, Notifications e Reporting. Reporting recebe `PAYMENTS_URL` no Compose; sem a fonte, o restante dos indicadores continua disponível e o bloco de pagamentos se declara indisponível.
6. Atualize gateway/frontend e Nginx pelo processo Compose existente. Teste autenticação dos dois perfis, catálogo, inscrição gratuita/paga, pagamento simulado, gestão autorizada, relatórios e exportação. Não envie e-mail real em teste sem destinatário controlado.

Cada serviço inicializa somente suas tabelas/migrações sob trava. Migração com checksum divergente ou diagnóstico impeditivo deve interromper a inicialização. Não edite uma migração já aplicada; crie próxima versão. A mudança de regras de perfil e responsabilidade exige atualização coordenada: código anterior que escreve estados agora proibidos não é uma reversão segura.

Os registros são `identity_db.schema_migrations` (Identity `007_exclusive_profiles_and_institution.sql`), `event_db.event_schema_migrations` (Events `001_event_responsibility.sql`), `registration_db.schema_migrations` (Registrations `001` e `002`) e `payment_db.payment_schema_migrations` (Payments `001`). Compare com os SHA-256 do [resumo desta revisão](../validation/implementation-summary.md), normalizando CRLF para LF como os loaders.

## Promoção validada ao stack local

O comando abaixo destina-se exclusivamente ao projeto Compose local `eventhub`, publicado na porta 8080. Ele exige evidência da suíte HTTP aprovada, backup local com nove restaurações/hashes válidos, UI QA aprovada e auditoria sem conflitos. Recusa contexto Docker remoto, preserva tags das imagens anteriores e promove exatamente os IDs de imagem do QA, sem rebuild ou regeneração de credenciais. Sem `--apply-local`, apresenta a preparação sem alterar os contêineres.

```powershell
node scripts/promote-local-validated.mjs --backup-manifest tmp/rules-backups/20261111005248655/manifest.json --ui-evidence output/visual-audit/2026-11-10/live/verification.json --apply-local
```

Durante a aplicação, o auxiliar para o QA para liberar RAM, fecha o Nginx local durante a atualização coordenada e inicia os grupos de serviços locais pela ordem das dependências, preservando volumes/configuração. Não mantenha dois stacks de aplicação completos ativos ao mesmo tempo nesta máquina. O registro `tmp/rules-qa/local-deployment.json` guarda IDs anteriores/validados, tags para retorno, destino, auditoria e readiness. Só `status=updated_and_ready`, acompanhado de `/api/status` pronto e verificação posterior do destino, permite declarar a promoção concluída.

**Estado até este registro: promoção preparada, resultado da aplicação ainda não registrado.** O backup local 9/9 e a UI QA já foram verificados. Produção remota permanece sem destino identificado/acessível; promover para 8080 não equivale a atualizar produção remota.

## Verificação e reversão

Após atualizar o destino explicitamente escolhido, registre `docker compose ... ps`, `/health` e `/ready` dos serviços, logs de migração/reconciliação, contagens/invariantes pós-migração e smoke tests sem dados de terceiros. Verifique autorização direta por ID, capacidade, reservas vencidas, pagamentos pendentes/tardios, outbox não publicada e filas de falhas. Mantenha o identificador de correlação de cada operação de verificação. Só declare produção atualizada com evidência desse destino e verificação posterior.

Se código novo falhar antes de novas gravações, mantenha a aplicação em manutenção e retorne as imagens/revisão anteriores compatíveis, preservando bancos e volumes. Não remova restrições novas para fazer código incompatível funcionar. Se já houve gravação, prefira correção progressiva; a restauração exige janela coordenada, todos os bancos e estado das mensagens, com decisão explícita sobre operações posteriores ao backup. Revalide integridade e autorizações antes de reabrir. Snapshots/histórico de inscrições/certificados não são descartados para passar uma migração.

Pendências de produção só podem ser resolvidas com destino de implantação e acesso autorizados, backup restaurado e decisões sobre eventuais conflitos reais. O trabalho local pode ser concluído independentemente desses acessos.
