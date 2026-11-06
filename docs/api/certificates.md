# Certificate — certificados e modelos da organização

Serviço Python/FastAPI em `services/certificates`, banco próprio `certificate_db`. Acesso por `/api` no gateway. Não lê tabelas de Identity, Events, Registrations ou Attendance: todas as consultas entre domínios usam HTTP interno.

## Requisitos de emissão

`POST /certificates` recebe `{ "registrationId": "uuid" }`, com Bearer token. O solicitante precisa ser o participante da inscrição ou membro da organização responsável pelo evento; a autorização de gestão é verificada por `Events /events/:id?managed=true`.

A inscrição precisa estar `CONFIRMED`, o evento precisa estar `PUBLISHED`, a atividade precisa ter terminado e Attendance precisa conter um check-in da mesma inscrição, usuário, evento e atividade, dentro da janela aceita pelo serviço de presença (início da atividade até 24 horas após seu término). O término da atividade sem presença registrada não gera certificado. A carga horária corresponde à duração da atividade, calculada por suas datas; não é a carga de todo o evento.

Erros de elegibilidade retornam `409` com código de motivo. Dependências indisponíveis retornam `503`, sem emitir ou declarar validade. A existência de um certificado não substitui a verificação do estado atual.

## Endpoints

| Método | Caminho | Resultado |
| --- | --- | --- |
| POST | `/certificates` | `{certificate}`; idempotente por inscrição, `201`, mesmo ID em repetições elegíveis |
| GET | `/certificates` | Histórico de emissões do próprio usuário: `{certificates, validityRequiresVerification:true}` |
| GET | `/certificates/:id` | Dados e validade atual, somente titular ou organização responsável |
| GET | `/certificates/:id/download` | PDF real, privado, somente titular ou organização responsável e com validade atual |
| GET | `/certificates/verify/:code` | Verificação pública por código aleatório de 64 caracteres hexadecimais |
| GET, PUT | `/organizer/events/:id/certificate-settings` | Consulta/salva modelo do evento, mediante vínculo com a organização |
| GET | `/organizer/events/:id/certificate-preview?kind=PARTICIPANT` | Prévia PDF do modelo salvo, sem emissão; aceita também `kind=SPEAKER` |
| GET | `/organizer/events/:id/speaker-certificates` | Lista de certificados dos palestrantes do evento e validade atual |
| POST | `/organizer/events/:id/speaker-certificates` | Verificação imediata e idempotente das emissões automáticas; `{issued}` |
| GET | `/speaker-certificates/:id/download` | PDF do palestrante, somente organização responsável, com validade atual |
| GET | `/health`, `/ready` | Liveness e disponibilidade do banco/tabela próprios |

O registro contém UUID, inscrição única, snapshot do nome do participante e dos títulos/datas da atividade e evento, organização, carga horária, referência à presença, emissão UTC e SHA-256 canônico do snapshot. Não armazena CPF, telefone ou e-mail. Um bloqueio transacional por inscrição e a restrição única impedem certificados duplicados em chamadas concorrentes. Emissões repetidas preservam o snapshot e a data originais.

A verificação pública devolve `{valid,reason,certificate,checkedAt}`. Seus dados públicos se limitam a número, nome, títulos, organização, horas, emissão e hash; não divulga IDs de usuário, inscrição ou presença, CPF, telefone ou e-mail. Código desconhecido retorna `404`. Um evento cancelado, inscrição sem confirmação, presença ausente ou hash inconsistente produz `valid:false`; indisponibilidade de dependência produz erro, nunca `valid:true`.

O PDF inclui o número, período, carga horária, data de emissão, hash, link e QR Code real para a verificação. As datas aparecem no horário de Fortaleza (UTC-3) e a duração em horas, minutos e segundos, evitando frações de horas pouco legíveis. É um documento de participação verificável no sistema, **sem assinatura digital ICP-Brasil**. O SHA-256 protege a consistência do registro armazenado; não é uma assinatura digital do arquivo PDF. A versão atual é regenerada a partir do snapshot após a autorização e verificação das fontes, com `Cache-Control: private, no-store`.

Como os serviços têm transações independentes, uma alteração pode ocorrer entre a consulta remota e a resposta. A emissão reconsulta as condições após obter o bloqueio local; download e validação consultam novamente as fontes em cada acesso. Um PDF previamente baixado precisa ter sua validade atual consultada pelo QR Code.

## Configuração e execução

### Personalização e assinaturas

Em Gestão → Configurações, edite títulos e textos de participante/palestrante, cor, fundo e até dois signatários com nome, cargo e imagem de assinatura opcional. Campos da API: `title`, `speakerTitle`, `body`, `speakerBody`, `accentColor` (`#RRGGBB`), `background` e `signatories: [{name,role,image}]`. Textos aceitam `{{name}}`, `{{activity}}`, `{{event}}`, `{{hours}}` e `{{organization}}`; marcadores desconhecidos são rejeitados e conteúdo HTML é escapado.

As imagens usam data URLs PNG/JPEG, nunca URLs externas. O cliente reduz os arquivos e o servidor decodifica, limita dimensões/tamanho, remove metadados e normaliza para PNG. SVG e dados inválidos são rejeitados. O Gateway limita esse formulário a 2 MiB e o Nginx a 2 MiB. A prévia usa o modelo salvo e identifica explicitamente que não tem validade.

O modelo pertence à tabela `certificate_templates`, no banco Certificate. Pode ser alterado em rascunhos e eventos publicados, para próximas emissões; eventos cancelados não podem alterá-lo. Cada emissão copia o modelo, fundo e signatários para seu snapshot imutável, incluído no hash. Mudar o modelo não altera certificados anteriores. As assinaturas são imagens de apresentação, **não assinaturas criptográficas ICP-Brasil**.

### Emissão automática para palestrantes

No editor do rascunho, ative `autoSpeakerCertificates` e vincule um palestrante com ID a cada atividade. Essa configuração, programação e preços ficam fixos após publicação. O worker Certificate verifica os eventos habilitados a cada 30 segundos por uma API privada paginada de Events. Após o término de cada atividade publicada, emite para o palestrante vinculado, mesmo sem conta de participante. Não exige inscrição/presença do palestrante e não envia e-mail automaticamente.

Os documentos pertencem a `speaker_certificates`, com unicidade `(event_id, activity_id, speaker_id)`, bloqueio por evento e snapshot próprio. Reinícios, workers concorrentes e a ação “Verificar emissões agora” não duplicam emissões. Atividades futuras, eventos cancelados e vínculos ausentes não geram documento. Downloads e verificação pública revalidam integridade, estado e vínculo; cancelamento invalida o documento. A verificação pública usa a mesma rota dos participantes e omite contatos, imagens e IDs internos do palestrante.

Novos testes: `python -m unittest discover -s tests/unit -v` (dependências dos serviços e PyMuPDF para inspeção do PDF). Integração com Docker: `node --test tests/integration/organizer-features.test.mjs`. Esse teste usa somente contas/eventos sintéticos e desloca as datas exclusivamente do evento identificado pelo UUID e título de QA, sem alterar o relógio da máquina.

Variáveis: `PGHOST`, `PGPORT`, `PGDATABASE=certificate_db`, `PGUSER`, `PGPASSWORD`, `IDENTITY_URL`, `EVENTS_URL`, `REGISTRATIONS_URL`, `ATTENDANCE_URL`, `INTERNAL_API_KEY`, `PUBLIC_BASE_URL` (padrão `http://localhost:8080`). O link de validação é `${PUBLIC_BASE_URL}/api/certificates/verify/:code`; configure a base pública estável na implantação.

A migração possui advisory lock próprio. O Dockerfile instala ReportLab e fontes DejaVu para o PDF, roda como usuário sem privilégios e escuta em `8000`. A chave interna e códigos públicos de verificação não são registrados nos logs. `GET /internal/users/:id`, `GET /internal/registrations/:id` e `GET /internal/attendance/registrations/:id` devem permanecer inacessíveis pelo gateway.

Testes: `python -m unittest discover -s services/certificates/test -v`, com dependências instaladas. A suíte cobre elegibilidade, presença incompatível, cancelamento após emissão, integridade, autorização, rechecagem após bloqueio, repetição idempotente, falha de dependência, privacidade da validação e geração real de PDF.
