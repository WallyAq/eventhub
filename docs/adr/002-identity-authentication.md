# ADR 002 — Identidade de participantes e autenticação do protótipo

Status: aceito para a segunda entrega. Data: 2026-10-29.

## Contexto

RF01 e RN07 exigem identidade e acesso restrito aos próprios dados. O Gateway deve validar tokens, e o Identity deve continuar verificando chamadas internas. A implementação deve funcionar com PostgreSQL existente e aplicações independentes.

## Alternativas

- Sessões centralizadas: facilitam revogação, mas introduzem consulta de sessão ou estado compartilhado nas chamadas entre serviços.
- JWT com segredo HMAC compartilhado: simples, porém qualquer serviço que recebe o segredo de validação também pode assinar tokens.
- JWT RS256: separa emissão e validação, com custo de configuração e distribuição de chaves.

## Decisão

Usar JWT RS256 de uma hora (atualizado por solicitação do usuário em 30/10/2026). Identity guarda a chave privada; Gateway recebe somente a pública. Ambos verificam assinatura, algoritmo, emissor, audiência, expiração, emissão, sujeito e papel. O endpoint /users/me usa exclusivamente o sujeito autenticado. Cadastro público cria somente PARTICIPANT.

Usar scrypt assíncrono do Node.js com N=32768, r=8, p=3, salt aleatório de 16 bytes, saída de 64 bytes e comparação timingSafeEqual. Limitar entradas e tentativas de autenticação. Não introduzir ORM para a primeira tabela; usar pg e SQL parametrizado.

O frontend guarda a sessão em memória e localStorage, com prazo absoluto limitado ao exp do JWT. Atualizar a página ou reabrir o navegador restaura a sessão sem renovar o prazo. Eventos storage sincronizam entrada/saída entre abas. Expiração, retomada da aba e logout eliminam o cache vencido. Logout não revoga JWT já emitido.

A persistência atende à continuidade de uma hora solicitada para o protótipo e mantém os contratos Bearer existentes. Código executado na mesma origem pode acessar localStorage; não são armazenadas senhas. Uma evolução com cookie HttpOnly exigirá adaptar autenticação no Gateway e proteção CSRF. Não foi introduzido refresh token ou sessão sem expiração.

## Migrações

Cada serviço será proprietário de suas migrações. Identity aplica arquivos SQL numerados em uma transação no início, registra checksum e usa lock consultivo transacional para serializar inicializações concorrentes. Arquivos já aplicados não podem ser editados. Novas mudanças entram em novas migrações. O script infra/db continua apenas criando bancos e credenciais em volumes novos.

## Evidências previstas

Testes de hash e salt, credenciais inválidas, e-mail duplicado, rejeição de elevação de papel, expiração, assinatura/audiência incorretas, proteção do Gateway e fluxo HTTP com PostgreSQL real. Resultados executados ficam em docs/validation.

## Consequências e limites

O Gateway não consegue emitir tokens. A distribuição e rotação das chaves precisa de procedimento operacional; troca de chave sem período de coexistência invalida sessões. Não há refresh token ou lista de revogação. O limitador é local à instância. Organizações e organizadores exigirão contrato próprio e autorização de domínio antes da implementação de eventos.

## Referências

- [Node.js crypto](https://nodejs.org/api/crypto.html)
- [jose](https://github.com/panva/jose)
- [Locks consultivos PostgreSQL](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS)

