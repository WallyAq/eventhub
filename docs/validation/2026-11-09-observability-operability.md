# RQ06 e RQ08 — validação de 09/11/2026

## Rastreabilidade implementada

HTTP preserva os identificadores nos cabeçalhos, com validação na borda e nos serviços. A origem da inscrição permanece no snapshot, no pagamento, nas outboxes e nos metadados RabbitMQ. Workers restauram a origem persistida; retentativas e DLQ conservam os identificadores. Logs JSON incluem serviço, requisição, correlação e identificadores de inscrição/mensagem, sem corpo, destinatário ou token. Identity também conserva a origem na sua outbox de e-mail.

Os testes de concorrência verificam contextos separados entre tarefas e threads. Os testes dos consumidores verificam restauração por mensagem e preservação dos metadados ao encaminhar uma falha à DLQ. O Gateway também preserva na resposta e no log a correlação canônica devolvida pelo domínio.

Testes aprovados nesta etapa:

- Python: 31 testes de recursos/correlação em `tests/unit`, 11 do Reporting e 8 do Notification, incluindo SMTP local.
- Node: 22 testes do Identity, 8 do Payment e 11 do Gateway.
- `tests/integration/observability.test.mjs`: aprovado no clone limpo e no ambiente existente. Cria dados sintéticos, publica um evento, reserva uma atividade paga, interrompe o provedor, verifica o pagamento pendente e aguarda a confirmação pelo worker após o retorno do provedor. Confere a origem nos logs de oito componentes, nas mensagens persistidas e nas entregas reais do Notification; o relatório confirma inscrição, valor simulado e série diária. A execução no ambiente existente verifica também o cabeçalho canônico na resposta final do pagamento.

## Instalação em clone limpo

Executado `node scripts/validate-clean-clone.mjs --working-tree`, com snapshot Git temporário do código em desenvolvimento: `a76c178d1cc0192251f38d79d64c387be8c1ba31`. Nenhum branch/HEAD foi alterado e nada foi enviado ao remoto.

O procedimento fez um clone separado em pasta temporária, verificou `.env.example` versionado e sem valores sensíveis, comprovou a ausência de `.env` no Git, gerou credenciais novas e executou os três scripts de inicialização duas vezes sem substituir seus valores. Não copiou a configuração nem os bancos do ambiente atual.

Com porta e projeto Compose próprios, construiu todas as imagens, iniciou PostgreSQL/RabbitMQ em volumes novos, provisionou os bancos e iniciou a pilha completa. Os oito domínios retornaram `ready` e todos os contêineres passaram nos healthchecks, incluindo o provedor fictício. O teste de negócio/correlação descrito acima passou nesse ambiente. A construção incluiu instalação das dependências, sem depender de `node_modules` ou ambientes virtuais do checkout principal.

Ao terminar, o script removeu somente os contêineres, volumes e diretório temporários que criou. Os volumes do projeto `eventhub` foram preservados. Log e relatório local da execução: `tmp/rq08-clean-clone.log` e `tmp/rq08-clean-clone.json`, ignorados pelo Git. O relatório registrou `passed: true`.

O Docker Desktop estava desligado na primeira tentativa e foi iniciado; o preflight agora verifica o daemon antes da cópia/instalação. A segunda execução concluiu o procedimento completo. Alterações posteriores pequenas na resposta canônica do Gateway, no tratamento de pagamentos já concluídos e na outbox do Identity foram cobertas pelos testes unitários e pela integração da versão final no ambiente existente.

O frontend também passou no build de produção e na revisão de interface documentada em [fluxo da organização](2026-11-09-organization-redesign.md). O ambiente existente recebeu as imagens atualizadas sem remoção dos seus volumes.

O comando `trace-registration.mjs` foi conferido com uma inscrição sintética no ambiente existente: a saída reuniu Gateway, Registration, Payment, provedor, Notification e Reporting sem imprimir os dados da conta.

## Uso e limites

Veja o [contrato de observabilidade](../api/observability.md) e o [guia de instalação](../deployment/clean-install.md). A consulta local pode ser feita com `node scripts/trace-registration.mjs UUID --since 30m`. Os logs ficam sujeitos à retenção/recriação dos contêineres; não foi implementado um coletor central de tracing.

O template e o código precisam estar no commit enviado à equipe para serem recebidos por um clone remoto. A validação de desenvolvimento usa o snapshot local justamente para testar as alterações antes desse envio. SMTP permaneceu em mailbox e nenhum e-mail externo foi enviado. Carga de 20×, CI remoto e backup/restauração não foram certificados por esta etapa.
