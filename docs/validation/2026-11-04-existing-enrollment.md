# Aviso antecipado de inscrição existente — 04/11/2026

## Comportamento

- Os detalhes do evento consultam as inscrições do participante e exibem o estado na própria atividade.
- A primeira etapa da inscrição mostra o aviso antes dos dados pessoais. A ação abre o comprovante, retoma o pagamento pendente ou consulta a lista de espera, sem criar outra inscrição.
- Somente uma inscrição confirmada informa uma vaga garantida. Reserva pendente e espera recebem mensagens próprias.
- Canceladas, expiradas e reservas com prazo encerrado não bloqueiam uma nova tentativa. O servidor continua responsável por verificar vagas, expiração, fila e duplicidade na transação.
- A consulta é isolada por sessão/evento, atualizada a cada 15 segundos enquanto a página está visível e ao retomar o foco. Uma consulta inicial pendente ou com falha bloqueia o avanço e oferece nova consulta.
- Antes de reservar, uma nova consulta identifica inscrições criadas em outra aba depois da seleção. A proteção transacional do backend continua cobrindo a corrida entre a consulta e a escrita.

## Validação

- `npm --prefix frontend run build`: aprovado (TypeScript e Vite).
- Build da imagem e atualização do frontend via Docker Compose: aprovados; contêiner saudável. Log: `tmp/early-enrollment-docker-build.log`.
- Playwright no preview local do build de produção (`http://127.0.0.1:4173`): **11 testes aprovados**, em 5,4 minutos. Inclui os nove cenários novos, o fluxo de quatro etapas e a duplicidade sem POST. Foram produzidas capturas em desktop e celular e verificada a ausência de rolagem horizontal.
- Comando: `npm --prefix frontend run test:e2e -- tests/existing-enrollment.spec.ts tests/participant.spec.ts -g 'existing|enrollment|four-step checkout|lost responses' --output=test-results/existing-enrollment` com `EVENTHUB_URL` apontando para o preview.
- Revisão das capturas de detalhes em desktop e celular: aviso e ação legíveis, sem sobreposição ou corte. As demais atividades continuam disponíveis para inscrição.
- Log do build local: `tmp/early-enrollment-build.log`. Log da interface: `tmp/early-enrollment-ui.log`. A verificação dos serviços reais é registrada no relatório de backend.

Os testes de interface usam respostas controladas para observar os estados e a ausência de POST duplicado. Os testes de integração exercitam serviços e persistência reais com dados sintéticos.
