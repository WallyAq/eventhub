# Fluxo da organização — revisão de 09/11/2026

A referência recebida reúne páginas em uma única imagem reduzida. O fluxo foi comparado às rotas e componentes existentes; as regras de autorização, publicação, presença e certificados foram mantidas.

| Tela da referência | Implementação |
| --- | --- |
| Página inicial EventHub azul escura | Nova `/`, com apresentação, etapas, cadastro da organização, catálogo e escolha de acesso. A imagem de congresso já existente foi reutilizada; o ingresso central é identificado como ilustração. |
| Escolha de acesso | `/acesso`, existente, com o azul aplicado às ações. |
| Login/cadastro/recuperação da organização | Rotas existentes com tema azul, campos obrigatórios e recuperação abaixo da senha preservados. Login passa a abrir a gestão de eventos. |
| Gestão com eventos/sem eventos | `/organizacao/eventos`, existente; filtros, grupos, onboarding e estado vazio preservados. Acesso ao painel geral e por evento acrescentado. |
| Perfil de consulta/edição, senha e saída | Componentes existentes, mantidos no fluxo com tema azul, menu da conta e rodapé institucional. |
| Criar/editar evento | Editor existente com palestrantes, atividades, horários, modalidades, vagas e categorias/lotes. Tema aplicado aos componentes e janelas. |
| Atividade/palestrante | Janelas existentes mantidas, com validação e persistência reais. |
| Participantes, atividades/check-in, palestrantes e configurações | Gestão existente preservada, incluindo câmera/QR, certificados com fundo/assinaturas e cancelamento confirmado. |
| Painel geral | Nova `/organizacao/painel`, filtrada por organização e ano dos eventos sob responsabilidade do usuário. |
| Painel por evento | Nova `/organizacao/eventos/:id/painel`, com ocupação, inscrições, presenças, receita simulada, curva e exportação CSV autenticada. |

Os painéis consultam a API Reporting existente. O relatório foi ampliado com contagens por data de criação da inscrição, no fuso de Fortaleza, sem dados pessoais ou pontos inventados no gráfico. A curva tem tabela alternativa e títulos nos pontos. Valores monetários identificam explicitamente a simulação acadêmica.

Falhas de consulta não são tratadas como zero: o painel informa indisponibilidade e permite tentar novamente. Contas sem eventos têm ações para iniciar o cadastro. As rotas seguem a autenticação e o escopo da organização validados pelo servidor. Cartões não receberam animações de hover; ações continuam em botões/links.

Testes de interface: `frontend/tests/organization-redesign.spec.ts`, junto das regressões de gestão, campos obrigatórios e avisos de pagamento/evento. As capturas de desktop e celular são produzidas pelo Playwright em `frontend/test-results`, sem dados reais.

Validação concluída: 15 cenários distintos de interface aprovados nas seleções executadas. A regressão com APIs reais incluiu cadastro/login, perfil institucional e pessoal, edição do perfil, editor, palestrantes/atividades, foco das janelas, persistência da programação e acesso de membro sem permissão de edição. Os quatro testes novos foram repetidos na imagem final instalada, incluindo larguras de 390, 768, 1024 e 1440 px e exportação autenticada. As capturas da página inicial e dos painéis foram inspecionadas. Build TypeScript/Vite e imagens Docker aprovados; os contêineres foram atualizados preservando os volumes existentes.
