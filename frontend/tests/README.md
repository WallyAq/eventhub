Execute os testes de navegação e contratos do frontend a partir de `frontend`:

```powershell
npm ci
npx playwright install chromium --only-shell
npm run test:access
npm run build
```

Os testes iniciam o Vite em uma porta local aleatória e usam um navegador Chromium isolado. Todas as chamadas `/api` são interceptadas; nenhum serviço ou usuário real é acessado. A suíte verifica o redirecionamento pelo perfil recebido, rotas protegidas, revalidação da sessão, dados locais adulterados, falha de identidade, instituição fixa, equipe com vários organizadores, prévia autorizada e os três resultados do pagamento simulado.

Esses testes validam o comportamento das telas e os contratos enviados. As garantias de autorização, concorrência e persistência devem ser verificadas também pelos testes de backend e integração do repositório. Para usar um Chromium já instalado, informe seu executável na variável `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.
