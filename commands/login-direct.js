const puppeteer = require('puppeteer');
require('dotenv').config();

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loginDirect(options) {
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
    
    // Enable request interception to analyze network traffic
    await page.setRequestInterception(true);
    
    let hasEmailField = false;
    let emailFieldName = null;
    
    // Listen to requests to understand form structure
    page.on('request', request => {
      // Look for form post requests
      if (request.method() === 'POST' && request.postData()) {
        console.log('Form data:', request.postData());
        
        // Try to extract field names from form data
        try {
          const formData = request.postData();
          if (formData.includes('email=') || formData.includes('username=')) {
            console.log('Found email field in form data!');
            
            if (formData.includes('email=')) emailFieldName = 'email';
            else if (formData.includes('username=')) emailFieldName = 'username';
          }
        } catch (e) {
          console.log('Could not parse form data');
        }
      }
      request.continue();
    });
    
    // Navigate to login page
    console.log('Navigating to login page...');
    await page.goto('https://pipedream.com/auth/login', { waitUntil: 'networkidle0', timeout: 60000 });
    
    // Take a full-page screenshot
    await page.screenshot({ path: 'login-page-full.png', fullPage: true });
    
    // Analyze the HTML structure to find hidden fields, forms, and potential email inputs
    const pageAnalysis = await page.evaluate(() => {
      // Find all forms
      const forms = Array.from(document.querySelectorAll('form'));
      
      // Find all inputs including hidden ones
      const allInputs = Array.from(document.querySelectorAll('input'));
      
      // Find anything with an "email" attribute or property
      const emailElements = Array.from(document.querySelectorAll('[name*="email"], [id*="email"], [placeholder*="email"], [type="email"]'));
      
      // Get DOM path for each element
      const getDomPath = (el) => {
        const stack = [];
        while (el.parentNode != null) {
          let sibCount = 0;
          let sibIndex = 0;
          for (let i = 0; i < el.parentNode.childNodes.length; i++) {
            const sib = el.parentNode.childNodes[i];
            if (sib.nodeName === el.nodeName) {
              if (sib === el) {
                sibIndex = sibCount;
              }
              sibCount++;
            }
          }
          
          const nodeName = el.nodeName.toLowerCase();
          const idattr = el.hasAttribute('id') ? `#${el.id}` : '';
          const classattr = el.hasAttribute('class') ? `.${el.className.replace(/\s+/g, '.')}` : '';
          const nameattr = el.hasAttribute('name') ? `[name="${el.getAttribute('name')}"]` : '';
          
          if (sibCount > 1) {
            stack.unshift(`${nodeName}${idattr}${classattr}${nameattr}:nth-child(${sibIndex + 1})`);
          } else {
            stack.unshift(`${nodeName}${idattr}${classattr}${nameattr}`);
          }
          
          el = el.parentNode;
          if (el.nodeName.toLowerCase() === 'body') break;
        }
        
        return stack.join(' > ');
      };
      
      return {
        forms: forms.map(form => ({
          id: form.id,
          action: form.action,
          method: form.method,
          elements: Array.from(form.elements).map(el => ({
            tagName: el.tagName,
            type: el.type,
            id: el.id,
            name: el.name,
            class: el.className,
            placeholder: el.placeholder
          }))
        })),
        allInputs: allInputs.map(input => ({
          id: input.id,
          name: input.name,
          type: input.type,
          value: input.value,
          placeholder: input.placeholder,
          isVisible: input.offsetParent !== null,
          domPath: getDomPath(input)
        })),
        emailElements: emailElements.map(el => ({
          tagName: el.tagName,
          id: el.id,
          name: el.name,
          type: el.type,
          placeholder: el.placeholder,
          domPath: getDomPath(el)
        }))
      };
    });
    
    console.log('Page analysis:', JSON.stringify(pageAnalysis, null, 2));
    
    // Try direct navigation to sign-in page
    console.log('Trying direct navigation to signin page...');
    await page.goto('https://pipedream.com/auth/signin', { waitUntil: 'networkidle0', timeout: 60000 });
    
    // Take a screenshot
    await page.screenshot({ path: 'signin-page.png', fullPage: true });
    
    // Check if this page has an email field
    const signinPageAnalysis = await page.evaluate(() => {
      const allInputs = Array.from(document.querySelectorAll('input'));
      return {
        allInputs: allInputs.map(input => ({
          id: input.id,
          name: input.name,
          type: input.type,
          value: input.value,
          placeholder: input.placeholder,
          isVisible: input.offsetParent !== null
        }))
      };
    });
    
    console.log('Signin page analysis:', JSON.stringify(signinPageAnalysis, null, 2));
    
    // Try to locate the email input and password input
    let emailInput = null;
    let passwordInput = null;
    
    // First check if any input has a standard email type or name
    const result = await page.evaluate((username, password) => {
      // Try to find email field
      let emailInput = null;
      let passwordInput = null;
      
      // Common selectors for email/username fields
      const emailSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[id="email"]',
        'input[name="username"]',
        'input[id="username"]',
        'input[placeholder*="email" i]',
        'input[placeholder*="username" i]',
        'input:not([type="password"])'
      ];
      
      // Try each selector for email
      for (const selector of emailSelectors) {
        const inputs = document.querySelectorAll(selector);
        if (inputs.length > 0) {
          emailInput = inputs[0];
          
          // Set the value
          emailInput.value = username;
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));
          emailInput.dispatchEvent(new Event('change', { bubbles: true }));
          
          console.log(`Found and filled email using selector: ${selector}`);
          break;
        }
      }
      
      // Find password field
      const passwordField = document.querySelector('input[type="password"]');
      if (passwordField) {
        passwordField.value = password;
        passwordField.dispatchEvent(new Event('input', { bubbles: true }));
        passwordField.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('Found and filled password field');
        passwordInput = true;
      }
      
      // Find any submit button
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Sign In")',
        'button:has-text("Log In")',
        'button:has-text("Continue")'
      ];
      
      let submitButton = null;
      for (const selector of submitSelectors) {
        try {
          const buttons = document.querySelectorAll(selector);
          if (buttons.length > 0) {
            submitButton = buttons[0];
            console.log(`Found submit button with selector: ${selector}`);
            submitButton.click();
            return { 
              clicked: true, 
              emailFound: !!emailInput, 
              passwordFound: !!passwordInput 
            };
          }
        } catch (e) {
          console.log(`Error with selector ${selector}: ${e.message}`);
        }
      }
      
      // If we have form items but no working button, try submitting the form
      if (emailInput || passwordInput) {
        const form = document.querySelector('form');
        if (form) {
          console.log('Submitting form directly');
          form.submit();
          return { 
            submitted: true, 
            emailFound: !!emailInput, 
            passwordFound: !!passwordInput 
          };
        }
      }
      
      return { 
        emailFound: !!emailInput, 
        passwordFound: !!passwordInput
      };
    }, username, password);
    
    console.log('Form filling result:', result);
    
    // Wait to see if we navigate
    console.log('Waiting for navigation after form submission...');
    await page.waitForNavigation({ timeout: 10000 }).catch(() => {
      console.log('Navigation timeout - continuing anyway');
    });
    
    // Check if we're still on login page
    const currentUrl = await page.url();
    console.log(`Current URL: ${currentUrl}`);
    
    // Try special direct login approach for Auth0
    if (currentUrl.includes('login')) {
      console.log('Trying Auth0-specific approach...');
      
      // This approach is specific to Auth0 login forms which might be used by Pipedream
      await page.evaluate((username, password) => {
        // Auth0 specific selectors
        const usernameInput = document.querySelector('#username');
        const passwordInput = document.querySelector('#password');
        const submitButton = document.querySelector('button[type="submit"]');
        
        if (usernameInput) {
          usernameInput.value = username;
          usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
          usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
          console.log('Filled username using Auth0 selector');
        }
        
        if (passwordInput) {
          passwordInput.value = password;
          passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
          passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
          console.log('Filled password using Auth0 selector');
        }
        
        if (submitButton) {
          console.log('Clicking Auth0 submit button');
          submitButton.click();
        }
      }, username, password);
      
      // Wait again for navigation
      await page.waitForNavigation({ timeout: 10000 }).catch(() => {
        console.log('Navigation timeout after Auth0 approach');
      });
    }
    
    // Final URL check
    const finalUrl = await page.url();
    console.log(`Final URL: ${finalUrl}`);
    
    // Take a final screenshot
    await page.screenshot({ path: 'login-final-state.png', fullPage: true });
    
    if (finalUrl.includes('login') || finalUrl.includes('signin')) {
      console.log('Login appears to have failed');
    } else {
      console.log('Login appears successful!');
    }
    
    // Keep browser open for manual inspection
    console.log('Keeping browser open for 1 minute for manual inspection...');
    await sleep(60000);
    
  } catch (error) {
    console.error('Error during login:', error);
  } finally {
    await browser.close();
  }
}

module.exports = { loginDirect };