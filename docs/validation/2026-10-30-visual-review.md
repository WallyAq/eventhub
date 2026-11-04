# Revisão visual do EventHub

Referência: [Figma EventHub](https://www.figma.com/design/LqNNxjqwsMxwWCUvK6QHVK/EventHub--Copy-?node-id=0-1). A consulta nova ao MCP foi bloqueada pelo limite do plano Starter. A comparação usa as capturas e especificações completas obtidas anteriormente na conversa; não verifica mudanças posteriores no arquivo remoto.

## Correções

- Ordem de carregamento dos estilos: base, autenticação e páginas de negócio. Os estilos de negócio não ficam mais sujeitos à ordem de importação do componente de rotas.
- Busca com espaço reservado para a lupa; gestão usa o ícone original e apresenta Status antes de Modalidade, na ordem visual e de navegação do Figma.
- Campos do editor com espaçamento vertical; cartões da gestão usam descrição compacta e não repetem a faixa de preço do catálogo.
- Remoção do espaço excedente acima do destaque do catálogo.
- Inscrição apresentada como diálogo nativo com fundo escuro, fechamento por Escape, rótulo acessível e rolagem própria. Rotas continuam disponíveis para navegação e retomada.
- Títulos da inscrição e das atividades mantêm hierarquia no celular; botão de fechar fica afastado do texto.
- Menus acomodam nomes extensos; termos e confirmação de saída têm limite de altura e rolagem em telas pequenas.
- Campos de redefinição reservam espaço para o botão de exibição de senha.

Dados dinâmicos, quantidade de eventos e textos de estado podem diferir dos exemplos fixos do Figma. Certificados automáticos continuam indisponíveis. Não há alegação de validação MEC/CAPES. Recuperação e pagamentos são simulados conforme o contrato.

## Páginas e rotas

Base local: http://localhost:8080. Rotas com identificadores exigem valores reais das APIs.

| Página | Rota |
| --- | --- |
| Escolha de acesso | / ou /acesso |
| Login participante | /participante/login |
| Cadastro participante | /participante/cadastro |
| Login organização | /organizacao/login |
| Cadastro institucional | /organizacao/cadastro |
| Recuperação | /recuperar-senha |
| Redefinição | /redefinir-senha, token no fragmento do link |
| Catálogo | /eventos |
| Detalhes e atividades | /eventos/:id |
| Gestão de eventos | /organizacao/eventos |
| Criar evento | /organizacao/eventos/novo |
| Editar/gerenciar evento | /organizacao/eventos/:id |
| Perfil participante | /perfil |
| Perfil institucional | /organizacao/perfil ou /organizacao/perfil/:id |
| Organizações e equipe | /organizacoes |
| Inscrição, diálogo de reserva | /atividades/:eventId/:activityId/inscricao |
| Pagamento e confirmação, diálogo | /pagamento/:id |
| Minhas inscrições | /minhas-inscricoes |
| Diagnóstico | /diagnostico |

Menu da conta e confirmação de saída aparecem nas páginas autenticadas; não têm URL própria. Termos de Uso e Política de Privacidade são diálogos abertos pelos cadastros, também sem URL própria. Troca de senha é uma seção dos perfis. Cancelamento de evento tem confirmação inline, não um popup separado.

Redirecionamentos preservados: /login para /acesso e /cadastro para /participante/cadastro. Páginas autenticadas exigem login; vínculo na organização é conferido pelo serviço.

## Como conferir

Resultado desta revisão: build TypeScript/Vite aprovado e cinco testes de navegador aprovados. Capturas desktop e mobile foram inspecionadas, incluindo busca, editor, catálogo, modal de inscrição, recuperação, menu da conta, termos e confirmação de saída. O teste anterior que incluía imagens de diálogos fechados no cálculo de proporções foi corrigido para medir os ícones visíveis do modal.

```powershell
docker compose up --build -d --wait --wait-timeout 180
npm --prefix frontend run test:e2e
```

Playwright usa uma sessão isolada do Edge. Capturas em frontend/test-results (ignoradas pelo Git) incluem login, cadastros, perfis, menu, saída, termos, privacidade, recuperação, editor, gestão, catálogo, detalhes e etapas da inscrição. Os testes conferem larguras de cartões, ausência de transbordamento horizontal em 390px, geometria dos ícones visíveis e o fluxo de criação/publicação/reserva/pagamento. Contas e eventos de QA permanecem no banco local; os testes respeitam os limites de autenticação.
