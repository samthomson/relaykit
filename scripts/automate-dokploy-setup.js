#!/usr/bin/env node

const { chromium } = require('playwright');

async function setupDokploy() {
  const email = process.env.SYSTEM_EMAIL;
  const password = process.env.SYSTEM_PASSWORD;
  const ownerNpub = process.env.OWNER_NPUB;

  if (!email || !password || !ownerNpub) {
    console.error('Missing required environment variables');
    process.exit(1);
  }

  console.log('Starting browser automation...');
  const browser = await chromium.launch({ 
    headless: true,
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  

  try {
    // Navigate to Dokploy (use dokploy hostname from inside container)
    const dokployUrl = process.env.DOKPLOY_URL || 'http://dokploy:3000';
    console.log(`Navigating to Dokploy at ${dokployUrl}...`);
    await page.goto(dokployUrl, { waitUntil: 'networkidle' });

    // Check if we're on the register page or login page
    const url = page.url();
    console.log(`Current URL: ${url}`);
    

    if (url.includes('/register') || await page.locator('text=Register').first().isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('On register page, filling registration form...');
      
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', password);
      await page.fill('input[name="confirmPassword"]', password);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
      
      console.log('✓ Registration completed');
    } else if (url.includes('/login') || await page.locator('text=Login').first().isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('Logging in...');
      
      // Wait a bit for the page to fully load
      await page.waitForTimeout(2000);
      
      
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', password);
      
      // Wait for any network requests to complete after clicking submit
      await Promise.all([
        page.waitForLoadState('networkidle'),
        page.click('button[type="submit"]')
      ]);
      
      const currentUrl = page.url();
      
      if (currentUrl.includes('/dashboard')) {
        console.log('✓ Login successful');
      } else {
        console.error('Login failed - not redirected to dashboard');
        await page.screenshot({ path: '/tmp/login-error.png' });
        process.exit(1);
      }
    } else {
      console.log('Already logged in');
    }

    // Navigate to profile page
    console.log('Navigating to Profile page...');
    await page.goto(`${dokployUrl}/dashboard/settings/profile`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Scroll down to API/CLI Keys section
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    
    // Click Generate New Key button
    console.log('Generating API key...');
    const generateButton = page.locator('button:has-text("Generate New Key")').first();
    
    if (await generateButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await generateButton.click();
      await page.waitForTimeout(2000);
      
      // Find and fill the modal
      const modal = page.locator('[role="dialog"]:has-text("Generate API Key")').first();
      
      // Fill name
      const nameInput = modal.locator('input[name="name"]').first();
      await nameInput.click({ force: true });
      await nameInput.fill('RelayKit Bootstrap Key');
      await page.waitForTimeout(500);
      
      // Select organization
      await modal.evaluate(el => el.scrollTop = 0);
      await page.waitForTimeout(500);
      
      const orgButton = modal.locator('button:has-text("Select organization")').first();
      if (await orgButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await orgButton.click({ force: true });
        await page.waitForTimeout(1000);
        
        const firstOrg = page.locator('[role="option"]').first();
        if (await firstOrg.isVisible({ timeout: 3000 }).catch(() => false)) {
          await firstOrg.click({ force: true });
          await page.waitForTimeout(1000);
        }
      }
      
      // Scroll to Generate button and click
      await modal.evaluate(el => el.scrollTop = el.scrollHeight);
      await page.waitForTimeout(500);
      
      const modalGenerateButton = modal.locator('button:has-text("Generate")').last();
      await modalGenerateButton.click({ force: true });
      await page.waitForTimeout(5000);
      
      // Look for success modal
      const successModal = page.locator('[role="dialog"]:has-text("API Key Generated Successfully")').first();
      
      if (await successModal.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Get all text content and extract the API key
        const modalText = await successModal.textContent();
        const cleanText = modalText.replace(/Copy to Clipboard|Close|Copy/g, '');
        const match = cleanText.match(/[a-zA-Z0-9]{50,}/);
        
        if (match) {
          const apiKey = match[0].trim();
          
          // Save API key to file
          const { writeFileSync } = require('fs');
          writeFileSync('/app/.relaykit/bootstrap-key', apiKey);
          
          // Save owner npub
          writeFileSync('/app/.relaykit/owner-npub', ownerNpub.trim());
          
          console.log('✓ API key generated and saved');
          console.log('✓ Owner npub saved');
          console.log('');
          console.log('✓ Setup complete! Access RelayKit at http://your-server-ip:4000');
        } else {
          console.error('Could not extract API key from modal');
          process.exit(1);
        }
      } else {
        console.error('Success modal did not appear');
        await page.screenshot({ path: '/tmp/error.png' });
        process.exit(1);
      }
    } else {
      console.error('Could not find Generate New Key button');
      await page.screenshot({ path: '/tmp/error.png' });
      process.exit(1);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: '/tmp/error.png' }).catch(() => {});
    process.exit(1);
  } finally {
    await browser.close();
  }
}

setupDokploy().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
