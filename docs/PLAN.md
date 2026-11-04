# Próximas entregas

Implementado: Docker, Identity/organizações/perfis, recuperação com entrega simulada, Event/programação/publicação, Registration/reservas/fila, Payment simulado e Notification/outbox/RabbitMQ. As telas desenhadas no Figma têm rotas ou componentes correspondentes, respeitando regras de negócio.

Entrega incremental de 03/11/2026: modais de professor/palestrante e atividade integrados ao editor, metadados persistidos no Event e política opcional de lista de espera respeitada pelo Registration. O perfil institucional inclui consulta e edição, e a seleção do responsável oferece busca sobre os palestrantes do evento. O painel sem eventos orienta a criação da primeira programação. A imagem exportada pelo usuário complementa a referência visual obtida pelo Figma. Veja o [recorte, as rotas e os resultados de validação](validation/2026-11-03-organizer.md).

Complementação do participante: catálogo pós-login, Minhas inscrições e checkout em quatro etapas aplicados às imagens exportadas, utilizando preços, prazos e estados reais. Confira as [rotas, as adaptações ao protótipo e a validação](validation/2026-11-03-participant.md).

Entrega de 04/11/2026: novas referências de inscrições/perfil aplicadas com consulta e edição de conta, histórico por término da atividade, cards horizontais, detalhes completos do evento, rodapé participante e logo com transparência. Veja a [comparação e validação das telas de usuário](validation/2026-11-04-participant.md).

1. Consolidar evidências do fluxo completo, concorrência, autorização, expiração e indisponibilidade.
2. Evoluir gestão de inscrições por organizadores, com contratos e filtros por organização.
3. Implementar Attendance antes de Certificate: presença válida, check-in sem duplicidade e emissão somente após o evento.
4. Evoluir Reporting com projeções/eventos, sem acesso SQL a bancos de outros serviços.
5. Evoluir recuperação para SMTP, revogação de sessões, identidades internas por serviço e rastreabilidade completa.
6. Preparar demonstração e Cloudflare Tunnel com dados sintéticos após validação local. Nenhum túnel é iniciado automaticamente.

Validar cada entrega antes de avançar. Attendance, Certificate e Reporting permanecem modelados, sem implementação no protótipo inicial.

