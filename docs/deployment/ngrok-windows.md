dei # EventHub com ngrok no Windows

Endereço público: **https://undaunted-bargraph-freebie.ngrok-free.dev**. Destino local: **http://localhost:8080**.

O endereço pode continuar o mesmo após reiniciar ou mudar de computador, usando a mesma conta ngrok e seu domínio atribuído. O site só responde enquanto o computador estiver ligado, conectado à internet, sem suspensão e com Docker e ngrok funcionando. O domínio de desenvolvimento pertence à conta e permanece entre execuções, conforme a [documentação de endpoints HTTP do ngrok](https://ngrok.com/docs/gateway/endpoints/http).

Este guia descreve os passos; não indica que um backup, migração, serviço Windows ou publicação já tenha sido realizado.

## 1. Antes de mudar de computador

Copie o projeto completo, incluindo alterações locais e o arquivo oculto `.env`, por um meio privado. Preserve as senhas e chaves existentes; não substitua o arquivo por `.env.example` nem gere novas chaves para essa migração.

**Copiar a pasta do projeto não copia os bancos.** Eles estão no volume Docker `postgres_data`, e o RabbitMQ usa `rabbitmq_data`, definidos no Compose. Para conservar contas, eventos, inscrições, presença, certificados, relatórios e filas, prepare uma cópia consistente desses volumes com os serviços parados e restaure no Docker do novo computador antes de iniciar o projeto. Siga o [procedimento oficial de backup e restauração do Docker Desktop](https://docs.docker.com/desktop/settings-and-maintenance/backup-and-restore/), incluindo o procedimento de volumes indicado nessa página. Confirme os dados restaurados antes de desativar a instalação antiga.

Uma instalação com volumes vazios cria um ambiente novo. Não use `docker compose down -v` durante a mudança: essa opção remove volumes. Arquivos da mailbox local não fazem parte desses volumes; solicite novos links de recuperação após a migração, se necessário.

## 2. Preparar e iniciar o projeto no novo Windows

Instale Docker Desktop com contêineres Linux e Compose. Abra o Docker Desktop e aguarde ficar pronto. Com projeto, `.env` e dados restaurados, abra o PowerShell na raiz do projeto:

```powershell
docker compose --parallel 1 build
docker compose up -d --wait --wait-timeout 180
docker compose ps
```

Abra http://localhost:8080 e confira suas contas/eventos. Em http://localhost:8080/api/status, os oito serviços devem aparecer prontos. Em reinicializações posteriores, basta iniciar o Docker e executar o `up` acima; o build só é necessário para preparar imagens ou aplicar alterações.

No `.env` do computador que vai hospedar o sistema, mantenha:

```dotenv
PUBLIC_APP_URL=https://undaunted-bargraph-freebie.ngrok-free.dev
```

Se mudar esse valor depois de iniciar, aplique aos serviços que geram links:

```powershell
docker compose up -d --no-deps --force-recreate --wait identity notifications certificates
```

Isso ajusta links novos de e-mail e certificado. Mensagens já gravadas podem conter o endereço antigo. O pagamento continua simulado e `MAIL_MODE=mailbox` continua sendo entrega local. A confirmação de e-mail ainda é consumida pela API, conforme o [contrato de Identity](../api/identity.md).

## 3. Autenticar ngrok e iniciar manualmente

Instale o agente seguindo a [página oficial para Windows](https://ngrok.com/download/windows). Entre no painel ngrok com a **mesma conta** que possui `undaunted-bargraph-freebie.ngrok-free.dev` e obtenha seu authtoken. Cadastre-o somente no terminal local; não envie o token no chat nem o coloque no repositório. A [referência oficial da CLI](https://ngrok.com/docs/gateway/agent/cli) explica o cadastro e os comandos abaixo.

```powershell
ngrok config add-authtoken "SUBSTITUA_PELO_TOKEN_NO_SEU_COMPUTADOR"
ngrok config check
ngrok http http://localhost:8080 --url https://undaunted-bargraph-freebie.ngrok-free.dev
```

Substitua o texto de exemplo pelo token real apenas no seu computador. Deixe esse terminal aberto. Antes de transferir o endereço para o novo PC, encerre o ngrok antigo com `Ctrl+C`, para não disputar o mesmo endpoint. Confira no painel se o domínio pertence à conta correta quando ocorrer erro de endereço em uso ou não autorizado.

Abra o endereço público em outro dispositivo e teste o login. Para uso manual após desligar e ligar, inicie o Docker e repita o último comando ngrok. O domínio fixo não mantém o servidor funcionando durante o desligamento.

## 4. Opcional: iniciar ngrok como serviço Windows

Faça essa configuração somente depois de testar o modo manual. O ngrok oferece instalação como serviço nativo; inicia todos os endpoints da configuração e registra erros no Visualizador de Eventos do Windows. Consulte o [guia oficial de serviço](https://ngrok.com/docs/gateway/agent/service).

Use um executável real em caminho fixo, por exemplo `C:\Tools\ngrok\ngrok.exe`, e uma configuração em `C:\ProgramData\ngrok\ngrok.yml`. Ambos precisam estar acessíveis à conta que executará o serviço. Um alias da Microsoft Store dentro do perfil do usuário pode não estar disponível para essa conta; nesse caso, use o executável independente da página oficial. Não mova os arquivos após instalar o serviço.

Crie localmente o arquivo abaixo, seguindo o [formato v3 oficial](https://ngrok.com/docs/gateway/agent/config/v3). O exemplo não contém credenciais reais; preencha `authtoken` somente no arquivo local e restrinja sua leitura à conta do serviço e aos administradores.

```yaml
version: 3
agent:
  authtoken: "PREENCHA_LOCALMENTE_SEM_COMPARTILHAR"
endpoints:
  - name: eventhub
    url: https://undaunted-bargraph-freebie.ngrok-free.dev
    upstream:
      url: http://localhost:8080
```

Encerre o túnel manual. Em PowerShell **como administrador**, valide a configuração e instale/inicie o serviço:

```powershell
& 'C:\Tools\ngrok\ngrok.exe' config check --config 'C:\ProgramData\ngrok\ngrok.yml'
& 'C:\Tools\ngrok\ngrok.exe' service install --config 'C:\ProgramData\ngrok\ngrok.yml'
& 'C:\Tools\ngrok\ngrok.exe' service start
```

Depois confira a conta e a inicialização no aplicativo **Serviços** do Windows. O serviço ngrok não inicia o Docker Desktop: confirme separadamente que Docker e EventHub voltam após reiniciar. Se o Docker só iniciar após entrar no Windows, o site dependerá desse login. Mantenha o computador sem suspensão enquanto ele hospedar o sistema.
