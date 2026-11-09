# RQ08 — instalação a partir de um clone novo

Pré-requisitos: Git, Node.js 24 e Docker Desktop em modo Linux, com Docker Compose. O Compose instala as dependências Node/Python dentro das imagens; não é necessário copiar `node_modules`, ambientes virtuais, `.env` antigo nem bancos de outro computador.

Depois de clonar o repositório e entrar na pasta:

```powershell
Copy-Item .env.example .env
node scripts/init-identity-keys.mjs
node scripts/init-internal-key.mjs
node scripts/init-backend-config.mjs
docker compose up -d --wait --wait-timeout 240 postgres rabbitmq
node scripts/provision-backend-databases.mjs
docker compose --parallel 1 build
docker compose up -d --wait --wait-timeout 240
docker compose ps
```

Abra `http://localhost:8080`. A página inicial apresenta o EventHub; **Entrar** leva à escolha de participante/organização. Depois de cadastrar e acessar a organização, use **Gerenciar Eventos** ou **Painel Geral**. `http://localhost:8080/api/status` deve retornar HTTP 200 com os oito serviços prontos. O simulador de pagamento é verificado separadamente pelo healthcheck do Compose.

`.env.example` contém somente configurações públicas e campos sensíveis vazios. Os scripts geram senhas, chaves RSA e credenciais de serviço localmente, preservam valores já existentes e não os imprimem. `.env` e dependências locais permanecem ignorados pelo Git. Nunca substitua um `.env` existente ao atualizar um ambiente com dados.

O modo padrão de e-mail é `mailbox`; pagamentos permanecem simulados. SMTP real e o endereço público/túnel são configurações opcionais posteriores. Veja [SMTP](smtp.md) e o guia de publicação utilizado pela equipe.

Para encerrar preservando dados: `docker compose down`. Não use remoção de volumes no ambiente de trabalho. A provisão é idempotente e permite acrescentar bancos em volumes existentes; editar senhas no `.env` não altera automaticamente senhas já cadastradas no PostgreSQL.

## Repetir a validação isolada

```powershell
node scripts/validate-clean-clone.mjs
```

O script clona o `HEAD` local em uma pasta temporária e usa somente os arquivos versionados. Verifica a ausência de `.env` no Git, a presença do template sem segredos, executa a inicialização duas vezes, valida o Compose, constrói as imagens, inicia volumes novos e testa cadastro, organização, publicação, inscrição, pagamento, relatórios, notificações e correlação com dependências reais.

O projeto Compose, a porta e as credenciais são exclusivos da validação. Ao terminar, o script remove apenas os contêineres/volumes descartáveis desse projeto e sua própria pasta temporária. Não reutiliza nem remove os volumes `eventhub` do ambiente atual. Log e relatório sem credenciais ficam em `tmp/rq08-clean-clone.log` e `tmp/rq08-clean-clone.json`, ignorados pelo Git.

Durante desenvolvimento, `node scripts/validate-clean-clone.mjs --working-tree` inclui as alterações ainda não commitadas em um snapshot Git temporário e faz um clone desse candidato. Essa opção não altera o branch/HEAD nem publica mudanças. Para outra pessoa receber as mudanças por `git clone` remoto, os arquivos precisam estar incluídos no commit e enviados ao repositório da equipe.

Em computadores com poucos recursos, execute builds, instalação isolada e testes de navegador em momentos separados. A validação isolada cria uma segunda pilha temporária e precisa de memória/CPU suficientes para ambos os ambientes.
