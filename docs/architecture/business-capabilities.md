# Arquitetura e propriedade dos dados

O sistema conserva os limites já existentes. Identity e Payments/Payment Provider usam Node.js/Express; Events, Registrations, Attendance, Certificates, Notifications e Reporting usam Python/FastAPI. O gateway Node encaminha contratos HTTP; Nginx publica a aplicação React. Docker Compose define implantação independente por imagem. Os bancos PostgreSQL são separados por domínio e usuário, no mesmo servidor local; RabbitMQ atende integração assíncrona. Não é necessário introduzir nova tecnologia paga nem transformar cada RF em serviço.

| Serviço | Responsabilidade e banco próprio | Integração |
| --- | --- | --- |
| Identity | Usuários, perfil exclusivo, instituição, autenticação e vínculo; `identity_db` | Autentica usuários e fornece identidade atual aos demais serviços. |
| Events | Organização do evento, responsável, programação, publicação e outbox; `event_db` | Valida contexto de Identity; publica anúncios via contrato com Registrations. |
| Registrations | Inventário, reserva, espera, inscrição, transições, outbox e comprovantes de callback; `registration_db` | Consulta Events/Identity; recebe resultados válidos de Payments; publica eventos de domínio. |
| Payments | Transação simulada e reconciliação; `payment_db` | Consulta Identity/Registrations e Provider; confirma estado por contrato interno. |
| Payment Provider | Simulação idempotente de pagamento; `provider_db` | Atende Payments com credencial exclusiva do provedor. |
| Attendance | Presença única e vínculo ao registro; `attendance_db` | Verifica inscrição/identidade e evento administrável por APIs. |
| Certificates | Snapshot de emissão, hash, modelos e certificados de palestrantes; `certificate_db` | Valida inscrição/presença/atividade por APIs. |
| Notifications | Histórico de entrega, tentativas e falhas; `notification_db` | Consome RabbitMQ; resolve destinatário e estado nas APIs; mailbox local ou SMTP. |
| Reporting | Projeções derivadas, deduplicação; `reporting_db` | Consome mensagens e reconcilia por APIs; pagamentos têm disponibilidade parcial explícita. |

O fluxo pago integra Identity → Events → Registrations → Payments → Provider → Registrations. A inscrição e sua outbox compartilham transação local; o inventário serializa gravações por atividade. O provedor externo não participa de uma transação PostgreSQL da inscrição; reconciliação idempotente e estados terminais tratam falhas e respostas tardias. A persistência fornece a garantia de capacidade; consulta prévia de vagas serve à apresentação.

Notifications e Reporting não estão no caminho obrigatório de confirmação. Outbox e consumidores com deduplicação reduzem perda/repetição de efeitos e permitem recuperação. O custo é consistência eventual, manutenção das filas, necessidade de monitorar mensagens falhas e possibilidade de repetir SMTP em uma falha entre envio e commit. Certificates cresce e é implantado separadamente de inscrições. Consultas/inscrições podem ter réplicas independentes, mantendo PostgreSQL como autoridade de capacidade; este trabalho não afirma que o pico 20× foi medido sem ensaio de carga definido.

Consultas operacionais utilizam o contrato de evento administrável. O controle soma perfil, instituição e responsabilidade individual. Isso preserva instituições com vários organizadores sem dar acesso automático aos eventos dos colegas. Cada serviço continua proprietário de suas tabelas; auditorias de implantação leem bancos explicitamente para diagnóstico, sem introduzir acesso cruzado no tráfego da aplicação.
