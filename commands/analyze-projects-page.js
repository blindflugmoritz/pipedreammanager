const puppeteer = require('puppeteer');
require('dotenv').config();

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function analyzeProjectsPage() {
  const username = process.env.PIPEDREAM_USERNAME;
  const password = process.env.PIPEDREAM_PASSWORD;

  if (!username || !password) {
    console.error('Username and password are required in .env file');
    process.exit(1);
  }

  console.log('Launching browser to analyze Pipedream projects page...');
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });
  
  try {
    const page = await browser.newPage();
    
    // First login
    console.log('Logging in to Pipedream...');
    await page.goto('https://pipedream.com/auth/login', { waitUntil: 'networkidle0' });
    
    // Click on the Email label to activate the field
    await page.evaluate(() => {
      const emailLabels = Array.from(document.querySelectorAll('label')).filter(label => 
        label.textContent.toLowerCase().trim() === 'email'
      );
      if (emailLabels.length > 0) {
        emailLabels[0].click();
      }
    });
    
    await sleep(1000);
    
    // Click in the area where the email field should be
    await page.evaluate(() => {
      const emailLabel = Array.from(document.querySelectorAll('label')).find(label => 
        label.textContent.toLowerCase().trim() === 'email'
      );
      
      if (emailLabel) {
        const rect = emailLabel.getBoundingClientRect();
        const clickX = rect.left + rect.width / 2;
        const clickY = rect.bottom + 25;
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
    
    await sleep(1000);
    
    // Type email and password
    await page.keyboard.type(username);
    await page.keyboard.press('Tab');
    await sleep(500);
    await page.keyboard.type(password);
    await page.keyboard.press('Tab');
    await sleep(500);
    await page.keyboard.press('Enter');
    
    // Wait for navigation
    console.log('Waiting for login to complete...');
    try {
      await page.waitForNavigation({ timeout: 30000 });
    } catch (e) {
      console.log('Navigation timeout - continuing anyway');
    }
    
    // Verify login success
    const currentUrl = await page.url();
    console.log(`Current URL after login: ${currentUrl}`);
    
    // Take screenshot after login attempt
    await page.screenshot({ path: 'after-login.png' });
    
    // Wait longer to ensure page is fully loaded
    await sleep(5000);
    
    // Check URL again
    const urlAfterWait = await page.url();
    console.log(`URL after waiting: ${urlAfterWait}`);
    
    if (urlAfterWait.includes('login')) {
      console.log('Still on login page. Login may have failed. Will try to continue anyway...');
    } else {
      console.log('Successfully navigated away from login page.');
    }
    
    console.log('Successfully logged in, navigating to projects page...');
    
    // Navigate to projects page
    await page.goto('https://pipedream.com/@momoetomo/projects', { waitUntil: 'networkidle0' });
    await sleep(3000); // Wait for any dynamic content to load
    
    // Take a screenshot
    await page.screenshot({ path: 'projects-page-analysis.png', fullPage: true });
    console.log('Saved screenshot to projects-page-analysis.png');
    
    // Search specifically for the New project button based on provided HTML
    const newProjectButtonInfo = await page.evaluate(() => {
      // Helper function to get element path for debugging
      const getElementPath = (element) => {
        const path = [];
        while (element) {
          let selector = element.tagName.toLowerCase();
          if (element.id) {
            selector += `#${element.id}`;
          } else if (element.className) {
            selector += `.${element.className.replace(/\s+/g, '.')}`;
          }
          path.unshift(selector);
          element = element.parentElement;
          if (element === document.body) {
            path.unshift('body');
            break;
          }
        }
        return path.join(' > ');
      };
      
      // Helper to get all attributes of an element
      const getAttributes = (element) => {
        const attributes = {};
        for (const attr of element.attributes) {
          attributes[attr.name] = attr.value;
        }
        return attributes;
      };
      
      // Look for elements with "New project" text
      const newProjectElements = Array.from(document.querySelectorAll('*')).filter(el => 
        el.textContent.trim() === 'New project'
      );
      
      const newProjectElementsInfo = newProjectElements.map(el => ({
        tag: el.tagName.toLowerCase(),
        text: el.textContent.trim(),
        path: getElementPath(el),
        attributes: getAttributes(el),
        parentTag: el.parentElement?.tagName.toLowerCase(),
        parentAttributes: getAttributes(el.parentElement),
        grandparentTag: el.parentElement?.parentElement?.tagName.toLowerCase(),
        grandparentAttributes: getAttributes(el.parentElement?.parentElement),
        rect: el.getBoundingClientRect().toJSON(),
        isVisible: el.offsetParent !== null
      }));
      
      // Look for elements containing the specific structure you mentioned
      const divWithPlusIconAndNewProject = document.querySelector('div.h-full.flex.items-center.justify-center.gap-x-1\\.5');
      let divInfo = null;
      
      if (divWithPlusIconAndNewProject) {
        const parentButton = findParentButton(divWithPlusIconAndNewProject);
        
        divInfo = {
          found: true,
          path: getElementPath(divWithPlusIconAndNewProject),
          parentButtonPath: parentButton ? getElementPath(parentButton) : 'No parent button found',
          parentButtonAttributes: parentButton ? getAttributes(parentButton) : {},
          children: Array.from(divWithPlusIconAndNewProject.children).map(child => ({
            tag: child.tagName.toLowerCase(),
            class: child.className,
            text: child.textContent.trim()
          }))
        };
      }
      
      // Helper to find parent button
      function findParentButton(element) {
        let current = element;
        while (current && current !== document.body) {
          if (current.tagName.toLowerCase() === 'button') {
            return current;
          }
          current = current.parentElement;
        }
        return null;
      }
      
      // Get all buttons on the page
      const allButtons = Array.from(document.querySelectorAll('button'));
      const buttonInfo = allButtons.map(button => ({
        text: button.textContent.trim(),
        path: getElementPath(button),
        attributes: getAttributes(button),
        hasNewProjectText: button.textContent.includes('New project'),
        hasPlusIcon: !!button.querySelector('.i-mdi-plus-thick'),
        isVisible: button.offsetParent !== null,
        rect: button.getBoundingClientRect().toJSON()
      }));
      
      // Get all elements with plus icon
      const elementsWithPlusIcon = Array.from(document.querySelectorAll('.i-mdi-plus-thick'));
      const plusIconsInfo = elementsWithPlusIcon.map(el => ({
        tag: el.tagName.toLowerCase(),
        path: getElementPath(el),
        parentTag: el.parentElement?.tagName.toLowerCase(),
        parentText: el.parentElement?.textContent.trim(),
        parentPath: el.parentElement ? getElementPath(el.parentElement) : '',
        isVisible: el.offsetParent !== null
      }));
      
      return {
        newProjectElements: newProjectElementsInfo,
        divWithPlusIcon: divInfo,
        allButtons: buttonInfo,
        elementsWithPlusIcon: plusIconsInfo
      };
    });
    
    console.log('\n=== PROJECTS PAGE ANALYSIS ===\n');
    
    // Log results of New Project button search
    console.log('\n=== "NEW PROJECT" ELEMENTS ===');
    if (newProjectButtonInfo.newProjectElements.length === 0) {
      console.log('No elements with exact "New project" text found.');
    } else {
      newProjectButtonInfo.newProjectElements.forEach((el, i) => {
        console.log(`\nElement ${i+1} with "New project" text:`);
        console.log(`  Tag: ${el.tag}`);
        console.log(`  Path: ${el.path}`);
        console.log(`  Parent: ${el.parentTag}`);
        console.log(`  Grandparent: ${el.grandparentTag}`);
        console.log(`  Visible: ${el.isVisible}`);
        console.log(`  Attributes:`, JSON.stringify(el.attributes, null, 2));
      });
    }
    
    console.log('\n=== DIV WITH PLUS ICON AND "NEW PROJECT" ===');
    if (newProjectButtonInfo.divWithPlusIcon) {
      console.log(`  Found: ${newProjectButtonInfo.divWithPlusIcon.found}`);
      console.log(`  Path: ${newProjectButtonInfo.divWithPlusIcon.path}`);
      console.log(`  Parent Button Path: ${newProjectButtonInfo.divWithPlusIcon.parentButtonPath}`);
      console.log(`  Parent Button Attributes:`, JSON.stringify(newProjectButtonInfo.divWithPlusIcon.parentButtonAttributes, null, 2));
      console.log(`  Children:`, JSON.stringify(newProjectButtonInfo.divWithPlusIcon.children, null, 2));
    } else {
      console.log('Div with plus icon and "New project" not found.');
    }
    
    console.log('\n=== BUTTONS WITH "NEW PROJECT" TEXT OR PLUS ICON ===');
    const relevantButtons = newProjectButtonInfo.allButtons.filter(btn => 
      btn.hasNewProjectText || btn.hasPlusIcon
    );
    
    if (relevantButtons.length === 0) {
      console.log('No buttons with "New project" text or plus icon found.');
    } else {
      relevantButtons.forEach((btn, i) => {
        console.log(`\nRelevant Button ${i+1}:`);
        console.log(`  Text: "${btn.text}"`);
        console.log(`  Path: ${btn.path}`);
        console.log(`  Has "New project" text: ${btn.hasNewProjectText}`);
        console.log(`  Has plus icon: ${btn.hasPlusIcon}`);
        console.log(`  Visible: ${btn.isVisible}`);
        console.log(`  Attributes:`, JSON.stringify(btn.attributes, null, 2));
      });
    }
    
    console.log('\n=== ELEMENTS WITH PLUS ICON ===');
    if (newProjectButtonInfo.elementsWithPlusIcon.length === 0) {
      console.log('No elements with plus icon found.');
    } else {
      newProjectButtonInfo.elementsWithPlusIcon.forEach((el, i) => {
        console.log(`\nPlus Icon Element ${i+1}:`);
        console.log(`  Tag: ${el.tag}`);
        console.log(`  Path: ${el.path}`);
        console.log(`  Parent: ${el.parentTag}`);
        console.log(`  Parent Text: "${el.parentText}"`);
        console.log(`  Visible: ${el.isVisible}`);
      });
    }
    
    console.log('\n=== ALL BUTTONS ===');
    console.log(`Total buttons on page: ${newProjectButtonInfo.allButtons.length}`);
    console.log('Button text samples:');
    newProjectButtonInfo.allButtons.slice(0, 10).forEach((btn, i) => {
      console.log(`  Button ${i+1}: "${btn.text}"`);
    });
    
    // Take a screenshot with highlight
    await page.evaluate(() => {
      // Try to highlight the New project button and plus icon for visual debugging
      const highlight = (selector, color) => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          el.style.border = `3px solid ${color}`;
          el.style.backgroundColor = `${color}44`; // With alpha
        });
      };
      
      // Highlight potential elements
      highlight('span.whitespace-nowrap:contains("New project")', 'red');
      highlight('.i-mdi-plus-thick', 'blue');
      highlight('div.h-full.flex.items-center.justify-center', 'green');
      
      // Try to find buttons containing New project text
      document.querySelectorAll('button').forEach(btn => {
        if (btn.textContent.includes('New project')) {
          btn.style.border = '5px solid purple';
        }
      });
    });
    
    await page.screenshot({ path: 'projects-page-highlighted.png', fullPage: true });
    console.log('\nSaved highlighted screenshot to projects-page-highlighted.png');
    
    console.log('\n=== ANALYSIS COMPLETE ===');
    
    // Click specifically where the New project button should be
    console.log('\nTrying to click where the New project button should be...');
    
    // Try to click based on the analysis
    const clickResult = await page.evaluate(() => {
      // Strategy 1: Try to find the specific div structure
      const divWithNewProject = document.querySelector('div.h-full.flex.items-center.justify-center.gap-x-1\\.5');
      if (divWithNewProject) {
        // Find the parent button
        let current = divWithNewProject;
        while (current && current.tagName.toLowerCase() !== 'button' && current !== document.body) {
          current = current.parentElement;
        }
        
        if (current && current.tagName.toLowerCase() === 'button') {
          current.click();
          return {
            clicked: true,
            method: 'Found parent button of the div with New project text',
            element: current.tagName + (current.className ? '.' + current.className.replace(/\s+/g, '.') : '')
          };
        }
        
        // If no parent button, try clicking the div itself
        divWithNewProject.click();
        return {
          clicked: true,
          method: 'Clicked directly on the div with New project text',
          element: 'div.' + divWithNewProject.className.replace(/\s+/g, '.')
        };
      }
      
      // Strategy 2: Find by text content
      const elementsWithNewProjectText = Array.from(document.querySelectorAll('*')).filter(el => 
        el.textContent.trim() === 'New project'
      );
      
      if (elementsWithNewProjectText.length > 0) {
        // Click the first one
        const element = elementsWithNewProjectText[0];
        
        // Find closest clickable parent
        let clickableParent = element;
        while (clickableParent && clickableParent !== document.body) {
          if (clickableParent.tagName.toLowerCase() === 'button' || 
              clickableParent.tagName.toLowerCase() === 'a' ||
              clickableParent.onclick) {
            break;
          }
          clickableParent = clickableParent.parentElement;
        }
        
        if (clickableParent && clickableParent !== document.body) {
          clickableParent.click();
          return {
            clicked: true,
            method: 'Found and clicked parent of element with New project text',
            element: clickableParent.tagName
          };
        }
        
        // If no clickable parent found, click directly
        element.click();
        return {
          clicked: true,
          method: 'Clicked directly on element with New project text',
          element: element.tagName
        };
      }
      
      // Strategy 3: Look for plus icon
      const plusIcons = document.querySelectorAll('.i-mdi-plus-thick');
      if (plusIcons.length > 0) {
        // Find the one that's part of a button
        for (const icon of plusIcons) {
          let current = icon;
          while (current && current.tagName.toLowerCase() !== 'button' && current !== document.body) {
            current = current.parentElement;
          }
          
          if (current && current.tagName.toLowerCase() === 'button') {
            current.click();
            return {
              clicked: true,
              method: 'Found and clicked button containing plus icon',
              element: current.tagName
            };
          }
        }
        
        // If no button found, click the first icon
        const firstIcon = plusIcons[0];
        firstIcon.click();
        return {
          clicked: true,
          method: 'Clicked directly on plus icon',
          element: firstIcon.tagName
        };
      }
      
      return {
        clicked: false,
        method: 'Could not find any element to click'
      };
    });
    
    console.log('Click result:', clickResult);
    
    // Wait to see if a modal appears
    await sleep(2000);
    await page.screenshot({ path: 'after-new-project-click.png' });
    console.log('Saved screenshot after clicking New project button to after-new-project-click.png');
    
    console.log('\nKeeping browser open for 1 minute for manual inspection...');
    await sleep(60000);
    
  } catch (error) {
    console.error('Error during analysis:', error.message);
  } finally {
    await browser.close();
  }
}

module.exports = { analyzeProjectsPage };