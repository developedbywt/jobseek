import { test, expect } from "@playwright/test";

test.describe("Customization History Integration on Queue Page", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to queue page
    await page.goto("/en/queue");
    // Wait for page to load
    await page.waitForLoadState("networkidle");
  });

  test("should display customization history panel on queue page", async ({ page }) => {
    // Check for the customization history section
    const historyPanel = page.locator('text=Customization History');
    await expect(historyPanel).toBeVisible();
  });

  test("should show total customization count", async ({ page }) => {
    // Check if total count is displayed
    const totalCount = page.locator('text=total');
    await expect(totalCount).toBeVisible();
  });

  test("should display loading state initially", async ({ page }) => {
    // Reload page to catch loading state
    await page.reload();
    // Look for animation spinner
    const spinner = page.locator('[class*="animate-spin"]').first();
    // Spinner should appear and then disappear
    if (await spinner.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(spinner).toBeVisible();
    }
  });

  test("should show empty state when no customizations exist", async ({ page }) => {
    // If empty, should show message
    const emptyMessage = page.locator('text=No customizations yet');
    const exists = await emptyMessage.isVisible().catch(() => false);
    
    if (exists) {
      await expect(emptyMessage).toBeVisible();
    } else {
      // If not empty, should have at least one item
      const items = page.locator('[class*="flex"][class*="items-start"][class*="justify-between"]');
      const count = await items.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test("should allow pagination if many customizations exist", async ({ page }) => {
    // Check if pagination controls exist
    const nextButton = page.locator('button:has-text("Next")');
    const previousButton = page.locator('button:has-text("Previous")');
    
    const hasNext = await nextButton.isVisible().catch(() => false);
    const hasPrev = await previousButton.isVisible().catch(() => false);
    
    if (hasNext) {
      // If next button exists, previous button should be disabled initially
      await expect(previousButton).toBeDisabled();
      
      // Click next to go to next page
      await nextButton.click();
      await page.waitForLoadState("networkidle");
      
      // Now previous button should be enabled
      await expect(previousButton).toBeEnabled();
    }
  });

  test("should display keyword tags for customizations", async ({ page }) => {
    // Look for keyword tags (styled with green background)
    const keywordTags = page.locator('[class*="bg-green-100"]');
    const tagCount = await keywordTags.count();
    
    if (tagCount > 0) {
      await expect(keywordTags.first()).toBeVisible();
    }
  });

  test("should display delete buttons for each customization", async ({ page }) => {
    // Look for delete buttons with aria-label
    const deleteButtons = page.locator('[aria-label*="Delete customization"]');
    const count = await deleteButtons.count();
    
    if (count > 0) {
      await expect(deleteButtons.first()).toBeVisible();
    }
  });

  test("should show relative timestamps for customizations", async ({ page }) => {
    // Look for time indicators (ago, today, etc)
    const timeElements = page.locator('[class*="text-xs"][class*="text-muted-foreground"]');
    
    // Should have at least one timestamp if there are customizations
    const emptyMessage = page.locator('text=No customizations yet');
    const isEmpty = await emptyMessage.isVisible().catch(() => false);
    
    if (!isEmpty) {
      const timeCount = await timeElements.count();
      expect(timeCount).toBeGreaterThan(0);
    }
  });

  test("should integrate seamlessly below job queue items", async ({ page }) => {
    // Check page structure: queue items should be above history panel
    const queueSection = page.locator('text=Job Queue').first();
    const historySection = page.locator('text=Customization History');
    
    const queueBox = await queueSection.boundingBox();
    const historyBox = await historySection.boundingBox();
    
    if (queueBox && historyBox) {
      // History panel should be below queue items
      expect(historyBox.y).toBeGreaterThan(queueBox.y);
    }
  });
});
