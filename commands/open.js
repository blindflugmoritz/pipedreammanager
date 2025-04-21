const puppeteer = require('puppeteer');
const https = require('https');
const fs = require('fs').promises;
const path = require('path');
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
    this.logPath = path.join(logDir, `open-project-${runId}.log`);
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

async function fetchCookie(apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.pipedream.com',
      path: '/v1/users/me',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          // Check if the API key is valid
          if (res.statusCode === 200) {
            const parsedData = JSON.parse(data);
            resolve({ success: true, email: parsedData.data.email });
          } else {
            reject(new Error('Authentication failed with status: ' + res.statusCode));
          }
        } catch (e) {
          reject(new Error('Failed to parse response: ' + e.message));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.end();
  });
}

async function findConfigFile() {
  // Check current directory for config.ini
  try {
    const configPath = path.join(process.cwd(), 'config.ini');
    await fs.access(configPath);
    return { path: configPath, inCurrent: true };
  } catch (err) {
    // Config not in current directory, check if we're in a subdirectory of a project
    try {
      const parentDir = path.dirname(process.cwd());
      const parentConfigPath = path.join(parentDir, 'config.ini');
      await fs.access(parentConfigPath);
      return { path: parentConfigPath, inCurrent: false };
    } catch (err) {
      return null;
    }
  }
}

async function open(options) {
  // Generate a unique run ID
  const runId = uuidv4().substring(0, 8);
  
  // Create the logger
  const logger = new Logger(path.join(process.cwd(), 'logs'), runId);
  await logger.setup();
  
  await logger.log(`Starting project opening process (Run ID: ${runId})`);
  
  let projectId = options.project;
  let projectName = null;
  let configFound = false;
  let success = false;
  
  // If no project ID provided via options, try to find from config.ini
  if (!projectId) {
    await logger.log('No project ID provided, looking for config.ini...');
    
    const configFile = await findConfigFile();
    if (configFile) {
      try {
        const configData = ini.parse(await fs.readFile(configFile.path, 'utf-8'));
        
        if (configData.project && configData.project.id) {
          projectId = configData.project.id;
          projectName = configData.project.name || "Unknown Project";
          
          await logger.log(`Found project in config.ini: ${projectName} (${projectId})`);
          configFound = true;
        } else {
          await logger.log('Config file found but missing project data');
        }
      } catch (err) {
        await logger.log(`Error reading config file: ${err.message}`);
      }
    } else {
      await logger.log('No config.ini found in current or parent directory');
    }
  }
  
  // Still no project ID after checking config?
  if (!projectId) {
    await logger.log('ERROR: Project ID is required. Provide it via --project option or config.ini file');
    console.log('\n' + '-'.repeat(50));
    console.log('❌ Cannot open project: No project ID provided');
    console.log('   Please provide a project ID with --project option');
    console.log('   or run this command from a project directory with config.ini');
    console.log('-'.repeat(50) + '\n');
    process.exit(1);
  }
  
  // Determine authentication method (API key or username/password)
  const useApiKey = options.apiKey || process.env.PIPEDREAM_API_KEY;
  const useCredentials = options.username || process.env.PIPEDREAM_USERNAME;
  
  let browser = null;
  let page = null;
  
  try {
    // Launch browser
    await logger.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--start-maximized']
    });
    
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36');
    
    await logger.log(`Opening project with ID: ${projectId}`);
    
    if (useApiKey) {
      // API key authentication
      await logger.log('Using API key authentication');
      
      try {
        const authResult = await fetchCookie(useApiKey);
        await logger.log(`Authenticated as: ${authResult.email}`);
        
        // Navigate to project and set localStorage
        await page.goto('https://pipedream.com');
        await page.evaluate((apiKey) => {
          localStorage.setItem('pd_api_key', apiKey);
        }, useApiKey);
        
        // Now navigate to the project URL
        await page.goto(`https://pipedream.com/workflows/${projectId}`, { waitUntil: 'networkidle0' });
        await logger.saveScreenshot(page, 'project-page');
        
        // Check if we're on login page
        const currentUrl = await page.url();
        if (currentUrl.includes('/auth/login')) {
          await logger.log('API key authentication failed, redirected to login page');
          throw new Error('API key authentication failed');
        }
        
        success = true;
      } catch (authError) {
        await logger.log(`API key authentication failed: ${authError.message}`);
        
        // Fall back to username/password if available
        if (useCredentials) {
          await logger.log('Falling back to username/password authentication');
        } else {
          throw new Error('Authentication failed and no username/password fallback available');
        }
      }
    }
    
    // If API key auth failed or wasn't used, try username/password
    if (!success && useCredentials) {
      const username = options.username || process.env.PIPEDREAM_USERNAME;
      const password = options.password || process.env.PIPEDREAM_PASSWORD;
      
      if (!password) {
        await logger.log('ERROR: Password is required for username authentication');
        throw new Error('Password is required for username authentication');
      }
      
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
      
      if (currentPageUrl.includes('login')) {
        await logger.log('Still on login page, login may have failed');
        throw new Error('Login failed');
      }
      
      await logger.log('Login successful');
      
      // Navigate to the project
      await logger.log(`Navigating to project: ${projectId}`);
      await page.goto(`https://pipedream.com/workflows/${projectId}`, { waitUntil: 'networkidle0' });
      await logger.saveScreenshot(page, 'project-page');
      
      success = true;
    }
    
    // Verify we're on the project page
    const finalUrl = await page.url();
    await logger.log(`Final URL: ${finalUrl}`);
    
    if (!finalUrl.includes(projectId)) {
      await logger.log('WARNING: Final URL does not contain the project ID');
    }
    
    // Extract the page title to get project name if not already known
    if (!projectName) {
      try {
        projectName = await page.title();
        projectName = projectName.replace(' | Pipedream', '').trim();
        await logger.log(`Project name from page title: ${projectName}`);
      } catch (e) {
        await logger.log(`Could not extract project name: ${e.message}`);
        projectName = "Unknown Project";
      }
    }
    
    success = true;
    
    // Keep the browser open for user interaction
    await logger.log('Project opened successfully!');
    console.log('\n' + '-'.repeat(50));
    console.log(`✅ Project "${projectName}" opened successfully!`);
    console.log(`   - Project ID: ${projectId}`);
    console.log(`   - Log file: ${logger.logPath}`);
    console.log(`   - Keep the browser window open to interact with the project.`);
    console.log(`   - Press Ctrl+C in this terminal when you want to close the browser.`);
    console.log('-'.repeat(50) + '\n');
    
    // Keep the process running until user terminates it
    await new Promise(() => {});
    
  } catch (error) {
    await logger.log(`ERROR: ${error.message}`);
    if (page) {
      await logger.saveScreenshot(page, 'error-state');
    }
    
    console.log('\n' + '-'.repeat(50));
    console.log('❌ Failed to open project!');
    console.log(`   - Log file: ${logger.logPath}`);
    console.log('-'.repeat(50) + '\n');
    
  } finally {
    // This try/catch ensures browser cleanup happens even if something fails
    try {
      if (!success && browser) {
        await logger.log('Closing browser due to error...');
        await browser.close();
      }
    } catch (closingError) {
      await logger.log(`Error closing browser: ${closingError.message}`);
    }
    
    // Only exit on failure - success keeps the browser open
    if (!success) {
      process.exit(1);
    }
  }
}

module.exports = { open };