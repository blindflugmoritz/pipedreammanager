const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');
const ini = require('ini');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to create directories if they don't exist
async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

// Logger setup
class Logger {
  constructor(logDir, runId) {
    this.logPath = path.join(logDir, `create-project-${runId}.log`);
    this.screenDir = path.join(logDir, 'screens', runId);
    this.runId = runId;
  }
  
  async setup() {
    await ensureDir(path.dirname(this.logPath));
    await ensureDir(this.screenDir);
  }
  
  async log(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    
    console.log(message);
    
    try {
      await fs.appendFile(this.logPath, logEntry);
    } catch (error) {
      console.error(`Error writing to log: ${error.message}`);
    }
  }
  
  async saveScreenshot(page, name) {
    try {
      const screenPath = path.join(this.screenDir, `${name}.png`);
      await page.screenshot({ path: screenPath });
      await this.log(`Screenshot saved: ${name}.png`);
      return screenPath;
    } catch (error) {
      await this.log(`Error saving screenshot: ${error.message}`);
      return null;
    }
  }
}

async function createProjectAfterLogin(options) {
  // Generate a unique run ID
  const runId = uuidv4().substring(0, 8);
  
  // Create the logger
  const logger = new Logger(path.join(process.cwd(), 'logs'), runId);
  await logger.setup();
  
  await logger.log(`Starting project creation process (Run ID: ${runId})`);
  
  const projectName = options.name || `Project_${new Date().toISOString().split('T')[0]}`;
  const username = options.username || process.env.PIPEDREAM_USERNAME;
  const password = options.password || process.env.PIPEDREAM_PASSWORD;

  if (!username || !password) {
    await logger.log('ERROR: Username and password are required. Provide via options or .env file');
    process.exit(1);
  }

  await logger.log(`Project name: ${projectName}`);
  
  let browser = null;
  let page = null;
  let projectDir = null;
  let projectId = null;
  let success = false;
  
  try {
    // Create project directory
    projectDir = path.join(process.cwd(), projectName);
    await ensureDir(projectDir);
    await logger.log(`Created project directory: ${projectDir}`);
    
    // Launch browser
    await logger.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--start-maximized']
    });
    
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36');
    
    // STEP 1: Login - USING THE ORIGINAL WORKING CODE
    await logger.log('Step 1: Logging in to Pipedream...');
    await page.goto('https://pipedream.com/auth/login', { waitUntil: 'networkidle0' });
    await logger.saveScreenshot(page, 'login-page');
    
    // Click on the Email label to activate the field
    await page.evaluate(() => {
      const emailLabels = Array.from(document.querySelectorAll('label')).filter(label => 
        label.textContent.toLowerCase().trim() === 'email'
      );
      if (emailLabels.length > 0) {
        emailLabels[0].click();
      }
    });
    
    await sleep(500);
    
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
    
    await sleep(500);
    
    // Type email
    await page.keyboard.type(username);
    await sleep(200);
    
    // Tab to password field
    await page.keyboard.press('Tab');
    await sleep(200);
    
    // Type password
    await page.keyboard.type(password);
    await sleep(200);
    
    // Submit the form
    await page.keyboard.press('Tab');
    await sleep(200);
    await page.keyboard.press('Enter');
    
    await logger.log('Login form submitted, waiting for navigation...');
    
    // Wait for navigation
    try {
      await page.waitForNavigation({ timeout: 30000 });
    } catch (e) {
      await logger.log('Navigation timeout - continuing anyway');
    }
    
    // Verify login success
    const currentPageUrl = await page.url();
    await logger.log(`Current URL after login: ${currentPageUrl}`);
    await logger.saveScreenshot(page, 'after-login');
    
    // Give it some time to load fully
    await sleep(3000);
    
    // Check if we're on the login page but check for success indicators
    if (currentPageUrl.includes('login')) {
      // Look for elements that indicate successful login despite URL
      const isLoggedIn = await page.evaluate(() => {
        // Check for sidebar menu with account name
        const accountMenu = document.querySelector('.sidebar, nav, [role="navigation"]');
        if (accountMenu) return true;
        
        // Check for workspace area
        if (document.querySelector('[data-test="workspace-nav"]')) return true;
        
        // Check for common post-login elements
        if (document.querySelector('button[aria-label="User menu"]')) return true;
        
        // Check for "New Project" button or similar post-login content
        const projectElements = Array.from(document.querySelectorAll('*')).filter(el => 
          el.textContent.includes('Project') || el.textContent.includes('Workflow')
        );
        if (projectElements.length > 0) return true;
        
        return false;
      });
      
      if (isLoggedIn) {
        await logger.log('URL still shows login page but UI elements indicate successful login');
      } else {
        await logger.log('Still on login page, login may have failed');
        throw new Error('Login failed');
      }
    }
    
    await logger.log('Login successful');
    
    // STEP 2: Navigate to projects page if needed
    await logger.log('Step 2: Navigating to projects page...');
    
    // Only navigate if not already on projects page
    if (!currentPageUrl.includes('/projects')) {
      await logger.log('Not on projects page, navigating there now');
      await page.goto('https://pipedream.com/@momoetomo/projects', { waitUntil: 'networkidle0' });
    } else {
      await logger.log('Already on projects page');
    }
    
    await logger.saveScreenshot(page, 'projects-page');
    
    // STEP 3: Click "New Project" button
    await logger.log('Step 3: Creating new project...');
    
    const newProjectClicked = await page.evaluate(() => {
      // Try to find the div with role="button" containing "New project"
      const buttonDivs = Array.from(document.querySelectorAll('div[role="button"]')).filter(div => 
        div.textContent.includes('New project')
      );
      
      if (buttonDivs.length > 0) {
        buttonDivs[0].click();
        return true;
      }
      
      // Try to find any element containing "New project"
      const newProjectElements = Array.from(document.querySelectorAll('*')).filter(el => 
        el.textContent.trim() === 'New project'
      );
      
      if (newProjectElements.length > 0) {
        const element = newProjectElements[0];
        
        // Try to find a clickable parent
        let current = element;
        while (current && current !== document.body) {
          if (current.tagName.toLowerCase() === 'button' || 
              current.tagName.toLowerCase() === 'a' || 
              current.getAttribute('role') === 'button') {
            current.click();
            return true;
          }
          current = current.parentElement;
        }
        
        // If no clickable parent, try clicking the element directly
        element.click();
        return true;
      }
      
      return false;
    });
    
    if (!newProjectClicked) {
      await logger.log('ERROR: Could not find or click New Project button');
      throw new Error('Could not find New Project button');
    }
    
    await logger.log('Clicked New Project button');
    await sleep(1000);
    await logger.saveScreenshot(page, 'new-project-modal');
    
    // STEP 4: Fill in project name
    await logger.log(`Step 4: Setting project name to: ${projectName}`);
    
    const nameEntered = await page.evaluate((name) => {
      // Find textarea with placeholder="Project Name"
      const textarea = document.querySelector('textarea[placeholder="Project Name"]');
      
      if (textarea) {
        textarea.value = name;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      
      // Try any textarea as fallback
      const anyTextarea = document.querySelector('textarea');
      if (anyTextarea) {
        anyTextarea.value = name;
        anyTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        anyTextarea.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      
      return false;
    }, projectName);
    
    if (!nameEntered) {
      await logger.log('WARNING: Could not set project name via JavaScript, trying keyboard input');
      
      try {
        // Try direct keyboard input
        await page.focus('textarea');
        
        // Select all text (Command+A on macOS)
        await page.keyboard.down('Meta');
        await page.keyboard.press('a');
        await page.keyboard.up('Meta');
        
        // Delete selected text
        await page.keyboard.press('Delete');
        
        // Type project name
        await page.keyboard.type(projectName);
      } catch (e) {
        await logger.log(`ERROR: Keyboard input failed: ${e.message}`);
      }
    }
    
    await sleep(500);
    await logger.saveScreenshot(page, 'project-name-entered');
    
    // STEP 5: Click "Create Project" button
    await logger.log('Step 5: Clicking Create Project button...');
    
    const createButtonClicked = await page.evaluate(() => {
      // Try the specific div class with "Create Project" text as described
      const createProjectDivs = Array.from(document.querySelectorAll('div.h-full.flex.items-center.justify-center.w-full.gap-x-1\\.5')).filter(div => 
        div.textContent.includes('Create Project')
      );
      
      if (createProjectDivs.length > 0) {
        // Log what we found to help debug
        console.log('Found the Create Project div with matching class');
        
        const div = createProjectDivs[0];
        
        // Try to find clickable parent button
        let current = div;
        let maxTries = 5; // Prevent infinite loop
        
        while (current && current !== document.body && maxTries > 0) {
          maxTries--;
          
          if (current.tagName.toLowerCase() === 'button' || 
              current.tagName.toLowerCase() === 'a' || 
              current.getAttribute('role') === 'button') {
            console.log('Found clickable parent, clicking it');
            current.click();
            return true;
          }
          current = current.parentElement;
        }
        
        // If no clickable parent, click the div itself
        console.log('No clickable parent found, clicking the div directly');
        div.click();
        
        // Use MouseEvent for better click simulation if the direct click didn't work
        const rect = div.getBoundingClientRect();
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2
        });
        div.dispatchEvent(clickEvent);
        
        return true;
      }
      
      // Fallback: Try to find any div containing "Create Project" text
      const anyCreateProjectDivs = Array.from(document.querySelectorAll('div')).filter(div => 
        div.textContent.trim() === 'Create Project'
      );
      
      if (anyCreateProjectDivs.length > 0) {
        console.log('Found Create Project div (fallback method)');
        const div = anyCreateProjectDivs[0];
        
        // Try different click methods for the div
        try {
          div.click();
          
          // Also try dispatching a MouseEvent
          const rect = div.getBoundingClientRect();
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2
          });
          div.dispatchEvent(clickEvent);
          
          return true;
        } catch (e) {
          console.log('Error clicking div:', e);
        }
      }
      
      // Try to find any button in modal
      const modals = document.querySelectorAll('.modal, .dialog, [role="dialog"], [aria-modal="true"]');
      if (modals.length > 0) {
        const buttonsInModal = Array.from(modals[0].querySelectorAll('button, [role="button"]'));
        const submitButtons = buttonsInModal.filter(btn => 
          btn.textContent.toLowerCase().includes('create') || 
          btn.type === 'submit'
        );
        
        if (submitButtons.length > 0) {
          submitButtons[0].click();
          return true;
        }
        
        // As a last resort, click the last button in the modal (usually the confirm button)
        if (buttonsInModal.length > 0) {
          buttonsInModal[buttonsInModal.length - 1].click();
          return true;
        }
      }
      
      return false;
    });
    
    if (!createButtonClicked) {
      await logger.log('ERROR: Could not find or click Create Project button');
      throw new Error('Could not find Create Project button');
    }
    
    await logger.log('Clicked Create Project button');
    
    // Wait for navigation to new project
    await logger.log('Waiting for navigation to new project...');
    try {
      await page.waitForNavigation({ timeout: 30000 });
    } catch (e) {
      await logger.log('Navigation timeout - continuing anyway');
    }
    
    await sleep(2000);
    await logger.saveScreenshot(page, 'after-project-creation');
    
    // STEP 6: Extract project ID
    const finalUrl = await page.url();
    await logger.log(`Final URL: ${finalUrl}`);
    
    const projectIdMatch = finalUrl.match(/proj_[a-zA-Z0-9]+/);
    if (projectIdMatch) {
      projectId = projectIdMatch[0];
      await logger.log(`Successfully extracted project ID: ${projectId}`);
      success = true;
    } else {
      await logger.log('WARNING: Could not extract project ID from URL');
    }
    
  } catch (error) {
    await logger.log(`ERROR: ${error.message}`);
    if (page) {
      await logger.saveScreenshot(page, 'error-state');
    }
  } finally {
    // Close browser
    await logger.log('Closing browser...');
    if (browser) {
      await browser.close();
    }
    
    // Create config.ini file if we have a project ID
    if (projectDir && projectId) {
      try {
        const configPath = path.join(projectDir, 'config.ini');
        const configData = {
          project: {
            name: projectName,
            id: projectId,
            created_at: new Date().toISOString()
          },
          pipedream: {
            username: username
          }
        };
        
        await fs.writeFile(configPath, ini.stringify(configData));
        await logger.log(`Created config file: ${configPath}`);
      } catch (error) {
        await logger.log(`ERROR: Failed to create config file: ${error.message}`);
      }
    }
    
    // Final output message
    if (success) {
      await logger.log(`Project "${projectName}" created successfully with ID: ${projectId}`);
      await logger.log(`Project directory: ${projectDir}`);
      await logger.log(`Log file: ${logger.logPath}`);
      console.log('\n' + '-'.repeat(50));
      console.log(`✅ Project "${projectName}" created successfully!`);
      console.log(`   - Project ID: ${projectId}`);
      console.log(`   - Directory: ${projectDir}`);
      console.log(`   - Log file: ${logger.logPath}`);
      console.log('-'.repeat(50) + '\n');
    } else {
      console.log('\n' + '-'.repeat(50));
      console.log('❌ Project creation failed!');
      console.log(`   - Log file: ${logger.logPath}`);
      console.log('-'.repeat(50) + '\n');
    }
    
    // This explicit process.exit ensures we don't hang
    process.exit(success ? 0 : 1);
  }
}

module.exports = { createProjectAfterLogin };