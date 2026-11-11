from pathlib import Path
import re, json, shutil, zipfile, math
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
import fitz

ROOT=Path(__file__).resolve().parents[3]
WORK=Path(__file__).resolve().parent
DEST=ROOT/"output/overleaf/EventHub_Relatorio_Atualizado"
FIG=DEST/"figuras"
FIG.mkdir(parents=True,exist_ok=True)
original=Path(r"C:/Users/walla/.codex/attachments/43029e48-8224-4f12-9170-f78c74c060e7/Pasted text.txt").read_text(encoding="utf-8")
preamble=original.split(r"\begin{document}")[0]
preamble=preamble.replace(r"\usepackage[hidelinks]{hyperref}",r"\usepackage{xurl}"+"\n"+r"\usepackage{needspace}"+"\n"+r"\usepackage[unicode,hidelinks]{hyperref}")
preamble=preamble.replace(r"\fancyhead[L]{\small\textbf{EVENTHUB} Relatório final | Projeto acadêmico UECE}",r"\fancyhead[L]{\small\textbf{EVENTHUB} | Relatório final}")
preamble=preamble.replace(r"\fancyhead[R]{\small\color{ehcinza}Arquitetura, implementação e evolução}",r"\fancyhead[R]{\small\color{ehcinza}UECE | Estado atual}")
preamble+=r"""
\setlength{\headheight}{14pt}
\setlength{\emergencystretch}{2em}
\setcounter{tocdepth}{1}
\clubpenalty=10000
\widowpenalty=10000
\displaywidowpenalty=10000
\setlength{\tabcolsep}{4pt}
\setlength{\LTpre}{0.4em}
\setlength{\LTpost}{0.5em}
\newcolumntype{P}[1]{>{\raggedright\arraybackslash}p{#1}}
\newcommand{\evidencia}[1]{\par\nopagebreak[4]{\footnotesize\color{ehcinza}\textbf{Evidência:} #1}\par}
\hypersetup{pdftitle={Relatório Final EventHub - Estado atual},pdfauthor={Projeto EventHub - UECE}}
"""
cover=original[original.index(r"\begin{document}"):original.index("% =================== 1 ===================")]
cover=cover.replace("Este documento apresenta o cenário de entrega final solicitado, considerando concluído o escopo definido: cinco microsserviços implementados e três serviços adicionais modelados. Descreve a solução final sem atribuir resultados de testes, métricas de desempenho ou publicação pública que não estejam comprovados.",
    "Este documento descreve oito serviços de domínio implementados e um provedor de pagamento simulado separado. A instituição é a conta organizadora de seus eventos, e os certificados são por atividade. Os testes integrados utilizam ambiente próprio de QA. Resultados anteriores são identificados como evidências históricas, sem atribuir nova execução ou publicação remota não comprovada.")
cover=cover.replace("2 de novembro de 2026","11 de novembro de 2026")
cover=cover.replace(r"\begin{titlepage}",r"\hypersetup{pageanchor=false}"+"\n"+r"\begin{titlepage}",1)
cover=cover.replace(r"\end{titlepage}",r"\end{titlepage}"+"\n"+r"\hypersetup{pageanchor=true}"+"\n"+r"\pagenumbering{arabic}",1)
cover=cover.replace(r"\tableofcontents",r"\begingroup\setlength{\parskip}{0pt}\tableofcontents\endgroup",1)

def code(s):return r"\texttt{"+s.replace("_",r"\_")+"}"
def path(s):return r"\path{"+s+"}"
def sub(t,s):return r"\subsection*{"+t+"}\n\n"+s+"\n\n"
def evidence(s):return r"\evidencia{"+s+"}\n"
def items(ls,ordered=False):
    e="enumerate" if ordered else "itemize"
    return "\\begin{"+e+"}\n"+"\n".join("\\item "+s for s in ls)+"\n\\end{"+e+"}\n"
def listing(s):return "\\begin{lstlisting}\n"+s.strip()+"\n\\end{lstlisting}\n"
def table(h,rows,widths=None):
    n=len(h);widths=widths or [1/n]*n;pad=8*(n-1)/n
    cols="@{}"+"".join(r"P{\dimexpr "+f"{f:.5f}"+r"\textwidth - "+f"{pad:.4f}"+r"pt\relax}" for f in widths)+"@{}"
    head=" & ".join(r"\textbf{"+x+"}" for x in h)+r" \\"
    return "\n".join([r"\par\noindent\begin{minipage}{\textwidth}\small",
        r"\begin{tabular}{"+cols+"}",r"\toprule",head,r"\midrule",
        *[" & ".join(row)+r" \\" for row in rows],
        r"\bottomrule",r"\end{tabular}",r"\end{minipage}\par",""])
body=[]
def section(t,s):body.append(r"\section{"+t+"}\n\n"+s.strip()+"\n\n")

section("Visão geral do projeto",r"""
O EventHub é uma plataforma web para organizar eventos acadêmicos e profissionais, integrando participantes e instituições. A instituição é a conta organizadora: cadastra seus dados, cria e gerencia seus eventos, programa atividades, acompanha inscrições, registra presença e consulta indicadores.

A conta participante consulta eventos, inscreve-se em atividades, acompanha reservas e pagamentos simulados e obtém certificados. A arquitetura separa responsabilidades, propriedade dos dados e regras de domínio, utilizando Node.js e Python.
"""+table(["Grupo","Componentes atuais"],[
["Oito serviços de domínio","Identity, Events, Registrations, Payments, Notifications, Attendance, Certificates e Reporting."],
["Provedor simulado","Payment Provider, separado de Payments e com banco próprio; sem cobrança real."],
["Entrada e infraestrutura","Frontend React, Gateway, Nginx, PostgreSQL e RabbitMQ."],
],[.3,.7])+r"""
Attendance, Certificates e Reporting possuem implementação, contêineres e endpoints operacionais; não são apenas modelados. A composição principal possui nove bancos lógicos e 14 contêineres.

O texto descreve o workspace inspecionado em 11/11/2026, cuja referência Git é \texttt{ab70979}, com alterações locais preexistentes. Esse identificador não representa, isoladamente, todas as revisões dos registros históricos.
"""+evidence(path("compose.yaml")+"; "+path("docs/architecture/business-capabilities.md")+"; "+path("infra/db/01-init.sh")+"."))

section("Problema que o projeto resolve",r"""
O gerenciamento de um evento reúne identificação, publicação de atividades, controle de vagas, pagamentos, comunicação e comprovação de participação. Concorrência e falhas distribuídas exigem regras explícitas: duas pessoas podem disputar a última vaga, um pagamento chegar após a expiração ou uma notificação falhar depois da confirmação.

O EventHub coordena esses domínios por APIs e eventos, mantendo transações locais e recuperação posterior, sem compartilhar tabelas entre serviços.
"""+items(["Localizar eventos e consultar atividades.","Inscrever-se com estados e disponibilidade definidos pelo servidor.","Permitir à instituição administrar seus próprios eventos.","Acompanhar reservas e pagamentos simulados.","Registrar presença, emitir certificados por atividade e consultar indicadores."])+r"""
A solução demonstra separação de responsabilidades e também seus custos: consistência eventual, autorização entre serviços e necessidade de observabilidade.
""")

section("Objetivos",r"""
O objetivo principal é disponibilizar um protótipo web integrado de eventos com microsserviços e pelo menos duas tecnologias de backend.
"""+items([
"Implementar autenticação e autorização com perfis exclusivos de participante e conta institucional.",
"Permitir criação, edição de rascunhos, publicação e cancelamento dos eventos da instituição.",
"Organizar atividades com palestrantes, datas, capacidade, preços e espera configurável.",
"Evitar ocupação excedente e inscrições duplicadas.",
"Diferenciar confirmação gratuita e reserva paga temporária.",
"Confirmar pagamento simulado apenas quando a reserva permitir.",
"Liberar vagas após cancelamento, recusa e expiração, promovendo a espera quando aplicável.",
"Processar notificações sem bloquear a confirmação.",
"Registrar check-in e emitir certificados após a atividade, com presença válida.",
"Disponibilizar indicadores e exportações com valores financeiros simulados.",
"Manter interface baseada no Figma e execução com Docker Compose.",
"Separar o ambiente da aplicação do ambiente de testes integrados.",
"Documentar contratos, estados, decisões e limites das evidências.",
],True)+r"""
A exposição pela internet pode ser configurada sobre o Nginx. Uma URL pública ou implantação remota não é inferida apenas da arquitetura.
""")

section("Público-alvo",table(["Público","Utilização"],[
["Participante","Consultar eventos, realizar inscrições, acompanhar reservas e pagamentos, manter perfil e acessar certificados próprios."],
["Instituição organizadora","Cadastrar a instituição e criar, publicar e gerenciar seus eventos, atividades, inscrições, presença, certificados e indicadores."],
],[.29,.71])+r"""
Cada conta possui um perfil exclusivo, \texttt{PARTICIPANT} ou \texttt{ORGANIZER}. A conta organizadora representa a instituição e mantém um único \texttt{organizationId}. A mesma conta não alterna entre participação e organização.

Internamente, usuário, instituição, vínculo e \texttt{ownerUserId} sustentam a autorização. Papéis administrativos do banco não impõem ao produto um fluxo de formação de equipes. Convites, admissão e delegação entre organizadores não fazem parte do escopo confirmado.

Selecionar outra área não converte o perfil. Após conferir a senha, Identity recusa a área incompatível com \texttt{403 account\_area\_mismatch}, sem emitir token. Participantes podem se inscrever em eventos de instituições diferentes; a restrição institucional pertence à administração.
"""+evidence(path("services/identity/src/users/service.js")+":80; "+path("services/events/app/domain.py")+":45."))

section("Requisitos funcionais",table(["ID","Descrição","Atendimento atual"],[
["RF01","Cadastro, autenticação e perfis exclusivos.","Identity, sessão, revogação e área de acesso."],
["RF02","Gerenciamento dos próprios eventos.","Events: rascunho, publicação, cancelamento e atualização pública."],
["RF03","Atividades e programação.","Palestrantes, capacidade, preços, lotes e espera."],
["RF04","Consulta e busca.","API e catálogo; busca/paginação do catálogo no cliente."],
["RF05","Inscrições em atividades.","Registrations, idempotência e titularidade."],
["RF06","Reservas, cancelamento e espera.","FIFO, espera configurável e expiração autônoma."],
["RF07","Pagamento simulado.","Payments e provedor separado; reconciliação."],
["RF08","Notificações.","Outbox, RabbitMQ, mailbox e suporte SMTP."],
["RF09","Check-in e presença.","Attendance, registro único e credencial QR."],
["RF10","Certificados por atividade.","Emissão, PDF, verificação e modelos."],
["RF11","Relatórios e indicadores.","Ocupação, presença, transações simuladas e CSV."],
],[.12,.38,.50])+r"""
Também há cadastro institucional transacional, recuperação/troca de senha, sessão de uma hora, confirmação de saída, revalidação da identidade e interface responsiva.

O atendimento identifica implementação substantiva. O alcance da comprovação é apresentado na Seção~\ref{sec:testes}. Pagamentos são simulados. SMTP está implementado, mas recebimento externo não é atribuído a uma nova execução nesta atualização.
""")

section("Requisitos não funcionais",table(["Requisito","Solução e alcance"],[
["Modularidade","Serviços separados, dependências e Dockerfiles próprios."],
["Interoperabilidade","REST/JSON entre Node.js/Express e Python/FastAPI."],
["Consistência de vagas","Transações, locks, restrições SQL e revisão do inventário."],
["Duplicidade","Chaves idempotentes, unicidade e recibos persistidos."],
["Resiliência","Outbox, reconciliação, retry confirmado e filas de falhas."],
["Observabilidade","Logs, request ID, correlation ID, saúde e rastreamento."],
["Segurança","Scrypt, JWT RS256, autorização atual e revogação."],
["Persistência","Nove bancos lógicos e volumes Docker."],
["Reprodutibilidade","Compose, scripts, migrações e QA separado."],
["Usabilidade","Interface responsiva, feedback, diálogos e prévia gerenciada."],
],[.29,.71])+r"""
A separação favorece evolução e escala seletivas, mas não comprova alta disponibilidade. O ensaio de pico de 20 vezes citado na documentação atual não foi medido com base e recursos definidos. Comunicação e Reporting possuem consistência eventual.
""")

section("Histórico de decisões e evolução",r"""
O projeto evoluiu do fluxo principal para presença, certificados, indicadores e controles operacionais. O quadro organiza decisões observadas, sem atribuir cronologia experimental não documentada.
"""+table(["Área","Decisão atual"],[
["Tecnologias","React/TypeScript, Node.js/Express e Python/FastAPI."],
["Infraestrutura","Nginx, PostgreSQL, RabbitMQ e Compose."],
["Identidade","Scrypt, JWT RS256, sessão de uma hora e revogação."],
["Produto institucional","A própria instituição organiza seus eventos; perfis exclusivos."],
["Eventos","Programação/preços fixos após publicar; informações públicas atualizáveis."],
["Inscrições","Capacidade no banco, espera opcional, FIFO e expiração independente."],
["Pagamento","Provedor simulado separado e decisão persistente recuperável."],
["Comunicação","Outbox, deduplicação, mailbox e SMTP configurável."],
["Presença e certificados","Check-in e emissão por atividade concluída."],
["Indicadores","Projeções e pagamentos por APIs; falha financeira explícita."],
["Validação/operação","QA separado, preflight, checksum, backup e promoção local."],
],[.28,.72])+r"""
As referências disponíveis estão em \path{docs/access-rules.md}, \path{docs/api/business-rules.md}, \path{docs/architecture/business-capabilities.md}, \path{docs/requirements-matrix.md} e nos documentos de implantação e validação.

A redação anterior citava cinco ADRs em \path{docs/adr/}; esses arquivos não foram encontrados no checkout inspecionado. O relatório não afirma sua existência. Formalizar decisões permanece uma melhoria documental.
""")

section("Tecnologias utilizadas",sub("Frontend",table(["Tecnologia","Finalidade"],[
["React 19 e TypeScript 5.9","Componentes e contratos tipados."],
["Vite 7 e React Router 7","Desenvolvimento, build e navegação."],
["Context API e CSS","Sessão e responsividade."],
["Inter / fontes locais","Tipografia e marca."],
["qrcode e @zxing/browser","Credenciais e leitura QR."],
["Playwright / Chromium","Testes de interface e navegação."],
],[.43,.57]))+sub("Backend",table(["Tecnologia","Aplicação"],[
["Node.js 24 / Express 5","Gateway, Identity, Payments e provedor."],
["Python 3.13 / FastAPI","Events, Registrations, Notifications, Attendance, Certificates e Reporting."],
["Pydantic e Uvicorn","Contratos e execução HTTP Python."],
[code("pg")+" e "+code("psycopg"),"SQL parametrizado; sem ORM identificado."],
[code("jose")+" / scrypt","JWT e hash de senha."],
[code("express-rate-limit"),"Limitação de tentativas."],
["Pika","RabbitMQ."],
["Nodemailer / smtplib","Suporte SMTP."],
["ReportLab / Pillow","PDF e imagens dos certificados."],
],[.43,.57]))+sub("Infraestrutura",table(["Tecnologia","Finalidade"],[
["Docker / Compose","Aplicação e QA com projetos separados."],
["Nginx","Proxy e distribuição do frontend."],
["PostgreSQL 17","Nove bancos lógicos na instância local."],
["RabbitMQ 4","Mensageria e filas duráveis."],
["Git","Versionamento."],
["Tunnel, se configurado","Possibilidade de exposição, sem publicação ativa comprovada."],
],[.43,.57]))+evidence(path("frontend/package.json")+"; manifests e Dockerfiles; "+path("compose.yaml")+"."))

section("Estrutura de diretórios",r"""
O resumo abaixo apresenta os diretórios e pontos de entrada atuais:
"""+listing(r"""
eventhub/
+-- frontend/
|   +-- public/figma/
|   +-- src/
|   |   +-- auth/
|   |   +-- components/{auth,events,form,profile}/
|   |   +-- pages/{events,organization,participant,registrations}/
|   |   +-- services/
|   |   +-- types/
|   |   +-- App.tsx
|   |   +-- main.tsx
|   +-- tests/access-flows.test.mjs
|   +-- Dockerfile
|   +-- vite.config.ts
|   +-- package.json
+-- gateway/src/{config,middleware,routes,security}/
+-- services/
|   +-- identity/src/
|   +-- events/app/
|   +-- registrations/app/
|   +-- payments/src/
|   +-- payment-provider/src/
|   +-- notifications/{app,test}/
|   +-- attendance/{app,test}/
|   +-- certificates/{app,test}/
|   +-- reporting/{app,test}/
+-- infra/{db,nginx}/
+-- scripts/
+-- tests/{unit,integration}/
+-- docs/{api,architecture,deployment,validation}/
+-- output/{pdf,visual-audit}/
+-- tmp/
+-- compose.yaml
+-- .env.example
+-- .gitattributes
+-- .gitignore
""")+r"""
Cada serviço tem manifesto e Dockerfile próprios. \path{tmp/} contém registros, ambientes e artefatos locais; não representa apenas código autoral nem garante entrega em clone limpo.

O roteiro de interface está em \path{frontend/tests/README.md}. Não se mantém a afirmação de existência de \path{playwright.config.ts}, \path{README.md}, \path{docs/PLAN.md} ou fontes antigas ausentes deste checkout. Isso não prova inexistência de materiais no ambiente separado de testes.
""")

section("Arquitetura do sistema",r"""
O caminho configurado é:
\begin{center}
Navegador $\rightarrow$ Nginx $\rightarrow$ Frontend / Gateway $\rightarrow$ Serviços.
\end{center}
O frontend consome APIs sob \texttt{/api}. O Gateway verifica autenticação e encaminha os contratos; cada domínio mantém suas permissões e regras.

\figuraeh{figura1-arquitetura.png}{\textwidth}{Arquitetura atual: oito domínios, provedor simulado e nove bancos}

Chamadas internas utilizam HTTP na rede Docker. Payments consulta o simulador e aplica resultados em Registrations. Attendance, Certificates e Reporting consultam APIs proprietárias. Não há SQL entre bancos de serviços.

Os nove bancos lógicos compartilham uma instância PostgreSQL com usuários próprios. Inscrição e outbox compartilham transação local; provedor e e-mail ficam fora dela. Notifications e Reporting não bloqueiam a confirmação e operam com consistência eventual.

Um túnel pode ser configurado antes do Nginx, mas não é apresentado como publicação ativa verificada.
"""+sub("Organização do frontend",r"""
\figuraeh{figura2-frontend.png}{0.9\textwidth}{Módulos atuais do frontend e clientes HTTP}
""")+evidence(path("gateway/src/routes/business.js")+"; "+path("docs/architecture/business-capabilities.md")+"."))

section("Descrição detalhada dos módulos",r"""
\subsection{Frontend}
A SPA organiza páginas, componentes, clientes HTTP e tipos. \texttt{App} define rotas; \texttt{AuthProvider} gerencia e revalida a sessão; \texttt{RequireAccount} protege a área; \texttt{AppLayout} apresenta navegação e saída.

Há acesso/cadastro, perfis, catálogo, detalhes, editor, checkout, inscrições, gestão institucional, presença, certificados, dashboards e diagnóstico. Os componentes de QR, programação e certificados chamam APIs reais.

\subsection{API Gateway}
Não possui banco. Encaminha identidade, eventos, disponibilidade, inscrições, pagamentos, presença, certificados, relatórios e downloads. Verifica JWT e identidade atual e propaga correlação. Callbacks e consultas internas não são expostos.

\subsection{Identity Service}
Mantém contas, credenciais, instituição, vínculo técnico, recuperação, JWT, revogação e confirmação de alterações de e-mail. Cadastro institucional cria conta e instituição atomicamente. Seleção de área e campos arbitrários não alteram perfil/instituição.

\subsection{Events Service}
Mantém eventos, atividades, palestrantes e preços no JSONB. Valida instituição e responsável. Rascunho aceita edição completa; publicação congela programação, capacidade e preço. Informações públicas podem mudar por contrato específico com avisos aos inscritos.

\subsection{Registrations Service}
Mantém inventário, inscrições, ações, decisões/recibos e outbox. Reserva, manutenção, cancelamento e pagamento coordenam estados em transação. \texttt{expiry\_worker} expira sem Events/RabbitMQ; outro worker promove espera, concilia cancelamento e publica.

\subsection{Payments Service e provedor simulado}
Payments persiste decisão, prazo, correlação e resultado efetivo. O provedor simulado é externo ao domínio Payments, mas pertence ao Docker do projeto e possui banco próprio. Falha temporária mantém reconciliação pendente; não ocorre cobrança real.

\subsection{Notifications Service}
Consome eventos de inscrição, pagamento e avisos. Valida envelope, resolve destinatário por APIs, registra tentativas, deduplica entregas concluídas e trata retry/DLQ. Mailbox é padrão; SMTP é opção implementada, sem atomicidade com o banco.

\subsection{Attendance Service}
Mantém presença única por inscrição. Valida autorização institucional, evento publicado, inscrição confirmada e janela da atividade. Resolve credencial QR; confirmar presença é uma operação separada.

\subsection{Certificates Service}
Valida atividade encerrada e presença correspondente antes de emitir. Persiste snapshot, hash e código público; gera PDF com QR e verifica validade atual. Possui modelos por evento e automação específica de certificados de palestrantes.

\subsection{Reporting Service}
Mantém projeções e IDs de mensagens processadas. Reconstrói por APIs e retorna inscrições, ocupação, presença, transações simuladas e CSV. Falha financeira é explícita, sem conversão em zero.
""")

section("Funcionamento das funcionalidades",sub("Cadastro e autenticação",r"""
Participante informa nome, e-mail e senha; CPF/telefone são opcionais. Instituição informa dados institucionais e obtém perfil \texttt{ORGANIZER} com instituição fixa. Login incompatível é recusado sem token ou conversão de perfil.

Uma resposta válida tem a estrutura:
"""+listing(r"""
{
  "accessToken": "TOKEN",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "user": {
    "role": "PARTICIPANT",
    "organizationId": null
  }
}
""")+r"""
Na conta institucional, o perfil é \texttt{ORGANIZER} e \texttt{organizationId} contém sua instituição.
""")+sub("Sessão, perfil e senha",r"""
A sessão tem prazo absoluto de uma hora, sem renovação por reload. O cache é revalidado no servidor antes da área protegida. Saída e expiração limpam a sessão; eventos de armazenamento sincronizam abas. Logout solicita revogação; falha dessa solicitação é informada na interface.

Há edição de nome/CPF/telefone e dados institucionais. Troca autenticada exige senha atual e encerra sessão local; a versão de credenciais invalida tokens antigos. O backend possui troca de e-mail com confirmação, mas a interface atual apresenta e-mail como somente leitura.
""")+sub("Recuperação",r"""
Token aleatório de uso único, hash no banco, prazo de 30 minutos e resposta genérica. Mensagens usam mailbox ou SMTP configurado com outbox durável; arquivos da caixa local não possuem consulta pública.
""")+sub("Eventos e inscrição",r"""
A instituição cria no contexto fixo, define programação/palestrantes, configura preços, capacidade e espera, salva e publica. Catálogo e detalhes exigem participante autenticado na interface, embora a API de leitura seja pública. A instituição utiliza prévia gerenciada.

Gratuita com vaga confirma; paga gera reserva. Lotação só entra em espera quando habilitada. Checkout envia chave idempotente, recupera estados incertos e identifica o pagamento como simulado.
""")+sub("Presença e certificados",r"""
A instituição registra check-in manual ou resolve QR e confirma presença. O participante solicita certificado da atividade encerrada com presença válida. Modelos e certificados de palestrantes são administrados pela instituição. Dashboards e exportações utilizam APIs autorizadas.
""")+sub("Páginas e rotas",table(["Página","Rota"],[
["Apresentação / acesso",path("/")+" e "+path("/acesso")],
["Participante",path("/participante/login")+" e "+path("/participante/cadastro")],
["Instituição",path("/organizacao/login")+" e "+path("/organizacao/cadastro")],
["Recuperar / redefinir",path("/recuperar-senha")+" e "+path("/redefinir-senha")],
["Catálogo / detalhes",path("/eventos")+" e "+path("/eventos/:id")],
["Gestão / criação",path("/organizacao/eventos")+" e "+path("/organizacao/eventos/novo")],
["Editor / prévia / operação",path("/organizacao/eventos/:id")+"; sufixos "+code("/visualizar")+" e "+code("/gestao")],
["Dashboard",path("/organizacao/painel")+" e "+path("/organizacao/eventos/:id/painel")],
["Perfis",path("/perfil")+"; "+path("/organizacao/perfil")+" e "+path("/organizacao/perfil/:id")],
["Dados institucionais",path("/organizacoes")],
["Checkout de evento",path("/eventos/:eventId/inscricao")],
["Reserva por atividade",path("/atividades/:eventId/:activityId/inscricao")],
["Pagamento / detalhe",path("/pagamento/:id")+" e "+path("/inscricoes/:id")],
["Inscrições / diagnóstico",path("/minhas-inscricoes")+" e "+path("/diagnostico")],
],[.35,.65]))+evidence(path("frontend/src/App.tsx")+"; "+path("frontend/src/pages/registrations/CheckoutPage.tsx")+"."))

section("Regras de negócio",table(["Regra","Aplicação"],[
["RN01","Ocupação limitada pela capacidade com proteção concorrente no banco."],
["RN02","Pagamento confirma apenas reserva válida; gratuita dispensa pagamento."],
["RN03","Recusa e expiração liberam reserva, sem reativação tardia."],
["RN04","Cancelamento atualiza ocupação e pode promover FIFO."],
["RN05","Falha de comunicação não desfaz confirmação."],
["RN06","Certificado depende de atividade encerrada, inscrição confirmada e presença correspondente."],
["RN07","Participante acessa seus dados; instituição administra seus eventos."],
],[.14,.86])+sub("Controle concorrente",r"""
A transação bloqueia inventário com \texttt{SELECT FOR UPDATE}. Índices impedem inscrição ativa duplicada e uso indevido de chave. Triggers e revisão persistente reforçam capacidade/transições nos níveis de isolamento suportados.

\texttt{CONFIRMED} e \texttt{PENDING\_PAYMENT} ocupam vaga persistida; \texttt{WAITLISTED}, \texttt{CANCELLED} e \texttt{EXPIRED} não. Reserva pendente continua na proteção do banco até persistir a expiração; mera leitura do relógio não contorna o controle.
""")+sub("Estados e políticas",r"""
\figuraeh{figura3-estados-inscricoes.png}{0.9\textwidth}{Estados de inscrição e políticas de espera e pagamento}

Espera é FIFO por \texttt{created\_at,id}. Promoção gratuita confirma; paga inicia novo prazo. Espera desabilitada recusa lotação. TTL padrão de 900 segundos é configurável; QA documentado utiliza 120.

Confirmada pode ser cancelada antes do início da atividade. Expiração tem thread própria, dependente apenas de PostgreSQL; lentidão de Events/RabbitMQ não ocupa esse ciclo.
""")+sub("Estados dos pagamentos",table(["Estado","Significado"],[
[code("PENDING"),"Aguardando aplicação/reconciliação."],
[code("APPROVED"),"Resultado efetivo confirmou inscrição."],
[code("DECLINED"),"Simulação recusada."],
[code("EXPIRED"),"Prazo ou estado terminal impede confirmar."],
],[.27,.73])+r"""
Decisão do provedor e estado efetivo são separados. Aprovação após cancelamento ou expiração não reabre inscrição.
""")+sub("Presença e certificado",r"""
Check-in exige evento publicado, inscrição confirmada, autorização e instante do início da atividade até 24 horas após o fim. QR assinado vincula inscrição, pessoa e atividade; resolver QR não grava presença.

Certificado exige término da atividade e presença íntegra. Não se atribuem percentual de frequência, controle de saída ou avaliação não implementados. A certificação por atividade é correta para o produto.
""")+sub("Cancelamento do evento",r"""
Events registra e comunica por outbox. Registrations concilia em operações e worker, cancelando inscrições ativas. Há consistência eventual, sem transação SQL distribuída.
"""))

section("Modelagem de dados",sub("Propriedade",table(["Banco","Proprietário"],[
[code("identity_db"),"Identity"],[code("event_db"),"Events"],[code("registration_db"),"Registrations"],
[code("payment_db"),"Payments"],[code("provider_db"),"Payment Provider"],[code("notification_db"),"Notifications"],
[code("attendance_db"),"Attendance"],[code("certificate_db"),"Certificates"],[code("reporting_db"),"Reporting"],
],[.44,.56])+r"""
Uma instância física hospeda os nove bancos. Referências entre serviços são lógicas e validadas por APIs/eventos; não há chaves estrangeiras distribuídas.
""")+sub("Identity",table(["Tabela","Dados principais"],[
[code("users"),"Nome, e-mail único, hash, perfil, CPF/telefone, preferências, versão de credenciais e datas."],
[code("organizations"),"CNPJ, razão social, nome, natureza e contatos."],
[code("organization_members"),"Vínculo técnico consistente com perfil; instituição única por usuário organizador."],
[code("password_resets"),"Hash do token, usuário e prazo de uso único."],
[code("revoked_sessions"),"Hash revogado, usuário e expiração."],
[code("mail_outbox"),"Mensagem, estado, tentativas e próxima tentativa."],
[code("email_changes"),"Novo endereço, hash, versão e prazo."],
[code("schema_migrations"),"Migração, checksum e aplicação."],
],[.35,.65]))+sub("Events",r"""
\texttt{events} mantém ID, instituição, \texttt{owner\_user\_id}, estado, \texttt{payload} JSONB e criação. Programação, palestrantes e preços são estruturados no payload, sem tabela independente de atividades.

\texttt{event\_schema\_migrations} controla migrações e \texttt{event\_notification\_outbox} persiste avisos.
""")+sub("Registrations",table(["Tabela","Responsabilidade"],[
[code("inventories"),"Atividade, evento, capacidade e revisão."],
[code("registrations"),"Usuário, chave, estado, valor, prazo e snapshot."],
[code("outbox"),"Envelope e publicação confirmada."],
[code("registration_actions"),"Ações administrativas."],
[code("payment_decisions"),"Primeira decisão por inscrição."],
[code("payment_notification_receipts"),"Recibo e deduplicação do resultado."],
[code("event_announcement_receipts"),"Deduplicação de avisos."],
[code("schema_migrations"),"Integridade e isolamento."],
],[.49,.51]))+sub("Payments e provedor",r"""
\texttt{payments} usa inscrição como chave e mantém usuário, valor, estado, decisão, modo do provedor, IDs, prazo e correlação. \texttt{payment\_schema\_migrations} controla o esquema.

\texttt{provider\_transactions} pertence ao simulador: referência única, valor, BRL, resultado solicitado, estado e prazo. Nenhuma tabela representa liquidação financeira real.
""")+sub("Demais domínios",table(["Serviço","Estruturas"],[
["Notifications",code("deliveries")+": mensagem única, envelope, estado, tentativas, erro e atualização."],
["Attendance",code("attendance")+": inscrição única, usuário, evento, atividade, responsável, instante e snapshot."],
["Certificates",code("certificates")+", "+code("certificate_templates")+" e "+code("speaker_certificates")+"."],
["Reporting",code("registration_projection")+", "+code("event_projection")+" e "+code("processed_messages")+"."],
],[.25,.75]))+sub("Relacionamentos locais",r"""
\figuraeh{figura4-relacionamentos-bancos.png}{0.85\textwidth}{Relações físicas selecionadas e limites dos nove bancos}

O diagrama resume relações locais; não substitui todas as colunas/constraints. Os vínculos entre domínios não são FKs distribuídas.
""")+sub("Tipos e contratos",r"""
Frontend: \texttt{User}, \texttt{Session}, \texttt{Organization}, \texttt{Activity}, \texttt{PriceOption}, \texttt{Speaker}, \texttt{EventData}, \texttt{Registration}, \texttt{Payment} e \texttt{PlatformStatus}, em \path{frontend/src/types/} e \path{frontend/src/services/}.
""")+evidence(path("services/identity/src/database/migrations/")+" e módulos/migrações dos demais domínios."))

section("Fluxos de execução",sub("Fluxo principal",items([
"Participante autentica na área correta e recebe JWT com prazo.",
"Consulta evento, atividade e opção de preço.",
"Frontend solicita inscrição com chave idempotente.",
"Registrations consulta Events e decide sob transação.",
"Gratuita confirma; paga reserva; lotação entra em espera apenas quando habilitada.",
"Pagamento passa por Payments e provedor simulado.",
"Resultado válido atualiza inscrição e outbox.",
"RabbitMQ entrega mensagens para comunicação e projeções.",
"A instituição registra presença na janela permitida; após o término da atividade, o participante pode solicitar o certificado elegível.",
],True))+sub("Sequência de inscrição paga",r"""
\figuraeh{figura5-sequencia-pagamento.png}{\textwidth}{Reserva, provedor simulado, reconciliação e comunicação}
"""+items([
"Reserva paga retorna "+code("PENDING_PAYMENT")+" e prazo.",
"Frontend envia "+code("POST /payments/:id")+" com resultado simulado.",
"Payments persiste transação pendente, decisão e correlação.",
"Chama "+code("POST /v1/payments")+" do simulador com credencial e referência idempotente.",
"Provedor retorna aprovação, recusa ou expiração.",
"Payments valida referência, valor, moeda e marcador de simulação.",
"Callback interno em Registrations valida estado/prazo e grava decisão, inscrição e outbox.",
"Payments persiste resultado efetivo; falha temporária mantém reconciliação.",
"Comunicação é posterior e não bloqueia confirmação.",
],True))+sub("Check-in e certificado",items([
"Instituição lê ou informa a credencial da atividade.",
"Attendance resolve QR e apresenta dados autorizados.",
"Confirmação separada registra presença única.",
"Participante solicita certificado da atividade concluída.",
"Certificates confere estado, presença e integridade e gera/retorna emissão idempotente.",
],True))+sub("Falhas",table(["Situação","Comportamento"],[
["Área incompatível","403 sem token; não converte perfil."],
["Evento fora do contexto","Operação negada pelo domínio."],
["Lotação","Espera se habilitada; caso contrário, recusa."],
["Recusa/vencimento","Reserva cancelada/expirada e vaga liberada."],
["Aprovação tardia","Não reabre estado terminal."],
["Provedor/callback indisponível","Reconciliação pendente."],
["Broker/consumidor indisponível","Outbox persistida; confirmação preservada."],
["Mensagem duplicada","ID e estado deduplicam o processamento concluído."],
["Fonte financeira indisponível","Relatório indica falha, sem falso zero."],
],[.39,.61])))

section("Integrações externas",sub("Exposição pela internet",r"""
Nginx é publicado em loopback na porta 8080. Cloudflare Tunnel ou equivalente pode encaminhar acesso externo para uma demonstração. Não foi comprovada URL ativa ou implantação remota no material examinado.
""")+sub("Figma",r"""
Referência visual de acesso, perfis, catálogo, gestão e inscrição. Assets de runtime são locais. Identificadores de nós não comprovam fidelidade visual integral sem baseline de comparação.
""")+sub("Pagamentos",r"""
Payment Provider é separado do domínio Payments, mas integra o Docker do projeto. Não é provedor financeiro contratado, não cobra e não expõe suas rotas pelo Gateway.
""")+sub("Notificações e recuperação",r"""
\texttt{MAIL\_MODE=mailbox} é padrão; \texttt{MAIL\_MODE=smtp} ativa suporte implementado em Identity/Notifications. Remetente, host, credenciais e URL dependem da configuração.

Código SMTP não comprova recebimento externo. Aceitação do e-mail seguida de falha antes de registrar envio pode permitir repetição; não se promete exatamente uma vez.
"""))

section("Configuração e execução",sub("Pré-requisitos",items([
"Docker Desktop em modo Linux e Docker Compose.",
"Node.js 24 para scripts/desenvolvimento.",
"Python compatível fora dos contêineres; imagens Python usam 3.13.",
"Chromium para os testes Playwright atuais.",
]))+sub("Preparação de ambiente novo",r"""
Os comandos descrevem a operação; não foram executados nesta edição:
"""+listing(r"""
if (-not (Test-Path -LiteralPath '.env')) {
  Copy-Item -LiteralPath '.env.example' -Destination '.env'
}
node scripts/init-backend-config.mjs
node scripts/init-identity-keys.mjs
node scripts/init-internal-key.mjs
""")+r"""
Configuração inclui nove bancos, RabbitMQ, JWT, chave interna e do simulador, e-mail, URL e TTL. Scripts preservam valores existentes. Segredos reais não devem ser versionados.
""")+sub("Inicialização e portas",listing(r"""
docker compose up --build -d --wait --wait-timeout 600
docker compose ps
# Aplicacao: http://127.0.0.1:8080
# Prontidao: http://127.0.0.1:8080/api/status
""")+table(["Componente","Porta interna"],[
["Nginx / frontend","80"],["Gateway, Identity, Payments e provedor","3000"],
["Serviços Python","8000"],["PostgreSQL","5432"],["RabbitMQ","5672"],
],[.76,.24])+r"""
Somente HTTP do Nginx é publicado no host, em \texttt{127.0.0.1:8080}. Prontidão não substitui validação de negócio.
""")+sub("QA separado",listing(r"""
node scripts/init-rules-qa.mjs
docker compose -p eventhub-rules-qa --env-file tmp/rules-qa/.env up -d --build --wait --wait-timeout 600
# QA: http://127.0.0.1:18080
""")+r"""
QA possui configuração, chaves, dados e volumes próprios. Ensaios de falha devem permanecer nesse destino.
""")+sub("Desenvolvimento e encerramento",listing(r"""
npm --prefix frontend ci
npm --prefix frontend run dev
npm --prefix frontend run build
docker compose logs --tail 100
docker compose down
""")+r"""
Vite encaminha \texttt{/api} à porta 8080. Encerramento normal preserva volumes; não remover volumes para contornar migração.
""")+sub("Migrações e backup",r"""
Identity, Events, Registrations e Payments possuem migrações com checksum e controle transacional. Preflights recusam legado ambíguo. Outros domínios inicializam suas tabelas.

Volume existente pode exigir novos bancos; alterar \texttt{.env} não muda automaticamente senhas persistidas. Runbook documenta diagnóstico, backup/restauração e promoção. Consistência entre serviços exige coordenar gravações, outboxes e filas.
""")+evidence(path("docs/deployment/business-rules-runbook.md")+"; "+path("scripts/init-backend-config.mjs")+"; "+path("scripts/init-rules-qa.mjs")+"."))

section("Testes e evidências de validação",r"""
\label{sec:testes}
Testes integrados são executados em QA separado. O projeto Compose \texttt{eventhub-rules-qa}, na porta 18080, tem configuração, credenciais, chaves, bancos e volumes próprios. A aplicação usa \texttt{eventhub}, na porta 8080.

QA documentado utiliza TTL de 120 segundos; produto possui padrão configurável de 900. Esta edição organiza registros existentes, sem executar nova regressão completa.
"""+sub("Níveis de validação",table(["Nível","Alcance"],[
["Unitário/domínio","Regras com dependências simuladas; não prova concorrência PostgreSQL real."],
["Interface interceptada","Telas e contratos com respostas HTTP simuladas."],
["Integração QA","HTTP, banco e serviços reais, fixtures e falhas controladas."],
["Navegação integrada","Chromium contra QA e capturas desktop/celular."],
["Operação local","Imagens, migrações e prontidão; não substitui regras de negócio."],
],[.33,.67]))+sub("Suítes e comandos atuais",listing(r"""
node --test tests/unit/identity-access.test.mjs
npm --prefix frontend run test:access
node --test tests/integration/capacity-isolation.mjs
node --test tests/integration/access-migrations.mjs
node --test tests/integration/business-rules.mjs
node --test tests/integration/payment-recovery.mjs
node tests/integration/frontend-live.mjs
node --test tests/integration/login-area.mjs
node tests/integration/trace-evidence.mjs
""")+r"""
Os integrados pressupõem preparação e seleção de QA. Python possui \path{tests/unit/test_event_access.py} e \texttt{test\_rules.py} em Attendance, Certificates, Reporting e Notifications.

A suíte de interface tem 14 casos com APIs interceptadas; não cobre automaticamente toda a lista antiga de navegador. Ausência local de material não prova inexistência no ambiente separado.
""")+sub("Resultados históricos de 10/11/2026",table(["Verificação","Aprovados","Observação"],[
["Identity","6","Revisão anterior ao ajuste de login."],
["Acesso Events","6","Responsabilidade e autorização isoladas."],
["Domínios adicionais","27","Attendance 5; Certificates 10; Reporting 10; Notifications 2."],
["Interface interceptada","14","Acesso, checkout e dashboard."],
["Isolamento de capacidade","5","Documentado; quatro cenários e agrupador."],
["Migrações de acesso","4","Log presente; três cenários e agrupador."],
["Negócio HTTP","8","Log presente; sete cenários e agrupador."],
["Recuperação de pagamento","3","Log presente; dois cenários e agrupador."],
],[.39,.16,.45])+r"""
O total histórico de 73 inclui agrupadores; não são 73 cenários independentes nem nova regressão da revisão atual. Logs: \path{tmp/rules-qa/integration-results.log}, \path{tmp/rules-qa/access-migrations-results.log} e \path{tmp/rules-qa/payment-recovery-results.log}.

Navegação QA real registrou sete verificações, 16 capturas em 1440/390 pixels e \texttt{errors=[]}, referentes à revisão observada.
""")+sub("Validações posteriores e limites",r"""
O ajuste de login em 11/11 registra oito testes Identity, 14 de interface e quatro integrados QA aprovados. \path{output/visual-audit/2026-11-11/login-area/verification.json} informa origem 18080 e quatro capturas. Os demais integrados não foram repetidos para esse ajuste; não somar indiscriminadamente aos 73.

Na verificação técnica isolada de 11/11/2026, passaram 41 testes: Identity 8, Events 6, Attendance 5, Certificates 10, Reporting 10 e Notifications 2. TypeScript terminou com saída zero, sem emissão. Esses resultados são distintos do QA integrado e não foram repetidos nesta edição documental.

Expiração usa fixture que torna prazo vencido; não mede todo o TTL natural. Outbox durante falha não prova SMTP recebido ou drenagem integral. Restauração de nove bancos em clones demonstra recuperação técnica, sem provar consistência distribuída completa.
""")+evidence(path("docs/validation/implementation-summary.md")+":60--110; "+path("docs/validation/domain-rules-results.md")+"; "+path("docs/deployment/business-rules-runbook.md")+"."))

section("Estado atual do desenvolvimento",table(["Componente","Estado atual"],[
["Frontend","Acesso por perfil, catálogo, checkout, inscrições, gestão institucional e dashboards."],
["Identity","Cadastro, perfil, instituição fixa, recuperação, sessão e revogação."],
["Events","Eventos, programação, palestrantes, preços e informações públicas."],
["Registrations","Capacidade, idempotência, reserva, espera, expiração e outbox."],
["Payments/Provider","Simulação persistente e reconciliação, sem cobrança real."],
["Notifications","Consumo, deduplicação, retry, mailbox e SMTP configurável."],
["Attendance","Check-in autorizado, manual ou QR, e presença única."],
["Certificates","Atividade, emissão, PDF, verificação, modelos e palestrantes."],
["Reporting","Projeções, ocupação, presença, transações simuladas e CSV."],
["Infraestrutura/QA","14 contêineres, nove bancos e testes em ambiente separado."],
],[.30,.70])+r"""
Perfis exclusivos, instituição fixa e certificado após atividade são regras corretas. Equipes não são exigidas pelo produto.

A consulta local da elaboração do relatório de estado atual registrou 14 contêineres saudáveis e HTTP 200/ready em \texttt{/api/status}. Promoção de imagens e checksums pertencem a registros históricos, não a monitoramento contínuo.

O resultado é um protótipo acadêmico integrado, sem cobrança real, implantação remota comprovada ou alta disponibilidade demonstrada.
""")

section("Limitações e melhorias futuras",r"""
Attendance, Certificates e Reporting já estão implementados. As limitações concentram-se em maturidade operacional e evidências específicas.
"""+table(["Limitação","Evolução"],[
["Pagamento simulado","Integração financeira real com cobrança e reembolso definidos."],
["SMTP externo não demonstrado","Comprovar envio e recebimento controlados."],
["Sessão em localStorage","Avaliar cookie HttpOnly e proteções correspondentes."],
["Uma instância PostgreSQL","Separar recursos conforme disponibilidade/carga medidas."],
["Programação fixa após publicar","Contrato coordenado se surgir requisito de alteração."],
["Workers e consistência eventual","Métricas, alertas e recuperação de backlog/filas."],
["Implantação remota não comprovada","Definir destino e validação posterior."],
["Carga 20 vezes não medida","Definir base, recursos, duração e critérios."],
["Algumas listagens no cliente","Paginação/filtros no servidor conforme volume."],
],[.45,.55])+items([
"Automatizar CI e regressão associadas a uma revisão identificável.",
"Consolidar evidências de QA com ambiente, data e alcance.",
"Ampliar backup para linhas, invariantes, papéis e coordenação das filas.",
"Validar recuperação completa de mensagens, além da persistência durante falha.",
"Documentar rotação de segredos e monitorar dependências.",
"Alinhar terminologia antiga de equipes e certificados.",
"Apresentar números de avaliações da interface apenas com fonte ou identificação demonstrativa.",
])+r"""
Revogação, SMTP, rastreabilidade e backup têm implementação. Não se atribuem percentual de frequência, controle de saída, assinatura ICP-Brasil ou cobrança real sem requisito e implementação.
""")

section("Comparação entre planejamento e estado atual",table(["Planejamento anterior","Estado atual","Interpretação"],[
["Plataforma de eventos","Catálogo, programação e gestão institucional.","Objetivo preservado."],
["Cinco serviços operacionais","Oito domínios e provedor simulado.","Escopo ampliado."],
["Duas stacks","Node/Express e Python/FastAPI.","Decisão preservada."],
["Cinco bancos","Nove bancos lógicos.","Novos domínios persistem dados."],
["Conta e vínculos de organização","Perfis exclusivos e conta institucional.","Mudança intencional."],
["Gestão de equipe","Instituição gerencia seus eventos.","Equipe fora do escopo."],
["Certificado após evento","Após atividade e presença válida.","Regra atual correta."],
["Espera na lotação","Espera configurável.","Política ampliada."],
["Três serviços modelados","Presença, certificados e relatórios operacionais.","Evolução incorporada."],
["Comunicação apenas simulada","Mailbox e suporte SMTP.","Entrega externa exige validação."],
["JWT sem revogação central","Revogação e versão de credenciais.","Segurança evoluída."],
["Backup/rastreio futuros","Ferramentas e registros locais.","Avanço operacional."],
["Estratégia de validação","QA separado, testes em camadas.","Ambiente/revisão acompanham resultado."],
["Tunnel previsto","Possibilidade, sem URL comprovada.","Não afirmar publicação ativa."],
],[.32,.39,.29])+r"""
Mudanças intencionais foram incorporadas sem recomendar reversão de regras corretas. Resultados históricos mantêm o alcance de suas revisões, sem equivaler a uma execução nova.
""")

section("Encerramento e próximos passos recomendados",r"""
O EventHub implementa identidade, eventos, inscrições, pagamento simulado, notificações, presença, certificados e indicadores. Preserva propriedade de dados e tratamento explícito de capacidade e falhas distribuídas.

A instituição é a conta organizadora de seus eventos; participação usa perfil próprio. Certificados seguem a conclusão de cada atividade com presença válida. Os testes integrados pertencem ao QA separado.
"""+items([
"Consolidar revisão de entrega, relatório, contratos, diagramas e instruções.",
"Preservar evidências com data, revisão, ambiente e limites.",
"Repetir regressão pertinente quando novas alterações justificarem.",
"Comprovar SMTP, recuperação integral de filas e backup coordenado quando necessários.",
"Definir parâmetros de carga antes de atribuir desempenho.",
"Validar publicação remota apenas no destino configurado.",
"Ampliar automação, monitoramento e segurança conforme uso real.",
],True)+r"""
A entrega supera o recorte de cinco serviços e três apenas modelados. Deve mostrar separadamente implementação, validação em QA e limites operacionais, sem inventar resultados.
""")

appendix=r"""
\clearpage
\section*{Referências técnicas da atualização}
\addcontentsline{toc}{section}{Referências técnicas da atualização}
Caminhos relativos ao repositório inspecionado. Código, teste isolado, evidência histórica e consulta de prontidão têm alcances diferentes. As decisões confirmadas pelo responsável em 11/11/2026 prevalecem sobre redações antigas.
"""
body[-2]="\\begingroup\\setlength{\\parskip}{0.3em}\n"+body[-2]
body[-1]+="\n\\endgroup\n"
sources=[
["Arquitetura",path("compose.yaml")+"; "+path("docs/architecture/business-capabilities.md")+"; "+path("infra/db/01-init.sh")+"."],
["Acesso",path("services/identity/src/users/service.js")+"; "+path("services/identity/src/security/")+"; "+path("services/events/app/domain.py")+"."],
["Regras de inscrição",path("services/registrations/app/domain.py")+" e "+path("services/registrations/app/migrations/")+"."],
["Pagamento",path("services/payments/src/payments.js")+"; "+path("services/payment-provider/src/app.js")+"."],
["Presença/certificados",path("services/attendance/app/domain.py")+"; "+path("services/certificates/app/")+"."],
["Comunicação/relatórios",path("services/notifications/app/")+"; "+path("services/reporting/app/domain.py")+"."],
["Interface",path("frontend/src/App.tsx")+"; páginas, componentes e serviços em "+path("frontend/src/")+"."],
["QA e operação",path("docs/deployment/business-rules-runbook.md")+"; "+path("docs/validation/implementation-summary.md")+"; "+path("docs/validation/domain-rules-results.md")+"."],
["Evidências",path("tmp/rules-qa/")+"; "+path("output/visual-audit/")+"; caminhos indicados na seção de testes."],
]
appendix+=table(["Área","Fontes"],sources,[.28,.72])+r"""
Esta atualização preserva as 22 seções e o estilo do texto fornecido. É uma edição documental: não modifica implementação nem executa novas suítes ou migrações.
\end{document}
"""
(DEST/"main.tex").write_text(preamble+cover+"\n"+"\n".join(body)+appendix,encoding="utf-8")
shutil.copy2(ROOT/"frontend/public/figma/eventhub-logo.png",FIG/"logo-eventhub.png")

pdfmetrics.registerFont(TTFont("EH",r"C:/Windows/Fonts/arial.ttf"))
pdfmetrics.registerFont(TTFont("EH-Bold",r"C:/Windows/Fonts/arialbd.ttf"))
PURPLE=colors.HexColor("#5B4BDB")
INK=colors.HexColor("#1F2437")
MUTED=colors.HexColor("#6B7280")
LIGHT=colors.HexColor("#F3F2FD")
LINE=colors.HexColor("#DAD6F2")

class Diagram:
    def __init__(self,name,height):
        self.name=name;self.w=520;self.h=height
        self.pdf=WORK/(name+".pdf")
        self.c=canvas.Canvas(str(self.pdf),pagesize=(self.w,self.h))
    def text(self,x,y,s,size=10,bold=False,color=INK,align="left"):
        c=self.c;c.setFont("EH-Bold" if bold else "EH",size);c.setFillColor(color)
        for k,line in enumerate(s.split("\n")):
            if align=="center":c.drawCentredString(x,y-k*(size+3),line)
            else:c.drawString(x,y-k*(size+3),line)
    def box(self,x,y,w,h,s,fill=LIGHT,size=10,bold=False):
        c=self.c;c.setStrokeColor(LINE);c.setFillColor(fill);c.setLineWidth(.9)
        c.roundRect(x,y,w,h,7,fill=1,stroke=1)
        lines=s.split("\n")
        self.text(x+w/2,y+h/2+(len(lines)-1)*(size+3)/2-size*.35,s,size,bold,align="center")
    def arrow(self,points,label=None,lx=None,ly=None):
        c=self.c;c.setStrokeColor(PURPLE);c.setFillColor(PURPLE);c.setLineWidth(1)
        p=c.beginPath();p.moveTo(*points[0])
        for pt in points[1:]:p.lineTo(*pt)
        c.drawPath(p)
        x,y=points[-1];a,b=points[-2];ang=math.atan2(y-b,x-a)
        p=c.beginPath();p.moveTo(x,y)
        for angle in [ang+2.65,ang-2.65]:p.lineTo(x+6*math.cos(angle),y+6*math.sin(angle))
        p.close();c.drawPath(p,fill=1,stroke=0)
        if label:self.text(lx if lx is not None else (points[0][0]+x)/2,
                           ly if ly is not None else (points[0][1]+y)/2+5,label,8.3,color=MUTED,align="center")
    def finish(self):
        self.c.save()
        d=fitz.open(self.pdf)
        d[0].get_pixmap(matrix=fitz.Matrix(3,3),alpha=False).save(FIG/(self.name+".png"))

d=Diagram("figura1-arquitetura",560)
d.box(150,510,220,36,"Navegador / Frontend React",size=11,bold=True)
d.box(150,442,220,36,"Nginx / API Gateway",size=11,bold=True)
d.arrow([(260,510),(260,478)],"HTTP / JSON",315,491)
svcs=[("Identity","identity_db","Node.js"),("Events","event_db","FastAPI"),("Registrations","registration_db","FastAPI"),
      ("Payments","payment_db","Node.js"),("Attendance","attendance_db","FastAPI"),("Certificates","certificate_db","FastAPI"),
      ("Notifications","notification_db","FastAPI"),("Reporting","reporting_db","FastAPI"),("Payment Provider","provider_db","Node.js")]
for i,(name,db,stack) in enumerate(svcs):
    d.box(12+(i%3)*174,312-(i//3)*105,160,82,name+"\n"+stack+"\n"+db,size=10)
d.arrow([(260,442),(260,398)])
d.box(12,36,245,42,"PostgreSQL: uma instância\nNove bancos e credenciais próprias",size=9)
d.box(271,36,237,42,"RabbitMQ + outboxes\nEntrega assíncrona e deduplicação",size=9)
d.text(260,16,"HTTP interno por APIs; sem SQL entre bancos de serviços.",8.5,color=MUTED,align="center")
d.finish()

d=Diagram("figura2-frontend",370)
d.box(145,320,230,34,"main.tsx / App.tsx e rotas",bold=True)
d.box(145,250,230,38,"AuthProvider / RequireAccount",bold=True)
d.arrow([(260,320),(260,288)])
for i,name in enumerate(["Acesso e perfis","Catálogo e inscrição","Gestão institucional","Presença e QR","Certificados","Dashboards"]):
    d.box(12+(i%3)*174,174-(i//3)*62,160,42,name)
d.arrow([(260,250),(260,220)])
d.box(76,45,368,35,"Clientes HTTP e tipos / APIs do Gateway",bold=True)
d.arrow([(260,112),(260,80)])
d.text(260,17,"Assets locais, estados de interface e estilos responsivos.",9,color=MUTED,align="center")
d.finish()

d=Diagram("figura3-estados-inscricoes",450)
d.box(174,392,172,34,"Solicitação de inscrição",bold=True)
d.box(16,288,146,45,"CONFIRMED",fill=colors.HexColor("#E7F5EC"),bold=True)
d.box(187,288,146,45,"PENDING_PAYMENT",fill=colors.HexColor("#FFF4D8"),bold=True,size=9.5)
d.box(358,288,146,45,"WAITLISTED",bold=True)
d.arrow([(210,392),(88,392),(88,333)],"Gratuita com vaga",88,369)
d.arrow([(260,392),(260,333)],"Paga com vaga",302,355)
d.arrow([(310,392),(431,392),(431,333)],"Lotada e espera ativa",431,369)
d.arrow([(187,310),(162,310)],"Aprovação\nno prazo",174,347)
d.arrow([(431,288),(431,249),(261,249),(261,288)],"Promoção paga",345,258)
d.arrow([(358,300),(345,300),(345,221),(88,221),(88,288)],"Promoção gratuita",172,231)
d.box(102,117,146,40,"CANCELLED",fill=colors.HexColor("#F4F5F8"),bold=True)
d.box(294,117,146,40,"EXPIRED",fill=colors.HexColor("#F4F5F8"),bold=True)
d.arrow([(220,288),(220,190),(175,190),(175,157)],"Recusa/cancelamento",130,179)
d.arrow([(300,288),(300,190),(367,190),(367,157)],"Prazo vencido",430,178)
d.text(260,82,"CONFIRMED e WAITLISTED podem ser canceladas conforme a política.",8.5,color=MUTED,align="center")
d.text(260,55,"Ocupam vaga: CONFIRMED e PENDING_PAYMENT.",9,bold=True,align="center")
d.text(260,29,"Espera desabilitada: lotação recusa. Estados terminais não reabrem.",8.5,color=MUTED,align="center")
d.finish()

d=Diagram("figura4-relacionamentos-bancos",590)
d.text(12,568,"Relações físicas selecionadas, dentro de cada banco",12,bold=True)
d.box(12,337,243,209,"",fill=colors.white)
d.text(25,523,"IDENTITY_DB",11,bold=True,color=PURPLE)
d.box(28,453,210,43,"users\nid PK | role | credentials_version",size=9)
d.box(28,373,210,43,"organization_members\nuser_id FK + UNIQUE | organization_id FK",size=8.3)
d.arrow([(134,453),(134,416)])
d.text(184,427,"1 : 0..1",8,color=MUTED,align="center")
d.text(26,350,"organizations, resets e sessões têm FKs locais.",8,color=MUTED)
d.box(270,337,238,209,"",fill=colors.white)
d.text(283,523,"REGISTRATION_DB",11,bold=True,color=PURPLE)
d.box(285,453,208,43,"inventories\nactivity_id PK | capacity | revision",size=9)
d.box(285,373,208,43,"registrations\nid PK | activity_id FK | user_id lógico",size=8.5)
d.arrow([(389,453),(389,416)])
d.text(439,427,"1 : N",8,color=MUTED,align="center")
d.text(283,350,"Ações e decisões referenciam inscrição local.",8,color=MUTED)
other=[("EVENT_DB","events + JSONB\nowner_user_id lógico"),("PAYMENT_DB","payments\nregistration_id lógico"),
       ("PROVIDER_DB","provider_transactions\nreferência lógica"),("ATTENDANCE_DB","attendance\nregistration_id lógico único"),
       ("CERTIFICATE_DB","certificates / templates\nspeaker_certificates"),("REPORTING_DB","projeções e IDs\nprocessados")]
for i,(title,s) in enumerate(other):
    d.box(12+(i%3)*174,216-(i//3)*88,160,69,title+"\n"+s,size=8.5)
d.box(12,48,496,54,"NOTIFICATION_DB: deliveries (ID único por mensagem)\nVínculos entre bancos são lógicos e validados por APIs/eventos.",size=9)
d.text(260,19,"PK: chave primária | FK: relação local | UNIQUE: unicidade",8.5,color=MUTED,align="center")
d.finish()

d=Diagram("figura5-sequencia-pagamento",590)
steps=[
("1","Frontend / Gateway","Registrations","Solicitar reserva com chave idempotente"),
("2","Registrations","Events","Consultar atividade, capacidade e preço"),
("3","Registrations","PostgreSQL próprio","Reservar sob transação e retornar prazo"),
("4","Frontend / Gateway","Payments","Enviar decisão da simulação"),
("5","Payments","PostgreSQL próprio","Persistir PENDING, prazo e correlação"),
("6","Payments","Payment Provider","Criar/consultar transação idempotente"),
("7","Payment Provider","Payments","Retornar APPROVED / DECLINED / EXPIRED"),
("8","Payments","Registrations","Aplicar resultado por contrato interno"),
("9","Registrations","PostgreSQL próprio","Validar prazo, gravar estado e outbox"),
("10","Registrations","Payments / Frontend","Retornar estado efetivo"),
("11","Outbox / publisher","RabbitMQ","Publicar evento durável confirmado"),
("12","RabbitMQ","Notifications / Reporting","Consumir e deduplicar"),
]
d.text(12,568,"Reserva, provedor e confirmação",12,bold=True)
for i,(num,a,b,msg) in enumerate(steps):
    y=513-i*38
    d.box(12,y,496,32,"",fill=LIGHT if i%2==0 else colors.white)
    d.text(24,y+12,num,9,bold=True,color=PURPLE)
    d.text(54,y+19,a+"  >  "+b,9,bold=True)
    d.text(54,y+6,msg,8.3,color=MUTED)
d.box(12,21,496,47,"Falha temporária: Payments mantém reconciliação pendente.\nComunicação não bloqueia a confirmação; sem cobrança real.",size=9)
d.finish()

(DEST/"LEIA-ME.txt").write_text(
    "Projeto LaTeX atualizado para Overleaf\n\n"
    "Importe o ZIP como novo projeto, defina main.tex como principal e use pdfLaTeX.\n"
    "Mantenha figuras/ ao lado de main.tex. Codificação: UTF-8.\n"
    "Foram preservadas as 22 seções e o estilo do documento fornecido.\n"
    "As cinco figuras estão atualizadas e incluídas, assim como a marca local.\n"
    "A instituição é a conta organizadora. Certificados são por atividade.\n"
    "Os testes integrados pertencem ao QA separado descrito no documento.\n"
    "Nenhum teste foi executado nem código da aplicação alterado nesta edição.\n",encoding="utf-8")
archive=ROOT/"output/overleaf/EventHub_Relatorio_Atualizado_Overleaf.zip"
with zipfile.ZipFile(archive,"w",zipfile.ZIP_DEFLATED) as z:
    for p in sorted(DEST.rglob("*")):
        if p.is_file() and (p.name in ("main.tex","LEIA-ME.txt") or p.parent==FIG):
            z.write(p,p.relative_to(DEST).as_posix())
print(json.dumps({"main_tex":str(DEST/"main.tex"),"zip":str(archive),
    "sections":len(body),"figures":len(list(FIG.glob("*.png"))),
    "characters":len((DEST/"main.tex").read_text(encoding="utf-8"))},ensure_ascii=False,indent=2))
