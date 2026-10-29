# ADR 003 — Organizações e permissões por vínculo

Status: aceito. Data: 2026-10-29.

## Contexto

O EventHub atende múltiplas organizações. Um usuário pode ser participante e organizar eventos de equipes diferentes. Um papel global ORGANIZER não informa quais organizações ele pode administrar e seria insuficiente para RN07.

## Alternativas

- Papel global de organizador: simples, mas não delimita acesso por organização.
- Lista de organizações no JWT: evita consultas, mas deixa permissões desatualizadas até a renovação do token e aumenta o conteúdo do token.
- Vínculos no banco de Identity: permite decisões atuais por organização com consultas adicionais e exige contrato para outros serviços.

## Decisão

Manter organizações e vínculos em identity_db. Usuários mantêm PARTICIPANT global; organização usa OWNER e ORGANIZER. A criação insere organização e vínculo OWNER na mesma transação. Índice parcial assegura um único OWNER e chave primária composta impede vínculos duplicados.

JWT autentica o usuário; Identity consulta o vínculo em cada operação de organização. Consultas retornam apenas organizações das quais ele participa. Não membros recebem 404; membros sem permissão de gestão recebem 403. Além da verificação na aplicação, os comandos de escrita verificam o vínculo responsável no próprio SQL.

Neste recorte, qualquer participante autenticado pode criar uma organização e se tornar seu responsável. O responsável adiciona contas existentes como organizadores, com efeito imediato. Não há aprovação administrativa, convite por e-mail, remoção ou transferência de propriedade nesta etapa.

## Consequências

Um usuário pode ter papéis distintos em várias organizações sem alterar JWT ou exigir novo login. Outros serviços terão que consultar uma API de autorização ou manter projeção justificada; não podem ler identity_db diretamente. A disponibilidade de Identity será uma dependência a tratar no fluxo de eventos.

## Evidências

Testes cobrem senha de oito caracteres, criação, vínculo responsável, adição de organizador, rejeição de duplicata, isolamento de uma terceira conta e restrições de edição e gestão de membros. Resultados executados ficam em docs/validation.
