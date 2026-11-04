# Complementação das telas de usuário — 04/11/2026

## Comparação com as novas referências

O usuário enviou referências distintas de autenticação, catálogo/detalhes, Minhas Inscrições/perfil e inscrição/pagamento. Esta entrega complementa a de 03/11, que ainda não tinha a imagem específica de inscrições e perfil.

| Área | Resultado da comparação e implementação |
| --- | --- |
| Autenticação | Login, cadastro, recuperação e redefinição já implementados; passaram a usar a logo transparente compartilhada. |
| Pós-login | Catálogo preservado. Detalhes receberam cabeçalho com inscrição, seções de descrição, modalidade/transmissão, atividades vinculadas e palestrantes com instituição e biografia reais. |
| Minhas Inscrições | Cards horizontais e abas com contagens reais. Ativas reúne confirmadas cujo período não terminou, pendentes e lista de espera. Cursos Concluídos reúne confirmadas após o término da atividade. Encerradas preserva acesso a canceladas e expiradas. |
| Perfil | Consulta dos dados da conta por padrão; Editar Perfil abre o formulário existente. Cancelar descarta o rascunho, salvar persiste pela API e retorna à consulta. A troca de senha começa recolhida. |
| Pagamento | As quatro etapas e seus estados já estavam implementados. Mantidos seleção real, reserva idempotente, pagamento simulado e confirmação pelo Registration. |
| Rodapé | Marca e texto “Plataforma Acadêmica de Eventos e Pesquisa” compartilhados pela área do participante. |

## Dados e limites do protótipo

O histórico usa `CONFIRMED` e `activity.endsAt`, inclusive quando o período termina com a tela aberta. Ele não atesta presença. Pendências e lista de espera não se tornam cursos concluídos por passagem de tempo. Certificados permanecem desabilitados, com explicação visível, pois Attendance e Certificate ainda não estão implementados.

O painel digital apresenta o identificador real, o participante e o link do ingresso/comprovante. Não gera QR Code de check-in sem validação de presença. O cancelamento continua exigindo confirmação e resposta do servidor, e o registro permanece acessível na aba Encerradas.

Transmissão, datas, duração, instrutores, preços e biografias vêm do Event. Não são exibidos e-mails de palestrantes. O e-mail de login do perfil continua somente leitura, conforme contrato Identity. Descontos acadêmicos, lotes e parcelamento não são inferidos das imagens nem alteram o preço efetivo da atividade; pagamento e entrega de recuperação continuam simulados.

## Logo transparente

Entrada: `frontend/public/figma/eventhub-logo.png`.

Saída usada por `Brand`: `frontend/public/figma/eventhub-logo-transparent.png` (2168 × 725, canal alpha). O arquivo original foi preservado. A transparência foi inspecionada: 1.337.446 pixels totalmente transparentes; conteúdo com alpha acima de 32 nos limites x=102…2083 e y=203…545. O CSS mantém a proporção e centraliza a imagem no espaço da marca.

Foi usado o editor integrado `image_gen`, modo `background-extraction`, com `transparent_background: true`. Prompt final:

> Remove ONLY the flat light-gray background from this existing EventHub logo and make the background genuinely transparent (alpha). Preserve the exact logo: purple connected-circle symbol on the left, dark navy 'Event', purple 'Hub', and the tiny gray tagline 'CONNECT. PARTICIPATE. EXPERIENCE.' beneath. Preserve original colors, shapes, spelling, type proportions and horizontal composition, no redesign, no extra elements, no new background or shadows. Deliver a tightly cropped horizontal transparent PNG with minimal transparent padding, suitable for a website header.

## Validação

Testes controlados em `frontend/tests/participant-views.spec.ts` cobrem consulta/edição/cancelamento de perfil, recolhimento de senha, falha e recuperação de consulta, detalhes com dados reais, transparência da marca, classificação do histórico e mudança por término sem reload. Os testes anteriores de filtros e cancelamento foram adaptados às novas abas; o cenário real de perfil agora verifica consulta, edição e persistência após reload.

| Verificação | Resultado |
| --- | --- |
| Compilação TypeScript e Vite no Docker | Passou; o guard de dados nulos dos detalhes foi corrigido na primeira compilação. |
| Suíte controlada de participante e novas vistas | 21 cenários cobertos. A primeira execução aprovou 20 e apontou um seletor antigo de título de atividade; o seletor foi adaptado ao novo card. |
| Repetição dos oito cenários afetados | 8/8 aprovados em 57,3 s, incluindo todas as novas vistas, checkout completo e filtros/cancelamento. Os outros 13 cenários já tinham passado. |
| Criação/publicação e inscrição/pagamento pelos serviços reais | Passou em 35,7 s. |
| Recuperação e redefinição | Passou em 2,8 s, mantendo resposta genérica e entrega simulada. |
| Cadastro, login e persistência de perfil após reload | Passou em 12 s. |
| Formulários móveis e proporções dos assets | Passou em 6,2 s. |

Os quatro testes com o ambiente real terminaram aprovados em 1,1 min. As capturas controladas verificam ausência de rolagem horizontal em 1440 × 1024 e 390 × 844. A revisão visual cobriu perfil em consulta/edição e senha, detalhes do evento, inscrições ativas e histórico. O auxiliar de captura agora aguarda a decodificação das imagens além das fontes para não registrar assets ainda carregando.

Comandos executados:

```powershell
docker compose up -d --build --no-deps --wait --wait-timeout 120 frontend
npm --prefix frontend run test:e2e -- tests/participant.spec.ts tests/participant-views.spec.ts --output=test-results/participant-nov4
npm --prefix frontend run test:e2e -- tests/participant-views.spec.ts tests/participant.spec.ts -g "profile|event details|all shared logos|registration tabs|at its end|four-step checkout|my registrations filters" --output=test-results/participant-nov4-final
npm --prefix frontend run test:e2e -- tests/business.spec.ts tests/figma.spec.ts -g "organizer creates|participant signup|password recovery|mobile forms" --output=test-results/participant-nov4-live
```

Logs em `tmp/participant-nov4-{build,ui,final,live}.log`. Capturas em `frontend/test-results/participant-nov4`, `participant-nov4-final` e `participant-nov4-live`.

A revisão de celular também identificou a necessidade de respiro abaixo de Local nos detalhes; a regra de padding foi corrigida antes da última reconstrução.

Após esse ajuste CSS, a reconstrução passou e o cenário de detalhes foi repetido com sucesso (11,8 s), com capturas desktop/celular em `frontend/test-results/participant-nov4-spacing` e log `tmp/participant-nov4-spacing.log`. A captura móvel final foi revisada. A consulta final a `/api/status` retornou `ready` para Identity, Event, Registration, Payment e Notification.
