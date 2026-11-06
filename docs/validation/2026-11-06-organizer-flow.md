# Fluxo do organizador e campos obrigatórios — 06/11/2026

Comparação da imagem panorâmica enviada com as rotas, componentes e contratos atuais. A imagem permite identificar as telas e seções; o texto pequeno não permite uma comparação visual de cada detalhe. Esta revisão verifica disponibilidade e navegação, sem afirmar reprodução integral do protótipo.

## Telas disponíveis

| Tela/seção da referência | Caminho e situação atual |
| --- | --- |
| Escolha de acesso | `/acesso`, com entrada para organização e participante |
| Login institucional | `/organizacao/login` |
| Cadastro institucional | `/organizacao/cadastro`, cria conta/instituição/responsável |
| Recuperação de senha | `/recuperar-senha?area=organization`; redefinição em `/redefinir-senha` |
| Gestão com eventos e estado vazio | `/organizacao/eventos`; grupos por estado, busca, filtros e orientação para primeiro evento |
| Perfil em consulta e edição | `/organizacao/perfil` ou `/organizacao/perfil/:id`; edição institucional restrita ao OWNER |
| Troca de senha | No perfil, botão Alterar Senha |
| Menu da conta e confirmação de saída | Cabeçalho do organizador, com perfil, troca de área e Sair |
| Criação e edição do evento | `/organizacao/eventos/novo` e `/organizacao/eventos/:id`; evento publicado fica bloqueado para edição |
| Modal de professor/palestrante | Adicionar Palestrante no editor; cadastro e edição |
| Modal de atividade e seleção de responsável | Adicionar Minicurso/Oficina no editor; pesquisa, seleção e cadastro de palestrante dentro da atividade |
| Participantes/inscrições | `/organizacao/eventos/:id/gestao?aba=inscricoes`; filtros, paginação, CSV e confirmação de cancelamento da inscrição |
| Atividades/check-in | Mesma gestão, `?aba=atividades`; Lista de presença → Registrar presença → modal de validação |
| Professores/palestrantes | Mesma gestão, `?aba=palestrantes`; busca e link para editar a programação |
| Configurações e cancelamento | Mesma gestão, `?aba=configuracoes`; informações de vagas, certificado padrão e modal com digitação do título para confirmar cancelamento |

O caminho principal é: acesso → login/cadastro → Gerenciar Eventos → Cadastrar Novo Evento ou Gerenciar Evento no card → abas. O perfil está no menu principal e no menu da conta. Os componentes existentes verificam sessão e os serviços verificam o vínculo organizacional.

## Diferenças identificadas na auditoria inicial

- O modal de presença faz consulta e confirmação manual de uma inscrição selecionada. Não há leitura de QR Code por câmera nem campo para importar uma imagem de QR, como sugere a referência.
- Configurações mostra o certificado padrão e suas regras. Não oferece editor de modelo, escolha de fundo, upload de assinatura, signatários ou assinatura digital. O PDF atual possui verificação por código/hash, sem assinatura ICP-Brasil.
- Não há editor de lotes/categorias de preço; o valor e a capacidade são definidos por atividade e ficam fixos após publicação.
- Não há configuração de emissão automática de certificado para palestrantes. A opção no editor está desabilitada com explicação. A emissão do participante usa inscrição confirmada, atividade encerrada e presença.

**Atualização posterior nesta data:** os quatro recursos acima foram implementados com frontend e backend: câmera/imagem de QR, modelos/assinaturas visuais, lotes/categorias e emissão automática para palestrantes. As observações anteriores registram o estado da auditoria inicial. Veja [funcionamento, limites e testes da implementação](2026-11-06-organizer-features.md). Assinaturas ICP-Brasil continuam fora do escopo.

## Obrigatoriedade aplicada

O componente compartilhado `RequiredMark` usa o vermelho já existente (`#ba1a1a`). O asterisco tem `aria-hidden`: a semântica permanece em `required`/`aria-required` nos controles e os nomes acessíveis dos campos são preservados.

| Formulário | Campos marcados |
| --- | --- |
| Login | E-mail e senha |
| Cadastro institucional | CNPJ, razão social, nome fantasia/sigla, natureza da entidade, telefone institucional, e-mail, senha/confirmar senha e declarações obrigatórias |
| Recuperação/redefinição | E-mail cadastrado ou nova senha/confirmar senha |
| Perfil institucional | Razão social e nome fantasia/sigla. CNPJ é obrigatório quando já cadastrado; organizações antigas sem CNPJ podem continuar sem ele |
| Troca de senha | Senha atual, nova senha e confirmação |
| Organizações/equipe | Nome para criação/edição e e-mail para adicionar membro |
| Evento | Organização responsável, nome, categoria, carga horária, descrição, modalidade, início, término e pelo menos uma atividade |
| Modalidade do evento | Presencial: local; Online: plataforma HTTPS; Híbrido: ambos. O asterisco acompanha a condição do controle |
| Atividade | Nome, tipo, descrição/requisitos, responsável, data, início/término, local/plataforma da atividade, vagas e escolha de gratuidade. Valor somente quando paga; data final separada somente quando exibida |
| Palestrante | Nome, titulação, instituição e e-mail de contato, conforme validação já existente no modal |
| Cancelamento do evento | Digitação do título para confirmar |

Campos opcionais mantidos sem asterisco: telefone/e-mail do perfil institucional (diferente do cadastro inicial), descrição da organização, biografia, horário padrão de sessões, destaque, lista de espera e filtros. CPF e telefone do cadastro participante continuam opcionais; componentes compartilhados de autenticação/senha recebem a mesma indicação consistente.

As regras foram conferidas em `services/events/app/domain.py`, `services/identity/src/organizations/service.js` e nos validadores dos formulários. Os contratos Event conservam compatibilidade com registros antigos: descrição da atividade e metadados adicionais de palestrante podem estar ausentes em payloads legados, embora os modais atuais já os exijam. Não foram criadas novas obrigações retroativas nos bancos.

## Validação

Build TypeScript/Vite aprovado. Quatro testes Playwright aprovados: navegação pelas abas, presença com falha/sucesso, exportação/cancelamento, campos de autenticação e obrigatoriedade condicional no editor/atividade. Os testes usam APIs controladas para verificar o frontend, sem representar uma nova validação completa do backend.

Capturas desktop e celular inspecionadas: asteriscos vermelhos visíveis, opcionais sem marca, sem largura excedente e com ações do modal acessíveis. O marcador é desenhado por pseudoelemento CSS para também preservar consultas pelo texto exato dos rótulos, além do nome acessível.

A tentativa de gerar a imagem Docker do frontend não iniciou: Docker Desktop estava desligado (`dockerDesktopLinuxEngine` indisponível). Não foi feita publicação ou atualização de contêiner nesta rodada. Após abrir o Docker Desktop, aplique com `docker compose up -d --build frontend`.
