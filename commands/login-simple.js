const puppeteer = require('puppeteer');
require('dotenv').config();

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loginSimple(options) {
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
    
    // Take screenshot to see the initial state
    await page.screenshot({ path: 'login-initial.png' });
    console.log('Saved screenshot of initial login page');
    
    // Directly modify the DOM to reveal any hidden email field
    await page.evaluate(() => {
      // Find all inputs on the page
      const allInputs = document.querySelectorAll('input');
      
      // Make any hidden inputs visible
      allInputs.forEach(input => {
        if (input.style.display === 'none' || input.type === 'hidden') {
          input.style.display = 'block';
          input.type = 'text';
        }
      });
      
      // If no email field, try to create one
      if (!document.querySelector('input[type="email"]')) {
        const passwordInput = document.querySelector('input[type="password"]');
        if (passwordInput && passwordInput.parentNode) {
          const emailInput = document.createElement('input');
          emailInput.type = 'email';
          emailInput.id = 'email-field';
          emailInput.placeholder = 'Email';
          emailInput.style.marginBottom = '10px';
          emailInput.style.padding = '8px';
          emailInput.style.width = '100%';
          passwordInput.parentNode.insertBefore(emailInput, passwordInput);
        }
      }
    });
    
    // Take screenshot after modification
    await page.screenshot({ path: 'login-after-reveal.png' });
    console.log('Saved screenshot after revealing/adding fields');
    
    // Attempt to click and type directly into the email field we created
    try {
      await page.click('#email-field');
      await page.keyboard.type(username);
      console.log('Entered username using our custom field');
    } catch (e) {
      console.log('Could not use our custom field, trying alternative approach');
    }
    
    // If that didn't work, use a more aggressive approach
    await page.evaluate((email) => {
      // Force the creation of an email input
      const form = document.querySelector('form');
      if (form) {
        // Remove all existing inputs
        const existingInputs = form.querySelectorAll('input');
        existingInputs.forEach(input => {
          if (input.type !== 'password') {
            input.remove();
          }
        });
        
        // Create new email input
        const emailInput = document.createElement('input');
        emailInput.type = 'email';
        emailInput.id = 'email-input-forced';
        emailInput.value = email;
        emailInput.placeholder = 'Email';
        emailInput.style.display = 'block';
        emailInput.style.marginBottom = '10px';
        emailInput.style.padding = '8px';
        emailInput.style.width = '100%';
        
        // Add it to the form at the beginning
        if (form.firstChild) {
          form.insertBefore(emailInput, form.firstChild);
        } else {
          form.appendChild(emailInput);
        }
        
        // Trigger events
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        emailInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, username);
    
    // Take screenshot to verify
    await page.screenshot({ path: 'login-after-forced-email.png' });
    console.log('Saved screenshot after forcing email field');
    
    // Enter password
    const passwordField = await page.$('input[type="password"]');
    if (passwordField) {
      await passwordField.click();
      await passwordField.type(password);
      console.log('Entered password');
    }
    
    // Find and click submit button
    const submitButton = await page.$('button[type="submit"]');
    if (submitButton) {
      console.log('Found submit button, clicking it');
      await submitButton.click();
    } else {
      console.log('No submit button found, pressing Enter');
      await page.keyboard.press('Enter');
    }
    
    // Wait for navigation
    await page.waitForNavigation({ timeout: 10000 }).catch(() => {
      console.log('Navigation timeout after submission');
    });
    
    // Final status
    const finalUrl = await page.url();
    await page.screenshot({ path: 'login-final.png' });
    
    if (finalUrl.includes('login')) {
      console.log('Login failed. Final URL:', finalUrl);
    } else {
      console.log('Login successful! Final URL:', finalUrl);
    }
    
    // Keep browser open
    console.log('Keeping browser open for 30 seconds...');
    await sleep(30000);
    
  } catch (error) {
    console.error('Error during login:', error.message);
  } finally {
    await browser.close();
  }
}

module.exports = { loginSimple };