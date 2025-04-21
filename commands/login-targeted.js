const puppeteer = require('puppeteer');
require('dotenv').config();

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loginTargeted(options) {
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
    
    // Navigate to login page
    console.log('Navigating to login page...');
    await page.goto('https://pipedream.com/auth/login', { waitUntil: 'networkidle0' });
    
    // Take a screenshot
    await page.screenshot({ path: 'login-initial.png' });
    console.log('Saved initial screenshot');
    
    // Based on the analysis, let's focus on the label "Email" and try to interact with the form
    const emailLabelExists = await page.evaluate(() => {
      const emailLabels = Array.from(document.querySelectorAll('label')).filter(label => 
        label.textContent.toLowerCase().trim() === 'email'
      );
      return emailLabels.length > 0;
    });
    
    console.log(`Email label found: ${emailLabelExists}`);
    
    if (emailLabelExists) {
      // Try to click on the email label to activate any associated field
      console.log('Clicking on the Email label to activate the field...');
      await page.evaluate(() => {
        const emailLabels = Array.from(document.querySelectorAll('label')).filter(label => 
          label.textContent.toLowerCase().trim() === 'email'
        );
        if (emailLabels.length > 0) {
          emailLabels[0].click();
        }
      });
      
      // Wait a moment for any dynamic content to load
      await sleep(1000);
      
      // Take another screenshot to see what changed
      await page.screenshot({ path: 'after-label-click.png' });
      console.log('Saved screenshot after clicking email label');
      
      // Check for input elements again
      const inputsAfterClick = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input')).map(input => ({
          type: input.type,
          id: input.id,
          placeholder: input.placeholder,
          visible: input.offsetParent !== null
        }));
      });
      
      console.log('Inputs after clicking label:', JSON.stringify(inputsAfterClick, null, 2));
      
      // Check specifically for any input in the area where the email label is
      console.log('Looking for input near the email label...');
      const nearbyInput = await page.evaluate(() => {
        // Find the email label
        const emailLabel = Array.from(document.querySelectorAll('label')).find(label => 
          label.textContent.toLowerCase().trim() === 'email'
        );
        
        if (!emailLabel) return null;
        
        // Look at the parent element and find any input
        let parent = emailLabel.parentElement;
        for (let i = 0; i < 5; i++) { // Go up to 5 levels up
          if (!parent) break;
          
          // Look for inputs in this parent
          const inputs = parent.querySelectorAll('input');
          if (inputs.length > 0) {
            return Array.from(inputs).map(input => ({
              type: input.type,
              id: input.id,
              placeholder: input.placeholder
            }));
          }
          
          parent = parent.parentElement;
        }
        
        return null;
      });
      
      console.log('Inputs near email label:', JSON.stringify(nearbyInput, null, 2));
      
      // Try clicking in the area where the email field should be
      console.log('Clicking in the area where the email field should be...');
      await page.evaluate(() => {
        const emailLabel = Array.from(document.querySelectorAll('label')).find(label => 
          label.textContent.toLowerCase().trim() === 'email'
        );
        
        if (emailLabel) {
          // Get the bounding rect of the label
          const rect = emailLabel.getBoundingClientRect();
          
          // Create a click at a position below the label where the input field likely is
          const clickX = rect.left + rect.width / 2;
          const clickY = rect.bottom + 25; // 25px below the label
          
          // Create and dispatch a mouse event
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: clickX,
            clientY: clickY
          });
          
          document.elementFromPoint(clickX, clickY)?.dispatchEvent(clickEvent);
        }
      });
      
      // Wait a moment
      await sleep(1000);
      
      // Take another screenshot
      await page.screenshot({ path: 'after-area-click.png' });
      console.log('Saved screenshot after clicking in email area');
      
      // Try to type directly at that position
      console.log('Typing email at the cursor position...');
      await page.keyboard.type(username);
      
      // Take screenshot after typing
      await page.screenshot({ path: 'after-email-type.png' });
      console.log('Saved screenshot after typing email');
      
      // Press Tab to move to password field
      await page.keyboard.press('Tab');
      await sleep(500);
      
      // Type password
      console.log('Typing password...');
      await page.keyboard.type(password);
      
      // Take screenshot after typing password
      await page.screenshot({ path: 'after-password-type.png' });
      console.log('Saved screenshot after typing password');
      
      // Press Tab and Enter to submit form
      await page.keyboard.press('Tab');
      await sleep(500);
      await page.keyboard.press('Enter');
      
      console.log('Submitted form using keyboard');
      
      // Wait for navigation
      await page.waitForNavigation({ timeout: 10000 }).catch(() => {
        console.log('Navigation timeout - continuing anyway');
      });
    } else {
      console.log('Could not find an email label. Trying alternative approach...');
      
      // Try clicking where the email field should be based on page structure
      await page.evaluate(() => {
        // Look for the form container
        const form = document.querySelector('form');
        if (form) {
          // Click in the top part of the form where email field usually is
          const rect = form.getBoundingClientRect();
          const clickX = rect.left + rect.width / 2;
          const clickY = rect.top + 100; // 100px from the top of the form
          
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: clickX,
            clientY: clickY
          });
          
          document.elementFromPoint(clickX, clickY)?.dispatchEvent(clickEvent);
        }
      });
      
      // Wait a moment
      await sleep(1000);
      
      // Type email
      await page.keyboard.type(username);
      
      // Take screenshot
      await page.screenshot({ path: 'alternative-email-type.png' });
      
      // Press Tab to move to password field
      await page.keyboard.press('Tab');
      await sleep(500);
      
      // Type password
      await page.keyboard.type(password);
      
      // Take screenshot
      await page.screenshot({ path: 'alternative-password-type.png' });
      
      // Press Tab and Enter to submit
      await page.keyboard.press('Tab');
      await sleep(500);
      await page.keyboard.press('Enter');
      
      // Wait for navigation
      await page.waitForNavigation({ timeout: 10000 }).catch(() => {
        console.log('Navigation timeout - continuing anyway');
      });
    }
    
    // Check if login was successful
    const finalUrl = await page.url();
    console.log(`Final URL: ${finalUrl}`);
    
    if (finalUrl.includes('login')) {
      console.log('Login appears to have failed. Taking final screenshot...');
      await page.screenshot({ path: 'login-failed.png' });
    } else {
      console.log('Login appears successful! Taking final screenshot...');
      await page.screenshot({ path: 'login-success.png' });
    }
    
    // Keep browser open for inspection
    console.log('Keeping browser open for 30 seconds for inspection...');
    await sleep(30000);
    
  } catch (error) {
    console.error('Error during login:', error);
  } finally {
    await browser.close();
  }
}

module.exports = { loginTargeted };