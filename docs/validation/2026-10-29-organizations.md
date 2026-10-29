# Validação de organizações e senha mínima

Data: 2026-10-29.

## Escopo

Senha mínima reduzida de 12 para 8 caracteres no Identity, nos formulários de cadastro/login e na documentação. O máximo permanece 128; hashes e contas existentes foram preservados, sem necessidade de recriar o banco.

Organizações foram adicionadas ao Identity com a migração 002_organizations.sql, sem modificar a migração 001 já aplicada. Há criação transacional com responsável, consulta e edição de organizações e adição de contas existentes como organizadores. A interface está em /organizacoes, acessível pelo perfil.

## Resultados de integração executados

- Cinco testes integrados aprovados: fluxo de participante, senha de oito caracteres com rejeição de sete, organizações com responsável e organizador, isolamento entre contas e bancos e diagnóstico da plataforma.
- Teste de migração reaplicada aprovado, preservando quantidade de usuários e histórico existente.
- Dez testes unitários aprovados na execução final completa. Antes disso, foi corrigida uma asserção que esperava rejeição assíncrona para uma validação síncrona no teste de organizações.
- Builds TypeScript/Vite aprovados no host e no Docker.
- Dez containers saudáveis ao término da atualização.

O teste de organizações usa três contas sintéticas: responsável, organizador e usuário sem vínculo. Verifica rejeição de acesso por não membro (404), rejeição de gestão por organizador (403), adição duplicada (409), rejeição de papel fornecido pelo cliente (400) e existência de exatamente um responsável na equipe.

Durante a inicialização sob carga, Identity reiniciou antes de aplicar a migração e ficar saudável. O Compose aguardou prontidão e os testes foram executados após a recuperação. Não houve exclusão de volumes ou recriação de bancos.

## Limites

Não há convite por e-mail ou aprovação de vínculo: o responsável adiciona diretamente uma conta existente, com efeito imediato. Remoção de membros, transferência de responsabilidade, recuperação de senha e criação de eventos continuam pendentes. O papel de organização é consultado por operação e não altera o papel PARTICIPANT do JWT.

Não foi realizada inspeção visual em navegador nesta etapa. A validação das telas abrange compilação e entrega HTTP; os fluxos de negócio foram exercitados por API.

Os comandos para reprodução estão no README. Contas e organizações sintéticas de teste permanecem no banco para evidência.
