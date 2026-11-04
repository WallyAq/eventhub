# Fluxo do participante — referência exportada

## Referência e escopo

As quatro imagens enviadas pelo usuário mostram autenticação (as duas primeiras são iguais), catálogo pós-login e inscrição/pagamento em quatro etapas. Como não havia uma imagem distinta de **Minhas inscrições**, o usuário autorizou aplicar a essa página o padrão visual das demais.

Os formulários de login, cadastro e recuperação já tinham a composição da referência e foram preservados. O login do participante agora abre o catálogo. O perfil continua acessível pelo menu da conta. A sessão mantém o prazo absoluto de uma hora e a senha mínima de oito caracteres.

O catálogo apresenta destaque sem fotografia, datas, carga horária e faixa de valores derivados dos eventos reais. A lista usa seis eventos por página, busca por nome/instituição e filtro de modalidade. **Remoto** representa o valor `Online` da API; os estados do domínio não foram renomeados. Números de páginas e totais são calculados sobre os resultados recebidos.

**Minhas inscrições** reúne os cinco estados do Registration, busca, filtro, paginação, prazo das reservas e acesso ao pagamento/comprovante. O cancelamento exige confirmação na interface e só altera a lista depois de uma resposta da API. O popup permanece aberto em caso de erro e bloqueia cliques duplicados durante a requisição.

## Inscrição e pagamento

1. **Atividade:** seleção entre as atividades reais do evento, com descrição, local, responsável, duração e valor. Abrir o formulário não cria uma reserva.
2. **Dados pessoais:** conferência do nome, e-mail e telefone da conta autenticada, com CPF mascarado. A edição usa o perfil existente. Confirmar esta etapa solicita a reserva com `Idempotency-Key`.
3. **Pagamento:** resumo pelo preço armazenado na inscrição e demonstração em formato PIX ou cartão. A decisão é enviada ao Payment existente como `APPROVED` ou `DECLINED`. Os painéis não coletam números de cartão, CVV ou dados bancários reais.
4. **Confirmação:** comprovante somente quando o Registration responde `CONFIRMED`. A aprovação do pagamento enquanto a inscrição ainda está pendente mostra a espera pela conciliação. Inscrições gratuitas, em espera, canceladas e expiradas apresentam os próprios estados.

O contador usa `expiresAt` retornado pelo servidor e só aparece para uma reserva pendente. Uma aprovação tardia não garante confirmação. Retentativas de reserva preservam a mesma chave enquanto o resultado é incerto; consultas recuperam o estado antes de oferecer uma repetição. O pagamento possui uma transação por inscrição e a interface consulta o estado ao recuperar uma resposta perdida.

A referência inclui descontos acadêmicos, parcelamento e QR Codes de cobrança/credenciamento. Esses contratos não existem no protótipo. Foram mantidos o preço real da atividade e o pagamento simulado, sem inventar descontos, lotes ou cobranças. O comprovante usa o identificador e o link reais da inscrição; não apresenta um QR de check-in sem integração com Attendance.

## Rotas e APIs

| Tela ou estado | Rota | API |
| --- | --- | --- |
| Login | `/participante/login` | `POST /api/auth/login` |
| Cadastro | `/participante/cadastro` | `POST /api/auth/register` |
| Recuperação/redefinição | `/recuperar-senha?area=participant`, `/redefinir-senha` | `POST /api/auth/password/forgot`, `POST /api/auth/password/reset` |
| Página inicial | `/eventos` | `GET /api/events` |
| Detalhes do evento | `/eventos/:id` | `GET /api/events/:id` |
| Seleção e conferência antes da reserva | `/eventos/:eventId/inscricao` | `GET /api/events/:eventId`, `POST /api/registrations` |
| Inscrição de uma atividade já escolhida | `/atividades/:eventId/:activityId/inscricao` | Mesmas APIs da seleção |
| Pagamento | `/pagamento/:id` | `GET /api/registrations/:id`, `GET /api/payments/:id`, `POST /api/payments/:id` |
| Comprovante/estado da inscrição | `/inscricoes/:id` | `GET /api/registrations/:id`, `GET /api/payments/:id` |
| Minhas inscrições | `/minhas-inscricoes` | `GET /api/registrations` |
| Cancelamento, em popup ou no checkout | Componente da inscrição | `POST /api/registrations/:id/cancel` |

As quatro etapas compartilham um modal; não são quatro serviços nem exigem quatro endpoints adicionais. As rotas anteriores continuam aceitas. Consultas de inscrições e pagamentos permanecem protegidas por identidade e propriedade dos dados no backend.

## Organização e validação

Os estilos de catálogo, navegação, inscrições e checkout foram isolados em arquivos próprios. Não foram adicionados frameworks, dependências, migrações ou novos serviços.

`frontend/tests/participant.spec.ts` usa respostas controladas para verificar estados e falhas da interface sem depender da latência do ambiente Docker. Isso não substitui a integração real dos serviços, coberta pelos testes em `tests/integration` e pelo cenário de navegador em `frontend/tests/business.spec.ts`.

Comandos de validação:

```powershell
docker compose up -d --build --no-deps --wait --wait-timeout 120 frontend
npm --prefix frontend run test:e2e -- tests/participant.spec.ts
npm --prefix frontend run test:e2e -- tests/business.spec.ts -g "organizer creates"
```

As capturas desktop e celular são gravadas em `frontend/test-results`.

## Resultados em 03/11/2026

| Verificação | Resultado |
| --- | --- |
| TypeScript e build Vite no Docker | Passou |
| Interface com respostas controladas | 15 testes passaram em 1 minuto |
| Criação/publicação, inscrição e aprovação de pagamento nos serviços reais | Passou em 11,9 s |
| Cadastro, login e edição persistida do perfil de participante | Passou em 5,5 s |
| Restauração da sessão e logout sincronizado entre abas | Passou em 5,6 s |
| Expiração de uma hora, com relógio controlado no navegador | Passou em 2,3 s |
| Capturas | 16 capturas da interface em desktop/celular revisadas, além das capturas da integração real |

Os 15 cenários da interface cobrem filtros/paginação, quatro etapas, CPF mascarado, aprovação do pagamento antes da confirmação da inscrição, atividade gratuita, espera, recusa, expiração, respostas perdidas sem POST duplicado, cancelamento explícito, promoção da fila e isolamento ao trocar de inscrição. Também verificam que uma consulta antiga não sobrescreve um cancelamento recente e que um pagamento conhecido não é descartado quando a atualização seguinte falha.

A suíte real foi executada com:

```powershell
npm --prefix frontend run test:e2e -- tests/business.spec.ts tests/figma.spec.ts tests/session.spec.ts -g "organizer creates|participant signup|participante:|one-hour expiry" --output=test-results/participant-live
```

Logs: `tmp/participant-ui-validation.log` e `tmp/participant-live-validation.log`. A execução real terminou com quatro testes aprovados. Nesta execução não reapareceram os timeouts de dependências registrados na entrega anterior do organizador; o resultado não elimina a necessidade de recursos suficientes no host.

Na revisão das capturas, foram ajustadas as regras CSS para manter os títulos dos cards e os campos de conferência de dados com os estilos específicos destas páginas, sem serem substituídos pelos estilos globais.

Após esses ajustes, o frontend foi reconstruído e os dois cenários de checkout completo e filtros/cancelamento foram repetidos com sucesso (17,1 s no total), com novas capturas em `frontend/test-results/participant-final` e log em `tmp/participant-final-visual.log`. A consulta final `/api/status` respondeu 200 com os cinco serviços prontos.
