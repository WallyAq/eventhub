# Conferência visual do fluxo de organização — 10/11/2026

## Resultado e limite desta entrega

Cinco telas/estados receberam ajustes com base no contexto completo do Figma e foram executados e conferidos no navegador. A reprodução de **todo o fluxo ainda está pendente**. Não há certificação de identidade pixel a pixel, nem comparação detalhada concluída das telas restantes.

Referência oficial: [EventHub, fluxo de organizador](https://www.figma.com/design/qF1k8ezbXzSMk0lVvxSTEn/EventHub--Copy-?node-id=2052-2). A página inicial adotada é exclusivamente o primeiro quadro escuro, `2167:1335`. As versões azul e em inglês não foram implementadas.

O diagnóstico foi apresentado antes das alterações. A imagem geral enviada pelo usuário foi usada para conferir a sequência do fluxo; medidas, cores, fontes e recursos implementados vieram dos contextos completos dos cinco quadros.

## Diagnóstico e ajustes realizados

| Tela e quadro | Divergências identificadas | Ajustes |
| --- | --- | --- |
| Início — 2167:1335 | Ilustrações recriadas, tipografia, textos, dimensões, botões e rodapé diferentes | Fotografias e ícones originais; título com Inter e Newsreader itálica; composição do telefone em HTML; cores, posições, proporções, botões e marca branca conforme a referência |
| Escolha de acesso — 2114:8611 | Título, cartões, numeração, descrições e links diferentes | Cabeçalho, cartões de 502 px, números 01/02, textos, ícone da seta e links de acesso/cadastro |
| Login de organização — 2052:3 | Título e apoio diferentes, cartão/fundo/cor/posição da marca divergentes | Cartão de 440 × 511,5 px, centralização, fundo, azul #226192, textos, ícones originais e marca; recuperação abaixo da senha conforme o quadro |
| Gestão com eventos — 2052:1543 | Cabeçalho, filtros, dimensões e conteúdo visual dos cartões diferentes | Barra superior, navegação, título, filtros, ícones, grade, metadados, divisórias e ações de gerenciar/frequência |
| Gestão vazia — 2052:1764 | Ícone grande e orientações diferentes, blocos separados | Painel único, mensagem original, botão do primeiro evento, divisor e três etapas de orientação |

Reutilizados: Brand, AppLayout, AuthLayout, AccountLogin, PasswordInput, EventCard e EventFilters. As APIs e regras de inscrição/pagamento não foram alteradas.

O acesso a organizações/equipe continua no menu da conta. O painel individual continua disponível dentro de “Gerenciar Evento”; o painel geral está no cabeçalho. “Abrir Frequência” aponta para a aba de atividades/check-in já existente.

As classes de fidelidade ficam limitadas aos quadros conferidos. O login e o catálogo de participantes mantêm sua apresentação anterior. As validações obrigatórias do formulário de login continuam ativas.

## Inventário das demais telas encontradas

“Encontrada” indica rota ou componente identificado no código; não significa fidelidade visual aprovada.

| Tela/estado no Figma | Implementação encontrada | Situação |
| --- | --- | --- |
| Cadastro do responsável — 2052:85 | /organizacao/cadastro; AccountRegister | Comparação detalhada pendente |
| Recuperação de senha — 2052:368 | /recuperar-senha?area=organization; RecoveryPage | Comparação detalhada pendente |
| Perfil em leitura/edição — 2053:2098, 2052:1962 | /organizacao/perfil; organization/ProfilePage | Comparação dos dois estados pendente |
| Criar/editar evento — 2053:2323, 2165:1037 | /organizacao/eventos/novo e /organizacao/eventos/:id; EditorPage | Comparação detalhada pendente |
| Modal de atividade — 2053:2589 | ActivityDialog, PriceOptionsEditor | Comparação detalhada pendente |
| Modal e seleção de palestrantes — 2053:2773, 2053:2843 | SpeakerDialog, SpeakerPicker | Comparação detalhada pendente |
| Participantes/inscrições — 2113:7930 | OrganizerEventPage, aba inscricoes | Comparação detalhada pendente |
| Atividades/frequência — 2113:8233 | OrganizerEventPage, aba atividades | Comparação detalhada pendente |
| Leitura de QR pela câmera — 2113:8546 | QrCheckInDialog | Comparação e teste de câmera pendentes |
| Professores/palestrantes — 2113:7303 | OrganizerEventPage, aba palestrantes | Comparação detalhada pendente |
| Configurações/certificados/assinaturas — 2113:7573 | OrganizerEventPage, aba configuracoes; CertificateSettings | Comparação detalhada pendente |
| Cancelamento — 2115:8901 | Configurações do evento | Comparação do modal pendente |
| Dashboard geral — 2156:97 | /organizacao/painel; OrganizerDashboardPage | Comparação detalhada pendente |
| Dashboard individual — 2164:721 | /organizacao/eventos/:id/painel; EventDashboardPage | Comparação detalhada pendente |
| Menus de status, modalidade, titulação e política | Selects e configurações existentes | Estados abertos não validados contra o Figma |

## Validação executada

- `npm --prefix frontend run build`: TypeScript e build de produção aprovados.
- Aplicação executada com Vite em http://127.0.0.1:5174/.
- Capturas de cinco telas em 1440 px de largura e oito capturas adicionais em 390/768 px.
- Comparação visual das capturas com as imagens retornadas pelo Figma; medições DOM registradas em [verification.json](verification.json).
- Login de organização e participante, lembrar e-mail, mostrar senha e link de recuperação verificados com respostas controladas da API.
- Filtros de status/modalidade/busca, limpeza dos filtros, menu de equipe e destino de frequência verificados.
- Estado inicial sem eventos conferido separadamente da busca sem resultados.
- Nenhuma imagem quebrada, erro JavaScript ou resposta HTTP de erro nas verificações concluídas.
- Nenhuma rolagem horizontal nas telas verificadas em 390, 768 e 1440 px.

O navegador foi Edge em modo automatizado. As capturas autenticadas usam dados fictícios determinísticos; nenhum cadastro ou evento real foi alterado. O roteiro local está em `tmp/figma-audit/review.cjs`, ignorado no Git.

Na primeira conferência foram encontrados deslocamento vertical da área de gestão e ícone de busca fora do campo. Ambos foram corrigidos e as capturas refeitas. As medidas principais finais incluem login em x=500/y=218,75, cabeçalho de gestão com 64 px, título em y=96, filtros em y=196 e primeiro cartão em y=409.

## Capturas finais

- [Página inicial](home.png)
- [Escolha de acesso](access.png)
- [Login de organização](organization-login.png)
- [Gestão com eventos fictícios](organization-events.png)
- [Gestão sem eventos](organization-empty.png)
- [Início em celular](home-390.png), [escolha em celular](access-390.png), [login em celular](login-390.png), [gestão vazia em celular](empty-390.png)

## Arquivos alterados nesta etapa

- `.gitignore`: exclui arquivos temporários de inspeção.
- `frontend/src/pages/HomePage.tsx`, `frontend/src/pages/home.css`.
- `frontend/src/pages/AccessPage.tsx`, `frontend/src/access.css`.
- `frontend/src/pages/events/ManagePage.tsx`, `frontend/src/pages/events/CatalogPage.tsx`.
- `frontend/src/components/Brand.tsx`, `frontend/src/components/AppLayout.tsx`, `frontend/src/components/AuthLayout.tsx`.
- `frontend/src/components/auth/AccountLogin.tsx`, `frontend/src/components/form/PasswordInput.tsx`.
- `frontend/src/main.tsx`, novo `frontend/src/figma-fidelity.css`.
- Novos recursos em `frontend/public/figma/official/` e `frontend/public/fonts/`, incluindo licença da fonte.
- Este relatório, medições e capturas em `output/visual-audit/2026-11-10/`.

`frontend/src/pages/EnvironmentPage.tsx` já estava modificado pelo usuário antes desta etapa e não foi editado neste trabalho.

## Problemas e pendências para reprodução exata

1. **Limite da integração Figma:** depois de obter cinco contextos completos, a ferramenta passou a retornar bloqueio da cota Starter. Cadastro, recuperação, perfil, editor, modais, abas e dashboards precisam dos contextos detalhados originais para serem ajustados com precisão.
2. **Critério de implementação:** a skill [figma-design-to-code](C:/Users/walla/.codex/plugins/cache/openai-curated-remote/figma/18.0.0/skills/figma-design-to-code/SKILL.md) determina: “You MUST implement exclusively from the high-fidelity `get_design_context` responses”. Por isso, as telas sem contexto completo foram preservadas; a imagem geral não fornece medidas suficientes para substituí-lo.
3. **Dados e agrupamento reais:** nomes, datas, locais, quantidade de cartões e grupos seguem os dados do sistema. O agrupamento de rascunhos continua “Rascunhos”, enquanto o exemplo estático apresenta “Próximos”. Não foram alteradas regras nem inseridos dados fictícios na aplicação para imitar a captura.
4. **Responsividade:** não foram obtidos quadros oficiais de celular/tablet. As telas continuam utilizáveis nessas larguras, mas a correspondência a um design responsivo oficial não está certificada.
5. **Integração:** Docker/backend indisponíveis neste PC durante a conferência. Fluxos com servidor real, câmera e emissão real de certificados não foram exercitados.
6. **Igualdade absoluta:** a comparação realizada foi visual e geométrica, sem cálculo automatizado de diferença pixel a pixel contra exportações originais de mesma resolução. A rasterização de fontes pode variar entre o navegador Windows e o renderizador do Figma.

Para encerrar a fidelidade de todo o fluxo, faltam os contextos restantes do arquivo original, seus estados de interação e referências responsivas, seguidos de nova conferência visual e teste com o backend em execução.
