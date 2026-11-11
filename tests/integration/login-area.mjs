import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../frontend/node_modules/playwright/index.mjs';

// Uses existing QA accounts and real HTTP/browser requests. Creates no business data.
const origin = 'http://127.0.0.1:18080';
const fixtures = JSON.parse(await readFile(new URL('../../tmp/rules-qa/browser-fixtures.json', import.meta.url), 'utf8'));
assert.equal(fixtures.base, origin + '/api', 'Only the isolated QA origin is allowed');
const directory = new URL('../../output/visual-audit/2026-11-11/login-area/', import.meta.url);
const checks = [], screenshots = [], errors = [];
const profiles = [
  { name: 'participant', email: fixtures.participant.email, wrongArea: 'organization', wrongPath: '/organizacao/login', correctArea: 'participant', correctPath: '/participante/login', destination: '/eventos', role: 'PARTICIPANT', link: 'Acesso de participante', message: 'Esta conta é de participante. Acesse a área do participante.' },
  { name: 'organizer', email: fixtures.organizer.email, wrongArea: 'participant', wrongPath: '/participante/login', correctArea: 'organization', correctPath: '/organizacao/login', destination: '/organizacao/eventos', role: 'ORGANIZER', link: 'Acesso de organização', message: 'Esta conta é de organizador. Acesse a área do organizador.' },
];
let browser;

before(async () => {
  await mkdir(directory, { recursive: true });
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
}, { timeout: 60000 });

after(async () => {
  await browser?.close();
  const status = checks.length === 6 && screenshots.length === 4 && errors.length === 0 ? 'passed' : 'failed';
  await writeFile(new URL('verification.json', directory), JSON.stringify({ origin, status, checks, screenshots, errors }, null, 2));
});

for (const profile of profiles) {
  test(`${profile.name}: API rejects the wrong login area without an access token`, async () => {
    const response = await fetch(origin + '/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: profile.email, password: fixtures.password, area: profile.wrongArea }),
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.status, 403);
    const result = await response.json();
    assert.equal(result.message, profile.message);
    assert.equal(result.accessToken, undefined);
    checks.push(`${profile.name}: real API wrong-area rejection (403, no token)`);
  });

  test(`${profile.name}: desktop and mobile show the error and allow login through the correct link`, { timeout: 180000 }, async () => {
    for (const viewport of [{ name: 'desktop', width: 1440, height: 1024 }, { name: 'mobile', width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(60000);
      page.on('pageerror', error => errors.push(error.message));
      let loggedIn = false;
      try {
        await page.goto(origin + profile.wrongPath);
        await page.locator('#login-email').fill(profile.email);
        await page.locator('#login-password').fill(fixtures.password);
        const rejected = page.waitForResponse(response => response.url() === origin + '/api/auth/login');
        await page.getByRole('button', { name: 'Entrar', exact: true }).click();
        const rejection = await rejected;
        assert.equal(rejection.status(), 403);
        assert.equal(rejection.request().postDataJSON().area, profile.wrongArea);
        assert.equal((await rejection.json()).accessToken, undefined);
        await page.getByRole('alert').filter({ hasText: profile.message }).waitFor();
        assert.equal(page.url(), origin + profile.wrongPath);
        assert.equal(await page.evaluate(() => localStorage.getItem('eventhub.session.v1')), null);
        const correctLink = page.getByRole('link', { name: profile.link, exact: true });
        assert.equal(await correctLink.isVisible(), true);
        const metrics = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
        assert.ok(metrics.scrollWidth <= metrics.width, 'No horizontal overflow');
        const name = `${profile.name}-wrong-area-${viewport.name}`;
        await page.screenshot({ path: fileURLToPath(new URL(name + '.png', directory)), fullPage: true });
        screenshots.push({ name, ...metrics });

        await correctLink.click();
        await page.waitForURL(origin + profile.correctPath);
        await page.locator('#login-email').fill(profile.email);
        await page.locator('#login-password').fill(fixtures.password);
        const accepted = page.waitForResponse(response => response.url() === origin + '/api/auth/login');
        await page.getByRole('button', { name: 'Entrar', exact: true }).click();
        const acceptance = await accepted;
        assert.equal(acceptance.status(), 200);
        assert.equal(acceptance.request().postDataJSON().area, profile.correctArea);
        loggedIn = true;
        await page.waitForURL(origin + profile.destination);
        const session = await page.evaluate(() => JSON.parse(localStorage.getItem('eventhub.session.v1')));
        assert.equal(session.user.role, profile.role);
        await page.getByRole('button', { name: 'Menu da conta', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Menu da conta', exact: true }).click();
        await page.getByRole('button', { name: 'Sair', exact: true }).click();
        const logout = page.waitForResponse(response => response.url() === origin + '/api/auth/logout');
        await page.getByRole('button', { name: 'Sim, sair', exact: true }).click();
        assert.equal((await logout).status(), 204);
        loggedIn = false;
        await page.waitForURL(origin + profile.correctPath);
        assert.equal(await page.evaluate(() => localStorage.getItem('eventhub.session.v1')), null);
        checks.push(`${profile.name}/${viewport.name}: wrong-area alert, no session, correct-area link, successful login and logout`);
      } finally {
        if (loggedIn) {
          // Revoke any successful QA session even if an assertion after login fails.
          const token = await page.evaluate(() => JSON.parse(localStorage.getItem('eventhub.session.v1') || 'null')?.token).catch(() => null);
          if (token) await fetch(origin + '/api/auth/logout', { method: 'POST', headers: { authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(15000) }).catch(() => {});
        }
        await context.close();
      }
    }
    assert.deepEqual(errors, [], 'No uncaught browser errors');
  });
}
