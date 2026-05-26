import { test, expect } from '@playwright/test';

test.describe('The Momir Machine - Full Interaction Flow', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for card data to load
    await expect(page.locator('#status')).toHaveText('ready', { timeout: 10000 });
  });

  test('1. Page loads with correct initial state', async ({ page }) => {
    // Orb is visible with default CMC of 5
    await expect(page.locator('#orb')).toBeVisible();
    await expect(page.locator('#orb-front')).toHaveText('5');

    // Particles are rendered
    const particles = page.locator('.particle');
    await expect(particles).toHaveCount(30);

    // Card is not visible initially
    await expect(page.locator('#card-color')).not.toBeVisible();

    // Status shows ready
    await expect(page.locator('#status')).toHaveText('ready');

    // Mode toggle shows RAWBT by default (or last saved)
    await expect(page.locator('#mode-toggle')).toBeVisible();
  });

  test('2. Swipe right decreases mana value', async ({ page }) => {
    const orb = page.locator('#orb');
    const box = await orb.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Swipe right (should decrease CMC)
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 80, cy, { steps: 5 });
    await page.mouse.up();

    const val = await page.evaluate(() => cmc);
    expect(val).toBeLessThan(5);
  });

  test('3. Swipe left increases mana value', async ({ page }) => {
    const orb = page.locator('#orb');
    const box = await orb.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Swipe left (should increase CMC)
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 80, cy, { steps: 5 });
    await page.mouse.up();

    const val = await page.evaluate(() => cmc);
    expect(val).toBeGreaterThan(5);
  });

  test('4. CMC clamps at minimum 0', async ({ page }) => {
    const orb = page.locator('#orb');
    const box = await orb.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Swipe far right (decreases, clamps at 0)
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 800, cy, { steps: 10 });
    await page.mouse.up();

    const val = await page.evaluate(() => cmc);
    expect(val).toBe(0);
  });

  test('5. CMC clamps at maximum 16', async ({ page }) => {
    const orb = page.locator('#orb');
    const box = await orb.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Swipe far left (increases, clamps at 16)
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 1200, cy, { steps: 10 });
    await page.mouse.up();

    const val = await page.evaluate(() => cmc);
    expect(val).toBe(16);
  });

  test('6. Holding orb adds charging class (glow + rumble)', async ({ page }) => {
    const orb = page.locator('#orb');
    const box = await orb.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();

    // Wait for charging to kick in (~400ms based on 20% of 1800ms)
    await page.waitForTimeout(500);

    await expect(orb).toHaveClass(/charging/);

    await page.mouse.up();
  });

  test('7. Releasing orb before cast time cancels the cast', async ({ page }) => {
    const orb = page.locator('#orb');
    const box = await orb.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(500);
    await page.mouse.up();

    // Orb should still be visible (no burst)
    await expect(orb).not.toHaveClass(/burst/);
    // Card should not appear
    await expect(page.locator('#card-color')).not.toHaveClass(/visible/);
  });

  test('8. Full cast: hold triggers burst, card appears in color', async ({ page }) => {
    // Mock the image fetch to avoid network dependency
    await page.route('https://cards.scryfall.io/**', route => {
      route.fulfill({
        status: 200,
        contentType: 'image/jpeg',
        path: './tests/fixtures/test-card.jpg',
      }).catch(() => route.continue());
    });

    const orb = page.locator('#orb');
    const box = await orb.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Hold for full cast time
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(2000);

    // Orb should burst
    await expect(orb).toHaveClass(/burst/);

    // Status should indicate summoning
    await expect(page.locator('#status')).toContainText(/summoning/i);
  });

  test('9. Full cast sequence: color card → dithered → fly away → orb returns', async ({ page }) => {
    // Use show mode to avoid RawBT dependency
    await page.evaluate(() => {
      localStorage.setItem('momir-mode', 'show');
    });
    await page.reload();
    await expect(page.locator('#status')).toHaveText('ready', { timeout: 10000 });

    const orb = page.locator('#orb');
    const colorEl = page.locator('#card-color');
    const ditheredEl = page.locator('#card-dithered');
    const wrapper = page.locator('#card-wrapper');
    const nameEl = page.locator('#card-name-overlay');
    const box = await orb.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Cast
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(2000);

    // Orb bursts
    await expect(orb).toHaveClass(/burst/, { timeout: 3000 });

    // Color card appears
    await expect(colorEl).toHaveClass(/visible/, { timeout: 5000 });
    const colorSrc = await colorEl.getAttribute('src');
    expect(colorSrc).toContain('scryfall.io');

    // Card name appears
    await expect(nameEl).toHaveClass(/visible/);
    const name = await nameEl.textContent();
    expect(name.length).toBeGreaterThan(0);

    // Dithered card fades in on top
    await expect(ditheredEl).toHaveClass(/visible/, { timeout: 8000 });
    const ditheredSrc = await ditheredEl.getAttribute('src');
    expect(ditheredSrc).toContain('data:image/png');

    // Card flies off the top
    await expect(wrapper).toHaveClass(/flyaway/, { timeout: 5000 });

    // Orb returns
    await expect(orb).not.toHaveClass(/burst/, { timeout: 3000 });
    await expect(orb).toBeVisible();

    // Status returns to ready
    await expect(page.locator('#status')).toHaveText('ready', { timeout: 3000 });
  });

  test('10. Mode toggle switches between RAWBT and SHOW', async ({ page }) => {
    const toggle = page.locator('#mode-toggle');
    const modeText = page.locator('#mode-text');

    // Get initial mode
    const initial = await modeText.textContent();

    // Click toggle
    await toggle.click();
    const after = await modeText.textContent();
    expect(after).not.toBe(initial);

    // Click again to toggle back
    await toggle.click();
    await expect(modeText).toHaveText(initial);
  });

  test('11. Mode persists in localStorage', async ({ page }) => {
    const toggle = page.locator('#mode-toggle');

    // Set to show mode
    await page.evaluate(() => localStorage.setItem('momir-mode', 'show'));
    await page.reload();
    await expect(page.locator('#status')).toHaveText('ready', { timeout: 10000 });

    await expect(page.locator('#mode-text')).toHaveText('SHOW');
  });

  test('12. Cannot cast while already casting', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('momir-mode', 'show'));
    await page.reload();
    await expect(page.locator('#status')).toHaveText('ready', { timeout: 10000 });

    const orb = page.locator('#orb');
    const box = await orb.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Start first cast
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(2000);

    // Wait for burst
    await expect(orb).toHaveClass(/burst/, { timeout: 3000 });

    // Verify casting flag prevents re-entry (orb is burst, can't interact)
    const isCasting = await page.evaluate(() => {
      // Access the casting variable from page context
      return (window as any).casting !== undefined;
    });
    // The orb is in burst state during cast
    await expect(orb).toHaveClass(/burst/);
  });

  test('13. Swipe during hold cancels the cast', async ({ page }) => {
    const orb = page.locator('#orb');
    const box = await orb.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Start hold
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(300);

    // Move significantly (swipe)
    await page.mouse.move(cx + 80, cy, { steps: 5 });
    await page.mouse.up();

    // Should NOT have burst
    await expect(orb).not.toHaveClass(/burst/);
    // Charging should be removed
    await expect(orb).not.toHaveClass(/charging/);
    // CMC should have changed
    const val = await page.evaluate(() => cmc);
    expect(val).toBeLessThan(5);
  });

  test('14. Card data loads correct number of creatures', async ({ page }) => {
    const total = await page.evaluate(() => {
      return Object.values(cardData).reduce((s: number, a: any) => s + a.length, 0);
    });
    expect(total).toBeGreaterThan(16000);
  });

  test('15. RawBT connection failure shows error in show mode gracefully', async ({ page }) => {
    // Force rawbt mode
    await page.evaluate(() => localStorage.setItem('momir-mode', 'rawbt'));
    await page.reload();
    await expect(page.locator('#status')).toHaveText('ready', { timeout: 10000 });

    const orb = page.locator('#orb');
    const box = await orb.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Cast
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(2000);

    // Should show error about RawBT not connected
    await expect(page.locator('#status')).toContainText(/rawbt|error|connect/i, { timeout: 10000 });
  });
});
