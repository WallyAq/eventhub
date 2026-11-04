# Link de recuperação e vagas disponíveis

## Alterações

O link “Esqueci minha senha” foi movido para abaixo do campo de senha, alinhado à direita, nos acessos de participante e organização. A rota de recuperação e o controle de mostrar/ocultar senha foram preservados.

Os detalhes do evento e a etapa de seleção da atividade no checkout mostram `Vagas disponíveis: N de TOTAL`, consultando uma única API por evento: `GET /api/events/:id/availability`.

A capacidade publicada continua sendo propriedade do Event. O Registration calcula a disponibilidade em seu próprio banco: desconta inscrições confirmadas, reservas de pagamento ainda válidas e vagas destinadas à lista de espera existente. Reservas vencidas, canceladas e expiradas não ocupam vagas. A consulta é somente leitura e não expira nem promove inscrições; as mutações continuam seguindo os bloqueios e a manutenção já existentes.

A API pública retorna apenas identificadores de atividades, capacidade, vagas restantes e horário da consulta. Rascunhos e eventos cancelados retornam 404; eventos cujo período de inscrição já terminou retornam zero vagas. Falhas de Event ou do banco retornam 503, sem tratar falha como capacidade livre.

O frontend consulta novamente a cada 30 segundos enquanto a tela está visível, ao retomar a janela e ao voltar à seleção do checkout. Requisições antigas são descartadas ao mudar de evento. Se a consulta falha, a contagem anterior deixa de ser exibida e aparece a opção “Atualizar vagas”. O número informado continua sujeito à verificação transacional ao confirmar a inscrição; zero vagas não impede o fluxo de lista de espera.

## Validação

Os três serviços afetados (`frontend`, `gateway` e `registrations`) foram reconstruídos com sucesso, incluindo TypeScript e Vite no frontend.

| Verificação | Resultado |
| --- | --- |
| Gateway, incluindo roteamento público específico e falha de dependência | 5 testes passaram. |
| Registration, regras de disponibilidade e lista de espera | 16 testes passaram, sendo 8 novos de disponibilidade. |
| Integração HTTP e bancos reais | Passou em 50,4 s: reserva, aprovação, cancelamento, expiração, fila e proteção de dados privados. |
| Navegador com respostas controladas | 7 testes passaram em 1,4 min: contagem em detalhes/checkout, zero vagas com espera, recuperação de 503/payload inválido, atualização por tempo/foco, isolamento de evento e regressão do checkout completo. |
| Autenticação e recuperação pelos serviços reais | 2 testes passaram em 29,1 s, incluindo navegação pelo link de recuperação, cadastro/login e perfil persistido. |

Comandos:

```powershell
docker compose up -d --build --no-deps --wait --wait-timeout 120 frontend gateway registrations
npm --prefix gateway test
$availabilityTestsPath = (Resolve-Path 'services/registrations/test').Path
docker compose run --rm --no-deps --volume "${availabilityTestsPath}:/app/test:ro" registrations python -m unittest discover -s test -v
node --test tests/integration/availability.test.mjs
npm --prefix frontend run test:e2e -- tests/availability.spec.ts tests/participant.spec.ts tests/participant-views.spec.ts -g "availability|remaining seats|four-step checkout|event details" --output=test-results/activity-seats
npm --prefix frontend run test:e2e -- tests/business.spec.ts tests/figma.spec.ts -g "password recovery|participant signup" --output=test-results/activity-seats-auth
```

Logs em `tmp/activity-seats-{build,registration-unit,integration,ui}.log`. Capturas desktop e celular em `frontend/test-results/activity-seats`, incluindo detalhes e seleção com vagas disponíveis 3 e 0 para capacidade total de 12. O teste de integração usa somente dados sintéticos e avança o prazo de reservas específicas pelo serviço proprietário, sem parar outros serviços.

Log adicional de autenticação em `tmp/activity-seats-auth.log`, com capturas em `frontend/test-results/activity-seats-auth`. As capturas de login, detalhes e seleção foram revisadas; o link ficou abaixo do campo e as contagens cabem no celular. A consulta final de `/api/status` retornou os cinco serviços prontos.
