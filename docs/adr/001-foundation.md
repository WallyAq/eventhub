# ADR 001 — Base local com duas stacks e propriedade dos bancos

Status: aceito para a primeira etapa. Data: 2026-10-29.

## Contexto

O protótipo acadêmico precisa demonstrar interoperabilidade, execução reproduzível e evolução independente com infraestrutura acessível à equipe.

## Decisão

Usar Node.js/Express no Gateway, Identity e Payment; Python/FastAPI em Event, Registration e Notification. Cada aplicação tem dependências e Dockerfile próprios.

Executar cinco bancos lógicos em uma instância PostgreSQL, cada um com proprietário e senha específicos e sem CONNECT público. Aplicações usam DNS da rede Compose, sem portas próprias no host. Nginx concentra o acesso em loopback.

Disponibilizar /health para liveness e /ready para consulta real ao banco. Provisionar RabbitMQ agora e implementar publicação/consumo junto ao fluxo de negócio.

## Consequências

Reduz o custo operacional e atende ao requisito de duas tecnologias. O PostgreSQL é ponto compartilhado de falha e recurso; bancos lógicos não oferecem isolamento físico. Há duplicação pequena e intencional nas bases de aplicações para evitar acoplamento de um pacote compartilhado prematuro.

## Fora desta decisão

JWT, controle concorrente de vagas, coordenação de pagamentos e entrega confiável de eventos exigirão ADRs próprios. Nenhum mecanismo é considerado implementado apenas por constar na arquitetura.

