# Validação da base — 2026-10-29

Ambiente: Windows, Docker Desktop com containers Linux e WSL 2.

## Resultados executados

- Build dos sete projetos de aplicação concluído, incluindo TypeScript e Vite em modo de produção.
- Docker Compose: dez containers com healthchecks aprovados.
- Testes unitários Node: três testes aprovados (Gateway, Identity e Payment).
- Integração: três testes aprovados. Verificam entrega do frontend, prontidão dos cinco serviços com consulta real aos bancos, requestId, 404 e 25 combinações de permissões de banco.
- Falha controlada: Notification foi parado; /api/status retornou 503, os outros quatro serviços continuaram prontos e Notification voltou ao estado pronto após reinício.
- Confirmado que .env está ignorado pelo Git.

## Correções durante a validação

O primeiro teste de integração foi executado durante a inicialização do PostgreSQL e falhou. O healthcheck inicial por socket podia aceitar o servidor temporário usado pelo script de inicialização. O check agora utiliza TCP em 127.0.0.1; a integração passou após a correção e a prontidão completa do ambiente.

O RabbitMQ recebeu hostname fixo para manter a identidade do nó entre recriações e maior margem de inicialização para Docker Desktop.

## Limites

Não houve inspeção visual em navegador: nenhum navegador estava disponível na ferramenta da sessão. O frontend foi validado por compilação e resposta HTTP, sem teste visual ou de interação do botão.

Não há ainda funcionalidades de negócio, autenticação, testes de concorrência de reservas ou publicação/consumo de mensagens. O teste de Notification nesta entrega verifica apenas isolamento da indisponibilidade e recuperação da aplicação; não comprova entrega de notificações nem RN05.

Os comandos reproduzíveis estão no README.
