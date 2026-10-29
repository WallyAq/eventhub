# Separação dos acessos de participante e organização

Data: 2026-10-29.

## Entrega

- / e /acesso apresentam a escolha de área.
- /participante/login e /participante/cadastro têm textos e navegação de participante, com destino /perfil.
- /organizacao/login e /organizacao/cadastro têm textos e navegação de organização, com destino /organizacoes.
- O cadastro de organização começa pela conta pessoal do responsável. A criação da organização continua após o login, na área de organizações. Uma conta pessoal existente pode ser reutilizada.
- Logout e expiração nas páginas protegidas retornam ao login da área correspondente.
- /login redireciona à escolha de acesso e /cadastro ao cadastro de participante, preservando links antigos.

As páginas estão em pages/participant e pages/organization. Formulários de conta foram movidos para components/auth, com configuração central em auth/access.ts. Layout e textos se adaptam à área. A autenticação continua no Identity; as permissões de organização permanecem baseadas no vínculo e verificadas na API. A seleção de uma área não concede privilégios.

## Verificações executadas

- Build TypeScript/Vite aprovado no host e no Docker.
- Cinco verificações de renderização estática aprovadas: seleção, login e cadastro de cada área, com títulos e links corretos e mínimo de oito caracteres nos formulários.
- Três testes de integração da plataforma aprovados após atualizar somente o container frontend.
- Frontend saudável no Docker. Nenhuma migração ou alteração de contas foi necessária.

A primeira verificação de renderização usou um literal com acentos transmitido pelo pipe do PowerShell e falhou por codificação do terminal. A verificação foi corrigida para usar prefixos ASCII e passou; não foi necessária alteração no texto UTF-8 da aplicação.

## Limites

Não houve inspeção visual ou automação de cliques em navegador. Renderização estática e entrega HTTP não comprovam interação visual completa. A sessão continua em memória e pode ser reutilizada entre as duas áreas pela mesma pessoa, respeitando os vínculos na API. Não foi criada senha compartilhada para organizações.
