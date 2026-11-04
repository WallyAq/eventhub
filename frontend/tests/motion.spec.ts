import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { participant, participantEvent, participantFixture, paidActivity } from './participant-fixture';

async function expectReducedMotion(page: Page, surface: Locator) {
  const motion = await surface.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      animation: style.animationName,
      transitions: style.transitionDuration.split(',').map(value => parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000)),
      opacity: style.opacity,
    };
  });
  expect(motion.animation).toBe('none');
  expect(motion.transitions.every(duration => duration <= 1)).toBeTruthy();
  expect(motion.opacity).toBe('1');
  expect(await page.evaluate(() => document.getAnimations().filter(animation => {
    const duration = animation.effect?.getComputedTiming().activeDuration;
    return typeof duration === 'number' && duration > 1 && animation.playState !== 'finished';
  }).length)).toBe(0);
}

test('reduced motion keeps account navigation and checkout immediately usable with keyboard', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await participantFixture(page);
  await page.goto('/eventos');
  const featured = page.locator('.participant-featured-card');
  await expect(featured.getByRole('heading', { name: participantEvent.title, exact: true })).toBeVisible();
  await expectReducedMotion(page, featured);

  const account = page.getByRole('button', { name: 'Menu da conta', exact: true });
  await account.focus();
  await account.press('Enter');
  await expect(account).toHaveAttribute('aria-expanded', 'true');
  const popover = page.locator('.account-popover');
  await expect(popover.getByRole('link', { name: 'Meu perfil', exact: true })).toBeVisible();
  await expectReducedMotion(page, popover);
  await page.keyboard.press('Tab');
  await expect(popover.getByRole('link', { name: 'Meu perfil', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(account).toHaveAttribute('aria-expanded', 'false');
  await expect(account).toBeFocused();

  await featured.getByRole('link', { name: 'Inscreva-se', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Inscrição na Atividade', exact: true });
  await expect(dialog).toBeVisible();
  await expectReducedMotion(page, dialog.locator('.participant-checkout__body'));
  await dialog.getByRole('radio', { name: paidActivity.title, exact: true }).check();
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByLabel('Nome Completo', { exact: true })).toHaveValue(participant.name);
  await expect(dialog.locator('.participant-checkout__selection')).toContainText(paidActivity.title);
  await expectReducedMotion(page, dialog.locator('.participant-checkout__body'));
  await dialog.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(dialog.getByRole('radio', { name: paidActivity.title, exact: true })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL('/eventos/' + participantEvent.id);
  await expect(dialog).toHaveCount(0);
  expect(state.posts).toEqual([]);
  expect(state.unexpected).toEqual([]);

  // The same surfaces opt into decorative motion only when the preference permits it.
  // Comparing both modes also detects a missing stylesheet import without naming keyframes.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/eventos');
  const normalMotion = await page.locator('.participant-featured-card').evaluate(element => {
    const style = getComputedStyle(element);
    return { animation: style.animationName, duration: parseFloat(style.animationDuration) };
  });
  expect(normalMotion.animation).not.toBe('none');
  expect(normalMotion.duration).toBeGreaterThan(0);
});
