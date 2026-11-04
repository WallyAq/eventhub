# Contrato de diagnóstico — v0.1

## GET /api/health

200: `{"service":"gateway","status":"ok"}`.

Indica somente que o processo do Gateway responde.

## GET /api/status

Consulta /ready de cada aplicação usando DNS interno Docker, com timeout de 3 segundos por chamada, em paralelo.

200 quando todos respondem prontos; 503 se ao menos um falhar:

```json
{
  "status": "degraded",
  "services": [
    {"name": "identity", "status": "ready"},
    {"name": "events", "status": "ready"},
    {"name": "registrations", "status": "ready"},
    {"name": "payments", "status": "ready"},
    {"name": "notifications", "status": "unavailable"},
    {"name": "attendance", "status": "ready"},
    {"name": "certificates", "status": "ready"},
    {"name": "reporting", "status": "ready"}
  ]
}
```

A interface deve ler também o corpo de respostas 503. Não são expostas URLs internas ou mensagens do driver PostgreSQL.

## Rotas internas por aplicação

GET /health → 200, `{"service":"events","status":"ok"}`.

GET /ready → 200, `{"service":"events","status":"ready","database":"ok"}`, ou 503 com status unavailable.

Os nomes variam conforme a aplicação. Todos respondem com X-Request-ID; chamadas de diagnóstico são rastreáveis nos logs. Rotas inexistentes retornam 404.

Oito serviços participam do diagnóstico. A prontidão não prova entrega de SMTP/RabbitMQ nem substitui os testes de autorização, concorrência, presença e emissão. Consulte [Identity](identity.md), [negócio](business.md), [presença](attendance.md), [certificados](certificates.md) e [relatórios](reporting.md).

