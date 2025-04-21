const puppeteer = require('puppeteer');

async function analyzeLoginPage() {
  console.log('Analyzing Pipedream login page structure...');
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });
  
  try {
    const page = await browser.newPage();
    
    // Go to login page
    await page.goto('https://pipedream.com/auth/login', { waitUntil: 'networkidle0' });
    
    // Take a screenshot of login page
    await page.screenshot({ path: 'login-page-analysis.png' });
    
    // Analyze the page structure
    const pageStructure = await page.evaluate(() => {
      // Helper function to get attributes of an element
      const getElementInfo = (el) => {
        const rect = el.getBoundingClientRect();
        return {
          tagName: el.tagName,
          id: el.id,
          className: el.className,
          type: el.type,
          placeholder: el.placeholder,
          value: el.value,
          name: el.name,
          isVisible: rect.width > 0 && rect.height > 0,
          position: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          },
          attributes: Array.from(el.attributes).map(attr => ({
            name: attr.name,
            value: attr.value
          }))
        };
      };
      
      // Get form elements
      const forms = Array.from(document.querySelectorAll('form')).map(form => ({
        action: form.action,
        method: form.method,
        id: form.id,
        className: form.className,
        elements: Array.from(form.elements).map(getElementInfo)
      }));
      
      // Get all input-like elements (input, textarea, etc.)
      const inputs = [
        ...Array.from(document.querySelectorAll('input')).map(getElementInfo),
        ...Array.from(document.querySelectorAll('textarea')).map(getElementInfo)
      ];
      
      // Get button elements
      const buttons = Array.from(document.querySelectorAll('button')).map(button => ({
        ...getElementInfo(button),
        text: button.textContent.trim()
      }));
      
      // Find parent divs that look like form fields
      const formFieldDivs = Array.from(document.querySelectorAll('div')).filter(div => {
        // Check if div contains input or textarea
        return (
          div.querySelector('input') ||
          div.querySelector('textarea')
        );
      }).map(div => ({
        className: div.className,
        id: div.id,
        children: Array.from(div.children).map(child => ({
          tagName: child.tagName,
          className: child.className,
          id: child.id,
          type: child.type
        })),
        inputCount: div.querySelectorAll('input').length,
        textareaCount: div.querySelectorAll('textarea').length
      }));
      
      return {
        title: document.title,
        url: window.location.href,
        forms,
        inputs,
        buttons,
        formFieldDivs
      };
    });
    
    console.log('Page Analysis:');
    console.log(JSON.stringify(pageStructure, null, 2));
    
    // Wait a bit for manual inspection
    await new Promise(resolve => setTimeout(resolve, 10000));
    
  } finally {
    await browser.close();
  }
}

module.exports = { analyzeLoginPage };