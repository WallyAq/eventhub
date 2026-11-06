import { spawnSync } from 'node:child_process';

// Existing volumes are preserved. Run after applying the PostgreSQL environment from Compose.
const result = spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'sh', '/docker-entrypoint-initdb.d/01-init.sh'], {
  cwd: new URL('..', import.meta.url), encoding: 'utf8', windowsHide: true,
});
if (result.error || result.status !== 0) {
  console.error('Não foi possível provisionar os bancos. Confirme que o PostgreSQL está saudável e recebeu as variáveis atualizadas do Compose. Nenhum volume deve ser removido.');
  process.exitCode = 1;
} else console.log('Bancos de domínio e do provedor simulado provisionados; dados e senhas existentes preservados.');
