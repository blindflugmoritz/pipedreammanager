const puppeteer = require('puppeteer');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testLogin() {
  console.log('Starting test login...');
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });
  
  try {
    const page = await browser.newPage();
    
    // Go to Pipedream login page
    console.log('Navigating to Pipedream login page...');
    await page.goto('https://pipedream.com/auth/login', { waitUntil: 'networkidle0' });
    
    // Take screenshot of what we see
    await page.screenshot({ path: 'login-page-test.png' });
    console.log('Login page screenshot saved to login-page-test.png');
    
    // Print what we found on the page
    const pageInfo = await page.evaluate(() => {
      // Get all form elements
      const forms = Array.from(document.querySelectorAll('form')).map(f => ({
        id: f.id,
        action: f.action,
        method: f.method
      }));
      
      // Get all input fields
      const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
        id: i.id,
        type: i.type,
        name: i.name,
        placeholder: i.placeholder,
        className: i.className,
        isVisible: i.offsetParent !== null
      }));
      
      // Get all buttons
      const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
        id: b.id,
        type: b.type,
        text: b.textContent.trim(),
        className: b.className,
        isVisible: b.offsetParent !== null
      }));
      
      // Get all labels and text that might help identify fields
      const labels = Array.from(document.querySelectorAll('label')).map(l => ({
        for: l.htmlFor,
        text: l.textContent.trim(),
        className: l.className
      }));
      
      return { forms, inputs, buttons, labels };
    });
    
    console.log('Page analysis:', JSON.stringify(pageInfo, null, 2));
    
    // Wait before closing
    console.log('Keeping browser open for 10 seconds...');
    await sleep(10000);
    
  } finally {
    await browser.close();
    console.log('Test complete.');
  }
}

// Run the test
testLogin().catch(err => console.error('Test failed:', err));
