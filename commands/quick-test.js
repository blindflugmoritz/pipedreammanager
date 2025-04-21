const puppeteer = require('puppeteer');
require('dotenv').config();

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function quickTest() {
  console.log('Starting quick test to diagnose the window closing issue...');
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });
  
  try {
    const page = await browser.newPage();
    console.log('Browser opened successfully');
    
    // Navigate to Google first to test if basic navigation works
    console.log('Navigating to Google...');
    await page.goto('https://www.google.com', { waitUntil: 'networkidle0', timeout: 30000 });
    console.log('Google page loaded successfully');
    
    // Take a screenshot
    await page.screenshot({ path: 'google-test.png' });
    console.log('Screenshot saved successfully');
    
    // Wait a moment
    console.log('Waiting 5 seconds...');
    await sleep(5000);
    console.log('Wait completed successfully');
    
    // Try going to Pipedream without logging in
    console.log('Navigating to Pipedream homepage...');
    await page.goto('https://pipedream.com', { waitUntil: 'networkidle0', timeout: 30000 });
    console.log('Pipedream homepage loaded successfully');
    
    // Take a screenshot
    await page.screenshot({ path: 'pipedream-home.png' });
    
    // Keep the browser open longer
    console.log('Test completed successfully. Keeping browser open for 2 minutes...');
    for (let i = 1; i <= 12; i++) {
      await sleep(10000);
      console.log(`Still running... ${i * 10} seconds elapsed`);
    }
    
  } catch (error) {
    console.error('Error during test:', error.message);
    // Take a screenshot if possible
    try {
      await page?.screenshot({ path: 'error-state.png' });
      console.log('Error screenshot saved');
    } catch (screenshotError) {
      console.log('Could not save error screenshot');
    }
  } finally {
    console.log('Test finished. Closing browser...');
    await browser.close();
    console.log('Browser closed successfully');
    // Ensure the process exits
    process.exit(0);
  }
}

module.exports = { quickTest };