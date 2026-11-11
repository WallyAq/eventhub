# Validação das regras de domínio

Execução em 10/11/2026, ambiente Python local existente em `tmp/backend-completion-unit-env`, usando as dependências dos serviços. Foram executadas suites `unittest` isoladas, sem conectar aos bancos nem enviar notificações reais.

Comando em cada diretório `services/<service>`:

```powershell
& '../../tmp/backend-completion-unit-env/Scripts/python.exe' -m unittest discover -s test -p 'test_rules.py' -v
```

| Serviço | Testes | Resultado | Evidência comportamental |
| --- | ---: | --- | --- |
| Attendance | 5 | OK | Inscrição válida, estados inválidos, vínculo de evento, janela inicial e autorização antes de ler/gravar presença. |
| Certificates | 10 | OK | Emissão na fronteira do término; bloqueio antes, sem presença, IDs divergentes, estados inválidos, evento cancelado; titularidade e integridade de snapshot. |
| Reporting | 10 | OK | Ocupação efetiva, expiração, anomalia explícita, consulta financeira em lotes, dados inesperados/duplicados rejeitados, fonte indisponível sem falsos zeros, autorização em relatório/exportação, CSV seguro. |
| Notifications | 2 | OK | Tentativas limitadas; retry obrigatório confirmado antes do ACK; ausência de rota mantém entrega original não reconhecida. |

Total: **27 testes aprovados**. A simulação de falta de rota imprime `RuntimeError` estruturado esperado; esse log não indica falha do teste. Uma expectativa inicial de teto de tentativas foi corrigida para o limite preexistente de três, após a primeira execução mostrar a divergência no teste.

Esses testes provam regras nas fronteiras de domínio. Eles não substituem as provas de PostgreSQL/concorrência e fluxos HTTP da suite `tests/integration/business-rules.mjs`, nem representam uma implantação. A matriz de requisitos relaciona o alcance e as limitações das evidências.
