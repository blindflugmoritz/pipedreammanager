const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');
require('dotenv').config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function newProject() {
  try {
    // Gather project information
    const projectName = await question('Project name: ');
    const defaultPath = process.cwd();
    const projectPath = await question(`Project path (default: ${defaultPath}): `) || defaultPath;
    const username = await question('Pipedream username: ');
    const password = await question('Pipedream password: ');
    const apiKey = await question('Pipedream API key: ');
    
    // Create project directory if it doesn't exist
    const projectDir = path.join(projectPath, projectName);
    await fs.mkdir(projectDir, { recursive: true });
    
    // Create .env file
    const envContent = `PIPEDREAM_USERNAME=${username}
PIPEDREAM_PASSWORD=${password}
PIPEDREAM_API_KEY=${apiKey}
PROJECT_NAME=${projectName}
`;
    
    await fs.writeFile(path.join(projectDir, '.env'), envContent);
    console.log(`Created project directory at ${projectDir}`);
    
    // Launch browser and create project on Pipedream
    console.log('Launching browser to create project on Pipedream...');
    
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
      
      // Take a screenshot for debugging
      await page.screenshot({ path: path.join(projectDir, 'login-page.png') });
      
      // Fill email and password using the correct selectors based on our analysis
      console.log('Entering login credentials...');
      
      // Wait for the email field (textarea with placeholder)
      await page.waitForSelector('textarea[placeholder="name@company.com"]');
      
      // Fill email field
      await page.type('textarea[placeholder="name@company.com"]', username);
      await sleep(500);
      
      // Tab to password field
      await page.keyboard.press('Tab');
      await sleep(500);
      
      // Fill password field (input type=password)
      await page.keyboard.type(password);
      await sleep(500);
      
      // Wait a bit for everything to load
      await sleep(1000);
      
      // Take a screenshot for debugging
      await page.screenshot({ path: path.join(projectDir, 'before-signin.png') });
      
      // DIRECT APPROACH: Target the EXACT div with the sign-in text and class structure
      console.log('Attempting to find EXACT div with class="h-full flex items-center justify-center w-full gap-x-1.5" containing "Sign in"');
      
      // This uses the EXACT selector you provided
      const signInButtonClicked = await page.evaluate(() => {
        // Find the exact div specified
        const specificSignInDivs = document.querySelectorAll('div.h-full.flex.items-center.justify-center.w-full.gap-x-1\\.5');
        console.log(`Found ${specificSignInDivs.length} divs with that exact class`);
        
        // Find specifically the one with just "Sign in" text (not Google's sign in)
        for (const div of specificSignInDivs) {
          // Look specifically for a div that ONLY has "Sign in" text (and maybe comments)
          // This should filter out Google's sign in which has additional text
          const cleanText = div.textContent.replace(/<!---->/g, '').trim();
          console.log(`Div text: "${cleanText}"`);
          
          if (cleanText === 'Sign in') {
            console.log('FOUND EXACT MATCH for Sign in div!');
            
            // Get the parent with role="button"
            let parent = div.parentElement;
            while (parent && parent.getAttribute('role') !== 'button') {
              parent = parent.parentElement;
            }
            
            if (parent) {
              console.log('Found parent with role="button", clicking it');
              parent.click();
              return true;
            }
            
            // If no parent with role="button", click the div itself
            console.log('No parent with role="button", clicking div directly');
            div.click();
            return true;
          }
        }
        
        return false;
      });
      
      if (!signInButtonClicked) {
        console.log('Could not find exact match div, trying alternative approaches');
        
        // FALLBACK APPROACH: Click the Sign in button based on direct DOM traversal
        const fallbackClicked = await page.evaluate(() => {
          // Try to find Sign in text nodes to determine the exact nodes
          const textNodes = [];
          const walker = document.createTreeWalker(
            document.body, 
            NodeFilter.SHOW_TEXT,
            { acceptNode: node => node.textContent.trim() === 'Sign in' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT }
          );
          
          while (walker.nextNode()) {
            textNodes.push(walker.currentNode);
          }
          
          console.log(`Found ${textNodes.length} text nodes with exact 'Sign in' text`);
          
          // For each text node, find the closest button/clickable parent
          for (const node of textNodes) {
            let element = node.parentElement;
            
            // Skip if this is in the Google Sign in section
            if (element.closest('[data-provider="google"]')) {
              console.log('Skipping Google Sign in element');
              continue;
            }
            
            // Look for a clickable parent
            let current = element;
            let depth = 0;
            while (current && depth < 10) {
              if (
                current.getAttribute('role') === 'button' ||
                current.tagName === 'BUTTON' ||
                current.tagName === 'A' ||
                current.className.includes('button') ||
                current.className.includes('btn')
              ) {
                console.log('Found clickable parent, clicking');
                current.click();
                return true;
              }
              current = current.parentElement;
              depth++;
            }
            
            // If no clickable parent, try the element itself
            console.log('No clickable parent found, clicking element directly');
            element.click();
            return true;
          }
          
          return false;
        });
        
        if (!fallbackClicked) {
          console.log('All methods failed, trying keyboard Enter');
          await page.keyboard.press('Enter');
        }
      }
      
      // Wait for navigation after login
      console.log('Logging in...');
      try {
        await page.waitForNavigation({ timeout: 30000 });
      } catch (e) {
        console.log('Navigation timeout - continuing anyway');
      }
      
      // Take a screenshot after login
      await page.screenshot({ path: path.join(projectDir, 'after-login.png') });
      
      // Check if we're still on a login page
      const currentUrl = await page.url();
      if (currentUrl.includes('login') || currentUrl.includes('signin')) {
        // Check for visible UI elements that indicate we're logged in
        const isLoggedIn = await page.evaluate(() => {
          // Look for navigation elements that would only appear when logged in
          const navElements = document.querySelectorAll('nav, .sidebar, [role="navigation"]');
          if (navElements.length > 0) return true;
          
          // Look for user menu or profile elements
          const userElements = document.querySelectorAll('.avatar, .user-menu, [aria-label="User menu"]');
          if (userElements.length > 0) return true;
          
          // Check for project/workflow text that would be on the dashboard
          const dashboardText = document.body.innerText;
          return dashboardText.includes('Project') || 
                 dashboardText.includes('Workflow') || 
                 dashboardText.includes('Dashboard');
        });
        
        if (!isLoggedIn) {
          throw new Error('Login failed. Please check your credentials and try again.');
        }
      }
      
      console.log('Login successful!');
      
      // Navigate to projects page
      console.log('Navigating to projects page...');
      await page.goto('https://pipedream.com/projects', { waitUntil: 'networkidle0' });
      await sleep(2000);
      
      // Take a screenshot of projects page
      await page.screenshot({ path: path.join(projectDir, 'projects-page.png') });
      
      // Click "New Project" button - find by text content since selectors may change
      console.log('Creating new project...');
      
      const newProjectClicked = await page.evaluate(() => {
        // Function to find buttons or clickable elements with text
        function findClickableWithText(text) {
          // Find all elements containing the text
          const elements = Array.from(document.querySelectorAll('*')).filter(el => 
            el.textContent.trim().includes(text)
          );
          
          // For each matching element, check if it's clickable or has a clickable parent
          for (const el of elements) {
            // Check if the element itself is clickable
            if (
              el.tagName === 'BUTTON' ||
              el.tagName === 'A' ||
              el.getAttribute('role') === 'button' ||
              el.onclick ||
              el.className.includes('button')
            ) {
              el.click();
              return true;
            }
            
            // Check for clickable parent (button, link, etc.)
            let parent = el.parentElement;
            let depth = 0;
            while (parent && depth < 5) {
              if (
                parent.tagName === 'BUTTON' ||
                parent.tagName === 'A' ||
                parent.getAttribute('role') === 'button' ||
                parent.onclick ||
                parent.className.includes('button')
              ) {
                parent.click();
                return true;
              }
              parent = parent.parentElement;
              depth++;
            }
          }
          
          return false;
        }
        
        // Try to find and click "New Project" button
        return findClickableWithText('New Project') || findClickableWithText('New project');
      });
      
      if (!newProjectClicked) {
        throw new Error('Could not find New Project button');
      }
      
      console.log('Clicked New Project button');
      await sleep(2000);
      
      // Take a screenshot of the new project modal
      await page.screenshot({ path: path.join(projectDir, 'new-project-modal.png') });
      
      // Fill in project name in the modal
      console.log('Entering project name...');
      
      const nameEntered = await page.evaluate((name) => {
        // Try to find the input field for project name
        // Look for input or textarea with project-related placeholder
        const inputField = 
          document.querySelector('input[placeholder*="Project"]') || 
          document.querySelector('textarea[placeholder*="Project"]') ||
          document.querySelector('input[placeholder="My Project"]');
        
        if (inputField) {
          inputField.value = name;
          inputField.dispatchEvent(new Event('input', { bubbles: true }));
          inputField.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        
        // Try generic inputs if specific ones not found
        const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea'));
        if (inputs.length > 0) {
          inputs[0].value = name;
          inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
          inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        
        return false;
      }, projectName);
      
      if (!nameEntered) {
        // Fallback to direct keyboard input
        await page.keyboard.type(projectName);
      }
      
      await sleep(1000);
      
      // Click the Create Project button
      console.log('Clicking Create Project button...');
      
      const createClicked = await page.evaluate(() => {
        // Function to find buttons or clickable elements with text
        function findClickableWithText(text) {
          // Find all elements containing the text
          const elements = Array.from(document.querySelectorAll('*')).filter(el => 
            el.textContent.trim().includes(text)
          );
          
          // For each matching element, check if it's clickable or has a clickable parent
          for (const el of elements) {
            // Check if the element itself is clickable
            if (
              el.tagName === 'BUTTON' ||
              el.tagName === 'A' ||
              el.getAttribute('role') === 'button' ||
              el.onclick ||
              el.className.includes('button')
            ) {
              el.click();
              return true;
            }
            
            // Check for clickable parent (button, link, etc.)
            let parent = el.parentElement;
            let depth = 0;
            while (parent && depth < 5) {
              if (
                parent.tagName === 'BUTTON' ||
                parent.tagName === 'A' ||
                parent.getAttribute('role') === 'button' ||
                parent.onclick ||
                parent.className.includes('button')
              ) {
                parent.click();
                return true;
              }
              parent = parent.parentElement;
              depth++;
            }
          }
          
          return false;
        }
        
        // Try to find "Create Project" button
        return findClickableWithText('Create Project');
      });
      
      if (!createClicked) {
        throw new Error('Could not find or click Create Project button');
      }
      
      console.log('Clicked Create Project button, waiting for navigation...');
      
      // Wait for navigation after project creation
      try {
        await page.waitForNavigation({ timeout: 30000 });
      } catch (e) {
        console.log('Navigation timeout - continuing anyway');
      }
      
      await sleep(3000);
      
      // Take a screenshot after project creation
      await page.screenshot({ path: path.join(projectDir, 'after-creation.png') });
      
      // Get project ID from the URL
      console.log('Getting project ID...');
      
      // Try to get project ID from URL first
      const url = await page.url();
      let projectId = null;
      const urlMatch = url.match(/proj_[a-zA-Z0-9]+/);
      
      if (urlMatch) {
        projectId = urlMatch[0];
        console.log(`Found project ID in URL: ${projectId}`);
      } else {
        // Try to navigate to settings to get the ID
        console.log('Project ID not found in URL, trying settings page...');
        
        // Try to find and click settings link
        const settingsClicked = await page.evaluate(() => {
          const settingsLinks = Array.from(document.querySelectorAll('a')).filter(link => 
            link.textContent.trim() === 'Settings'
          );
          
          if (settingsLinks.length > 0) {
            settingsLinks[0].click();
            return true;
          }
          
          return false;
        });
        
        if (settingsClicked) {
          await sleep(2000);
          
          // Check for project ID in settings URL
          const settingsUrl = await page.url();
          const settingsMatch = settingsUrl.match(/proj_[a-zA-Z0-9]+/);
          
          if (settingsMatch) {
            projectId = settingsMatch[0];
            console.log(`Found project ID in settings URL: ${projectId}`);
          }
        }
      }
      
      // Create config files with project information
      if (projectId) {
        // Create config.ini file
        const configContent = `[project]
name = ${projectName}
id = ${projectId}
created_at = ${new Date().toISOString()}

[pipedream]
username = ${username}
apikey = ${apiKey}
`;
        await fs.writeFile(path.join(projectDir, 'config.ini'), configContent);
        
        // Update .env file with project ID
        const updatedEnvContent = `${envContent}PROJECT_ID=${projectId}
`;
        await fs.writeFile(path.join(projectDir, '.env'), updatedEnvContent);
        
        console.log(`Project created with ID: ${projectId}`);
        
        // Create workflows directory
        const workflowsDir = path.join(projectDir, 'workflows');
        await fs.mkdir(workflowsDir, { recursive: true });
      } else {
        console.log('Could not extract project ID. Config files may be incomplete.');
      }
      
    } finally {
      // Keep browser open briefly to see the final state
      await sleep(3000);
      await browser.close();
      rl.close();
    }
    
    console.log(`\nProject setup complete! Your project is available at ${projectDir}`);
    
  } catch (error) {
    console.error('Error creating project:', error.message);
    rl.close();
    process.exit(1);
  }
}

module.exports = { newProject };