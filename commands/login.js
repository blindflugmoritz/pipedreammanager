const puppeteer = require('puppeteer');
require('dotenv').config();

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function login(options) {
  const username = options.username || process.env.PIPEDREAM_USERNAME;
  const password = options.password || process.env.PIPEDREAM_PASSWORD;

  if (!username || !password) {
    console.error('Username and password are required. Provide via options or .env file');
    process.exit(1);
  }

  console.log('Launching browser to login to Pipedream...');
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36');
    
    // Navigate to login page
    console.log('Navigating to login page...');
    await page.goto('https://pipedream.com/auth/login', { waitUntil: 'networkidle0' });
    
    // Debug: take a screenshot to see the login form
    await page.screenshot({ path: 'login-page.png' });
    console.log('Saved screenshot of login page to login-page.png');
    
    // Basic debugging of page
    console.log('Analyzing login page structure...');
    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        forms: Array.from(document.forms).map(f => f.id || 'unnamed form'),
        allInputs: Array.from(document.querySelectorAll('input')).map(i => ({ 
          id: i.id, 
          type: i.type,
          placeholder: i.placeholder
        })),
        allButtons: Array.from(document.querySelectorAll('button')).map(b => ({
          type: b.type,
          text: b.textContent.trim()
        }))
      };
    });
    console.log('Page structure:', JSON.stringify(pageInfo, null, 2));
    
    // Try a completely different approach with direct keyboard navigation
    console.log('Trying focused input and keyboard navigation approach...');
    
    // First, click in the form area to activate it
    const formArea = await page.$('form') || await page.$('div[role="form"]') || await page.$('body');
    await formArea.click();
    await sleep(500);
    
    // Use direct keyboard input for both fields
    await page.keyboard.type(username);
    await sleep(500);
    await page.keyboard.press('Tab'); // Move to password field
    await sleep(500);
    await page.keyboard.type(password);
    await sleep(500);
    
    // Take screenshot to see if fields were filled
    await page.screenshot({ path: 'keyboard-input.png' });
    console.log('Saved screenshot after keyboard input');
    
    // Press Enter to submit form
    await page.keyboard.press('Enter');
    console.log('Pressed Enter to submit form');
    
    // Wait for navigation
    console.log('Waiting for navigation after form submission...');
    await page.waitForNavigation({ timeout: 30000 }).catch(e => {
      console.log('Navigation timeout - continuing anyway');
    });
    
    // Check if we're still on login page
    const currentUrl = await page.url();
    console.log(`Current URL after submission: ${currentUrl}`);
    
    if (currentUrl.includes('login')) {
      console.log('Still on login page. Trying alternative approach with browser console...');
      
      // Try to directly use browser console to find and interact with elements
      await page.evaluate((email, pass) => {
        console.log('Starting browser console login attempt');
        
        // Helper function to log all selectors we're trying
        function logAttempt(message) {
          console.log('Login attempt:', message);
        }
        
        // Get all inputs on the page
        const inputs = Array.from(document.querySelectorAll('input'));
        logAttempt(`Found ${inputs.length} input elements`);
        
        // First attempt - check for standard email/password pattern
        let emailInput = inputs.find(i => i.type === 'email' || i.id?.includes('email') || i.name?.includes('email'));
        let passwordInput = inputs.find(i => i.type === 'password');
        
        if (!emailInput && inputs.length >= 2) {
          // If we can't identify by type, use position - first input is likely email/username
          logAttempt('Using positional approach for email field');
          emailInput = inputs[0];
        }
        
        // Set values directly
        if (emailInput) {
          logAttempt(`Setting email field value: ${email}`);
          emailInput.value = email;
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));
          emailInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        if (passwordInput) {
          logAttempt('Setting password field value');
          passwordInput.value = pass;
          passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
          passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        // Find the submit button - try multiple approaches
        const buttons = Array.from(document.querySelectorAll('button'));
        logAttempt(`Found ${buttons.length} buttons`);
        
        // Look for submit button by type or content
        let submitButton = buttons.find(b => 
          b.type === 'submit' || 
          b.textContent.toLowerCase().includes('sign in') ||
          b.textContent.toLowerCase().includes('log in') ||
          b.textContent.toLowerCase().includes('login')
        );
        
        if (submitButton) {
          logAttempt('Found submit button - clicking');
          submitButton.click();
        } else if (buttons.length > 0) {
          // If no obvious submit button, try the last button in the form
          logAttempt('Using last button as submit');
          buttons[buttons.length - 1].click();
        }
        
        // If no button worked, try to submit the form directly
        if (!submitButton && !buttons.length) {
          const form = document.querySelector('form');
          if (form) {
            logAttempt('Submitting form directly');
            form.submit();
          }
        }
        
        logAttempt('Login attempt complete');
      }, username, password);
      
      // Wait a bit after our browser console attempt
      await sleep(5000);
      
      // Check if we're still on login page after browser console attempt
      const urlAfterConsole = await page.url();
      console.log(`URL after browser console login: ${urlAfterConsole}`);
      
      if (urlAfterConsole.includes('login')) {
        console.log('Direct console approach didn\'t work. Trying fixed element selectors...');
        
        // Manual clicking approach - we'll literally try every field and button
        await page.screenshot({ path: 'before-manual-attempt.png' });
        
        // Clear any previous inputs and start fresh
        await page.reload({ waitUntil: 'networkidle0' });
        
        // Try typing into the first visible input that's not a password
        const nonPasswordInputs = await page.$$('input:not([type="password"])');
        if (nonPasswordInputs.length > 0) {
          console.log(`Found ${nonPasswordInputs.length} non-password inputs`);
          await nonPasswordInputs[0].click();
          await page.keyboard.type(username);
        } else {
          // If no non-password input is found, try to inject one
          console.log('No email input found, injecting one...');
          await page.evaluate(() => {
            // Create email input before password
            const passwordInput = document.querySelector('input[type="password"]');
            if (passwordInput && passwordInput.parentNode) {
              const emailInput = document.createElement('input');
              emailInput.type = 'email';
              emailInput.placeholder = 'Email';
              passwordInput.parentNode.insertBefore(emailInput, passwordInput);
            }
          });
          
          // Now try to find and use our injected input
          await sleep(500);
          const injectedInput = await page.$('input[type="email"]');
          if (injectedInput) {
            await injectedInput.click();
            await page.keyboard.type(username);
          }
        }
        
        // Click the password field and enter password
        const passwordInputs = await page.$$('input[type="password"]');
        if (passwordInputs.length > 0) {
          console.log(`Found ${passwordInputs.length} password inputs`);
          await passwordInputs[0].click();
          await page.keyboard.type(password);
        }
        
        // Wait after typing to ensure values are registered
        await sleep(1000);
        await page.screenshot({ path: 'after-manual-input.png' });
        
        // Try all buttons in sequence until one causes navigation
        const buttons = await page.$$('button');
        console.log(`Found ${buttons.length} buttons to try`);
        
        for (let i = 0; i < buttons.length; i++) {
          console.log(`Trying button ${i+1} of ${buttons.length}`);
          
          // Click the button
          try {
            await buttons[i].click();
            await sleep(2000);
            
            // Check if we navigated away from login
            const currentUrl = await page.url();
            if (!currentUrl.includes('login')) {
              console.log(`Button ${i+1} successfully logged in!`);
              break;
            }
          } catch (e) {
            console.log(`Error clicking button ${i+1}:`, e.message);
          }
        }
      }
    }
    
    // Final check if login was successful
    const finalUrl = await page.url();
    console.log(`Final URL: ${finalUrl}`);
    
    if (finalUrl.includes('login')) {
      await page.screenshot({ path: 'login-failed.png' });
      console.log('Login failed. Check credentials and screenshots.');
    } else {
      await page.screenshot({ path: 'login-success.png' });
      console.log('Successfully logged in to Pipedream!');
    }
    
    // Keep browser open for a bit
    console.log('Keeping browser open for 30 seconds...');
    await sleep(30000);
    
  } catch (error) {
    console.error('Error during login:', error.message);
  } finally {
    await browser.close();
  }
}

module.exports = { login };