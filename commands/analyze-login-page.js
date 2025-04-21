const puppeteer = require('puppeteer');

async function analyzeLoginPage() {
  console.log('Launching browser to analyze Pipedream login page...');
  
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
    await page.screenshot({ path: 'login-page-analysis.png', fullPage: true });
    console.log('Saved screenshot to login-page-analysis.png');
    
    // Analyze the DOM structure
    const analysis = await page.evaluate(() => {
      // Helper function to get a clean, simplified DOM path for an element
      const getCleanPath = (element) => {
        const path = [];
        while (element && element.nodeType === Node.ELEMENT_NODE) {
          let selector = element.nodeName.toLowerCase();
          if (element.id) {
            selector += `#${element.id}`;
          } else if (element.className && typeof element.className === 'string') {
            selector += `.${element.className.replace(/\s+/g, '.')}`;
          }
          path.unshift(selector);
          element = element.parentNode;
        }
        return path.join(' > ');
      };
      
      // Find all input fields
      const inputs = Array.from(document.querySelectorAll('input'));
      const inputDetails = inputs.map(input => ({
        type: input.type,
        id: input.id,
        name: input.name,
        placeholder: input.placeholder,
        value: input.value,
        isVisible: input.offsetParent !== null,
        domPath: getCleanPath(input),
        rect: input.getBoundingClientRect().toJSON()
      }));
      
      // Find all buttons
      const buttons = Array.from(document.querySelectorAll('button'));
      const buttonDetails = buttons.map(button => ({
        type: button.type,
        id: button.id,
        text: button.textContent.trim(),
        isVisible: button.offsetParent !== null,
        domPath: getCleanPath(button),
        rect: button.getBoundingClientRect().toJSON()
      }));
      
      // Find all forms
      const forms = Array.from(document.querySelectorAll('form'));
      const formDetails = forms.map(form => ({
        id: form.id,
        action: form.action,
        method: form.method,
        domPath: getCleanPath(form)
      }));
      
      // Extract text elements that might give clues (labels, etc.)
      const textElements = Array.from(document.querySelectorAll('label, p, h1, h2, h3, h4, h5, h6'));
      const textDetails = textElements.map(el => ({
        element: el.tagName.toLowerCase(),
        text: el.textContent.trim(),
        forId: el.htmlFor, // For label elements
        isVisible: el.offsetParent !== null,
        domPath: getCleanPath(el)
      })).filter(item => item.text !== ''); // Filter out empty text elements
      
      // Look for any email-related elements
      const emailRelated = Array.from(document.querySelectorAll('[id*="email" i], [name*="email" i], [placeholder*="email" i], [id*="username" i], [name*="username" i], [placeholder*="username" i]'));
      const emailRelatedDetails = emailRelated.map(el => ({
        element: el.tagName.toLowerCase(),
        type: el.type,
        id: el.id,
        name: el.name,
        placeholder: el.placeholder,
        isVisible: el.offsetParent !== null,
        domPath: getCleanPath(el)
      }));
      
      // Look for any specific classes or attributes that might be relevant
      const htmlContent = document.documentElement.outerHTML;
      const authProviders = htmlContent.includes('auth0') ? 'Auth0 detected' : 
                           htmlContent.includes('okta') ? 'Okta detected' : 
                           htmlContent.includes('firebase') ? 'Firebase detected' : 
                           'No common auth provider detected';
      
      return {
        title: document.title,
        url: window.location.href,
        inputs: inputDetails,
        buttons: buttonDetails,
        forms: formDetails,
        textElements: textDetails,
        emailRelated: emailRelatedDetails,
        authProviders: authProviders
      };
    });
    
    console.log('\n=== LOGIN PAGE ANALYSIS ===\n');
    console.log(`Page Title: ${analysis.title}`);
    console.log(`URL: ${analysis.url}`);
    console.log(`\nAuth Provider Detection: ${analysis.authProviders}`);
    
    console.log('\n=== FORMS ===');
    analysis.forms.forEach((form, i) => {
      console.log(`\nForm ${i+1}:`);
      console.log(`  ID: ${form.id || 'No ID'}`);
      console.log(`  Action: ${form.action}`);
      console.log(`  Method: ${form.method}`);
      console.log(`  DOM Path: ${form.domPath}`);
    });
    
    console.log('\n=== INPUT FIELDS ===');
    analysis.inputs.forEach((input, i) => {
      console.log(`\nInput ${i+1}:`);
      console.log(`  Type: ${input.type}`);
      console.log(`  ID: ${input.id || 'No ID'}`);
      console.log(`  Name: ${input.name || 'No Name'}`);
      console.log(`  Placeholder: ${input.placeholder || 'No Placeholder'}`);
      console.log(`  Visible: ${input.isVisible}`);
      console.log(`  DOM Path: ${input.domPath}`);
    });
    
    console.log('\n=== BUTTONS ===');
    analysis.buttons.forEach((button, i) => {
      console.log(`\nButton ${i+1}:`);
      console.log(`  Type: ${button.type || 'No Type'}`);
      console.log(`  ID: ${button.id || 'No ID'}`);
      console.log(`  Text: ${button.text || 'No Text'}`);
      console.log(`  Visible: ${button.isVisible}`);
      console.log(`  DOM Path: ${button.domPath}`);
    });
    
    console.log('\n=== EMAIL-RELATED ELEMENTS ===');
    if (analysis.emailRelated.length === 0) {
      console.log('No email-related elements found.');
    } else {
      analysis.emailRelated.forEach((el, i) => {
        console.log(`\nEmail Element ${i+1}:`);
        console.log(`  Element: ${el.element}`);
        console.log(`  Type: ${el.type || 'N/A'}`);
        console.log(`  ID: ${el.id || 'No ID'}`);
        console.log(`  Name: ${el.name || 'No Name'}`);
        console.log(`  Placeholder: ${el.placeholder || 'No Placeholder'}`);
        console.log(`  Visible: ${el.isVisible}`);
        console.log(`  DOM Path: ${el.domPath}`);
      });
    }
    
    console.log('\n=== RELEVANT TEXT ELEMENTS ===');
    const relevantText = analysis.textElements.filter(el => 
      el.text.toLowerCase().includes('email') || 
      el.text.toLowerCase().includes('username') || 
      el.text.toLowerCase().includes('log in') ||
      el.text.toLowerCase().includes('sign in')
    );
    
    if (relevantText.length === 0) {
      console.log('No relevant text elements found.');
    } else {
      relevantText.forEach((el, i) => {
        console.log(`\nText Element ${i+1}:`);
        console.log(`  Element: ${el.element}`);
        console.log(`  Text: ${el.text}`);
        console.log(`  For ID: ${el.forId || 'N/A'}`);
        console.log(`  Visible: ${el.isVisible}`);
        console.log(`  DOM Path: ${el.domPath}`);
      });
    }
    
    console.log('\n=== ANALYSIS COMPLETE ===');
    console.log('Check the screenshot for visual reference: login-page-analysis.png');
    
    // Keep browser open for manual inspection
    console.log('\nKeeping browser open for 2 minutes for manual inspection...');
    await new Promise(resolve => setTimeout(resolve, 120000));
    
  } catch (error) {
    console.error('Error during analysis:', error);
  } finally {
    await browser.close();
  }
}

module.exports = { analyzeLoginPage };