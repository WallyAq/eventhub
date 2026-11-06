# Backend acadêmico e próximas entregas

Implementado: oito serviços e bancos próprios, Identity/organizações/perfis, revogação de sessões, alteração/verificação de e-mail e remoção de membros; Event/programação/publicação; Registration/reservas/fila/gestão de inscritos por organizador; Payment simulado; Notification/outbox/RabbitMQ/mailbox/SMTP configurável; Attendance/check-in; Certificate/PDF/QR/validação; Reporting/projeções/reconciliação/CSV. Os novos domínios integram dados por APIs e mensagens, sem SQL entre bancos.

Entrega incremental de 03/11/2026: modais de professor/palestrante e atividade integrados ao editor, metadados persistidos no Event e política opcional de lista de espera respeitada pelo Registration. O perfil institucional inclui consulta e edição, e a seleção do responsável oferece busca sobre os palestrantes do evento. O painel sem eventos orienta a criação da primeira programação. A imagem exportada pelo usuário complementa a referência visual obtida pelo Figma. Veja o [recorte, as rotas e os resultados de validação](validation/2026-11-03-organizer.md).

Complementação do participante: catálogo pós-login, Minhas inscrições e checkout em quatro etapas aplicados às imagens exportadas, utilizando preços, prazos e estados reais. Confira as [rotas, as adaptações ao protótipo e a validação](validation/2026-11-03-participant.md).

Entrega de 04/11/2026: novas referências de inscrições/perfil aplicadas com consulta e edição de conta, histórico por término da atividade, cards horizontais, detalhes completos do evento, rodapé participante e logo com transparência. Veja a [comparação e validação das telas de usuário](validation/2026-11-04-participant.md).

A [validação do backend acadêmico](validation/2026-11-04-backend-implemented.md) registra 112 testes unitários, 39 testes de interface controlada e 18 cenários de integração real aprovados. Cobre os oito serviços, autorização, presença, PDF, replay de mensagens e sessões.

Entrega de 06/11/2026: gestão de inscritos e presença integradas, leitura real de QR pela câmera/imagem, modelos de certificado e signatários, lotes/categorias de preço e emissão automática para palestrantes. Consulte a [validação e uso](validation/2026-11-06-organizer-features.md).

RF07/RF08 complementados: provedor externo simulado com idempotência e recuperação, notificações explícitas de pagamento, alterações públicas/cancelamento com outbox e avisos por usuário. SMTP configurável documentado e protocolo validado localmente; entrega externa ainda depende do servidor/credenciais escolhidos.

1. Integrar telas dedicadas de relatórios e a tela de confirmação de e-mail. O backend dessas operações está implementado e documentado. O botão de certificado do participante já utiliza a API.
2. Configurar e testar entrega SMTP com um servidor escolhido quando for necessário enviar e-mails externos. O padrão mailbox mantém a demonstração local; pagamento continua simulado por decisão do usuário.
3. Para implantação pública: preparar backup e restauração testada, CI, monitoramento e identidades internas específicas por serviço. A credencial interna atual é compartilhada somente na rede Docker.
4. Preparar demonstração e endereço externo após validação local. Nenhum túnel é iniciado automaticamente. Integração com cobrança real depende de um novo escopo.

Presença exige inscrição confirmada e vínculo com a organização; certificados exigem presença e atividade encerrada e são revalidados ao baixar/consultar. Os serviços que antes estavam apenas modelados agora têm implementação, contêiner, banco e testes. A conclusão do backend acadêmico não equivale a afirmar que todas as telas futuras ou a operação pública estão prontas.

