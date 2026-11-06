# Recursos do organizador — 06/11/2026

Complementação dos quatro pontos identificados na [auditoria das telas](2026-11-06-organizer-flow.md), com interface, autorização, persistência e processamento real no backend acadêmico. O pagamento continua simulado.

## Onde usar

| Recurso | Caminho e funcionamento |
| --- | --- |
| QR pela câmera | Gerenciar Evento → Atividades e check-in → Ler QR Code. Ative a câmera, autorize o navegador e apresente a credencial de uma inscrição confirmada. Confira o participante antes de confirmar presença. Há alternativas por imagem PNG/JPEG e credencial colada. |
| Credencial do participante | Minhas inscrições e comprovante de inscrição confirmada exibem QR real, assinado pelo Registration. Não se confunde com o QR de verificação do certificado ou com cobrança PIX. |
| Certificados personalizados | Gerenciar Evento → Configurações do evento → Certificados e emissão digital. Edite títulos, textos, cor, fundo e até dois signatários com imagem de assinatura. Salve e baixe a prévia de participante ou palestrante. |
| Lotes/categorias | Editor do rascunho → Adicionar/Editar atividade → Lotes e categorias de preço. Cada combinação tem nome, categoria, preço e início/fim das vendas. O checkout exige uma opção aberta. |
| Certificado automático do palestrante | No rascunho, vincule o palestrante a cada atividade e marque “Gerar automaticamente certificado de palestrante / ministrante de curso”. Publique. Após o término, o worker emite em sua próxima verificação, a cada 30 segundos. Os PDFs aparecem nas Configurações; “Verificar emissões agora” antecipa a verificação sem duplicar certificados. |

Os novos campos obrigatórios usam o mesmo asterisco vermelho e semântica `required` do restante dos formulários. Fundo, imagem da assinatura e a configuração de preços por lote são opcionais. Ao adicionar signatário ou preço, seus campos de identificação ficam obrigatórios.

## Regras e limites

- A câmera precisa de HTTPS ou localhost. Captura somente após o comando explícito e encerra os tracks ao detectar, desligar ou fechar, inclusive se uma permissão pendente chegar depois do fechamento.
- A organização precisa ter vínculo com o evento antes de consultar a credencial. HMAC adulterado, evento/atividade divergente, inscrição não confirmada e janela de presença inválida são rejeitados no servidor. Ler o código não registra presença automaticamente.
- O preço vem da opção cadastrada no Event e é validado pelo Registration sob o bloqueio das vagas. Valor e opção contratados ficam fixos no snapshot da reserva/fila. As vagas são compartilhadas pela atividade, sem cotas por categoria. A categoria é autodeclarada.
- Preços, programação e habilitação da emissão automática são definidos no rascunho e ficam fixos após publicação. Eventos antigos sem opções continuam aceitando o preço único. Não se infere vínculo de palestrante somente pelo texto do responsável.
- O modelo do certificado pode mudar em eventos publicados para **próximas emissões**. Cada emissão conserva seu modelo, imagens e dados originais no snapshot e no hash. Imagens são verificadas e normalizadas pelo servidor, sem URLs remotas e sem SVG. As prévias não emitem documentos.
- Assinaturas enviadas são visuais, sem assinatura criptográfica ICP-Brasil. Os certificados possuem hash e QR de verificação; a consulta sempre revalida as condições atuais. Cancelamento do evento invalida também certificados já emitidos.
- O certificado automático do palestrante exige atividade encerrada e vínculo explícito na programação publicada, sem inscrição de participante. Não cria conta nem envia e-mail ao palestrante. A organização baixa o PDF para entrega.
- Persistência nova: `certificate_templates` e `speaker_certificates` no banco Certificate; migrações automáticas e idempotentes na inicialização. Nenhum SQL entre bancos de domínios na aplicação.

## Validação

- Build TypeScript/Vite aprovado.
- 81 testes Python aprovados: Event (19), Registration (24), Attendance (9), Certificate (14) e contratos dos novos recursos (15).
- 10 testes do Gateway aprovados, incluindo autenticação das novas rotas, bytes de PDF e limites dos payloads.
- Nove testes Playwright aprovados: cinco novos cenários, mais gestão e obrigatoriedade existentes. Incluem QR real gerado/decodificado por imagem, câmera negada, permissão tardia após fechamento, lotes persistidos, reserva com identificador do preço, imagens/signatários, prévias e download de palestrante.
- Seis regressões adicionais do participante aprovadas: checkout em quatro etapas, inscrição duplicada, recuperação após perda da resposta da reserva, polling anterior ao cancelamento, troca para uma inscrição desconhecida e cliques concorrentes no certificado. Total desta rodada: 15 testes de interface aprovados.
- Capturas de celular inspecionadas: formulário de preços, conferência de credencial e configurações de certificado, sem overflow horizontal.
- PDF personalizado renderizado e inspecionado com fundo, cor e duas assinaturas. Teste com textos longos/markup confirma documento em uma página e escape do conteúdo.
- Os contêineres foram reconstruídos/iniciados; o Nginx foi validado e seu prazo de resposta alinhado ao limite de 15 segundos do Gateway, evitando cortar a geração inicial do PDF aos 10 segundos.
- Integração real aprovada com os serviços Docker: validação do preço e da idempotência, pagamento simulado, resolução/confirmação de presença, persistência do modelo, imutabilidade após edição, emissão pelo worker sem solicitação manual, download/verificação do palestrante, autorização e invalidação por cancelamento. O teste só inicia após a prontidão dos oito serviços.
- Verificação final: os 13 contêineres estão `healthy` e `/api/status` respondeu HTTP 200 com os oito serviços `ready`. As duas primeiras tentativas, afetadas por carregamento inicial/serviço em recriação e timeout transitório, não foram contadas como aprovadas; a execução completa após prontidão passou sem repetir requisições de negócio em falha.

A câmera física não foi exercitada nesta máquina: o navegador testa os estados de permissão e encerramento; a decodificação real foi exercitada com imagem de QR. As capturas e logs de QA ficam em `frontend/test-results` e `tmp`, sem credenciais de ambiente.

Contratos: [presença](../api/attendance.md), [certificados](../api/certificates.md) e [preços/reservas](../api/business.md). Instale as dependências dos novos testes Python com `python -m pip install -r tests/unit/requirements.txt`. O teste `tests/integration/organizer-features.test.mjs` cobre os serviços reais com contas/eventos sintéticos; somente datas do evento identificado por UUID e título de QA são alteradas para testar a conclusão sem mudar o relógio do computador.

## Atualização em outro computador

Depois de receber estas alterações pelo Git e com o Docker Desktop aberto:

```powershell
docker compose up -d --build
docker compose ps
```

Não é necessário apagar volumes ou recriar os bancos. Abra novamente a página para carregar a versão atual do frontend. O túnel continua sendo iniciado separadamente, conforme o [guia de implantação](../deployment/ngrok-windows.md).
