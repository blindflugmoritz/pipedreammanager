const fs = require('fs').promises;
const path = require('path');
const ini = require('ini');
const https = require('https');
const crypto = require('crypto');
require('dotenv').config();

// Helper function to generate a random path for HTTP webhooks
function generateRandomPath() {
  return crypto.randomBytes(8).toString('hex');
}

async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

// Helper function to make API requests
async function makeApiRequest(method, endpoint, apiKey, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.pipedream.com',
      port: 443,
      path: `/v1${endpoint}`,
      method: method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsedData = JSON.parse(responseData);
            resolve(parsedData);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        } else {
          reject(new Error(`Request failed with status code ${res.statusCode}: ${responseData}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Main function to create a workflow
async function createWorkflow(options) {
  try {
    console.log('Starting workflow creation process...');
    
    // Get API key from options or .env
    const apiKey = options.apiKey || process.env.PIPEDREAM_API_KEY;
    if (!apiKey) {
      console.error('Error: API key is required. Provide via --apiKey option or set PIPEDREAM_API_KEY in .env file');
      process.exit(1);
    }
    
    // Get project information
    let projectId = options.project;
    let orgId = null;
    
    // If project ID is not provided directly, try to read from config.ini
    if (!projectId) {
      try {
        const configPath = path.join(process.cwd(), 'config.ini');
        const configContent = await fs.readFile(configPath, 'utf8');
        const config = ini.parse(configContent);
        
        if (config.project && config.project.id) {
          projectId = config.project.id;
          console.log(`Found project ID in config: ${projectId}`);
        }
      } catch (error) {
        console.error('Error reading config.ini file:', error.message);
        console.error('Please provide a project ID with --project option or run this command from a project directory');
        process.exit(1);
      }
    }
    
    if (!projectId) {
      console.error('Error: Project ID is required. Provide via --project option or ensure config.ini contains project.id');
      process.exit(1);
    }
    
    // Get user details to find org ID
    console.log('Fetching user details to determine workspace...');
    const userDetails = await makeApiRequest('GET', '/users/me', apiKey);
    
    if (!userDetails || !userDetails.data || !userDetails.data.id) {
      console.error('Error: Failed to fetch user details');
      process.exit(1);
    }
    
    // Get the first organization (workspace) from the user's details
    if (userDetails.data.orgs && userDetails.data.orgs.length > 0) {
      orgId = userDetails.data.orgs[0].id;
      console.log(`Using workspace (org_id): ${orgId}`);
    } else {
      console.error('Error: No workspace found for the user');
      process.exit(1);
    }
    
    // Prepare workflow data
    const workflowName = options.name || `Workflow_${new Date().toISOString().split('T')[0]}`;
    console.log(`Creating workflow: ${workflowName}`);
    
    const workflowData = {
      project_id: projectId,
      org_id: orgId,
      settings: {
        name: workflowName,
        auto_deploy: true
      }
    };
    
    // Add template ID if provided
    if (options.template) {
      workflowData.template_id = options.template;
      console.log(`Using template: ${options.template}`);
    }
    
    // Add description if provided
    if (options.description) {
      workflowData.settings.description = options.description;
    }
    
    // Check for trigger configuration
    // First check options, then fallback to environment variables
    const triggerType = options.trigger || process.env.DEFAULT_TRIGGER_TYPE;
    
    if (triggerType) {
      console.log(`Configuring trigger: ${triggerType}`);
      
      // Initialize components array if not exists
      if (!workflowData.components) {
        workflowData.components = [];
      }
      
      if (triggerType === 'http') {
        // HTTP webhook trigger
        console.log(`Configuring HTTP webhook trigger`);
        
        workflowData.components.push({
          key: 'trigger',
          type: 'source',
          app: 'http',
          source: {
            type: 'webhook',
            name: `${workflowName} HTTP Webhook`,
            key: 'http-webhook'  
          }
        });
      } else if (triggerType === 'schedule') {
        // Schedule/cron trigger
        // First check options, then env var, then default to daily at midnight
        let cronExpression = options.schedule || process.env.DEFAULT_SCHEDULE || '0 0 * * *';
        // Remove quotes if present in the environment variable
        cronExpression = cronExpression.replace(/"/g, '');
        
        console.log(`Using schedule: ${cronExpression}`);
        
        workflowData.components.push({
          key: 'trigger',
          type: 'source',
          app: 'schedule',
          source: {
            type: 'cron',
            name: `${workflowName} Schedule`,
            key: 'schedule',
            cron: cronExpression
          }
        });
      } else {
        console.log(`Trigger type '${triggerType}' not yet implemented. Creating workflow without trigger.`);
      }
    }
    
    // Create the workflow via API
    console.log('Creating workflow via API...');
    const newWorkflow = await makeApiRequest('POST', '/workflows', apiKey, workflowData);
    
    if (!newWorkflow || !newWorkflow.data || !newWorkflow.data.id) {
      console.error('Error: Failed to create workflow');
      process.exit(1);
    }
    
    const workflowId = newWorkflow.data.id;
    console.log(`✅ Workflow created successfully with ID: ${workflowId}`);
    
    // Store workflow details locally
    const projectDir = process.cwd();
    const workflowsDir = path.join(projectDir, 'workflows');
    const workflowDir = path.join(workflowsDir, workflowId);
    
    // Ensure directories exist
    await ensureDir(workflowsDir);
    await ensureDir(workflowDir);
    
    // Save workflow metadata
    const metadata = {
      id: workflowId,
      name: workflowName,
      created_at: new Date().toISOString(),
      project_id: projectId,
      description: options.description || ''
    };
    
    // Add trigger info to metadata
    if (triggerType) {
      metadata.trigger = {
        type: triggerType
      };
      
      if (triggerType === 'http' && options.triggerPath) {
        metadata.trigger.path = options.triggerPath;
        metadata.webhook_url = `https://webhook.pipedream.com/v1/sources/${workflowId}/events`;
      } else if (triggerType === 'http') {
        const path = generateRandomPath();
        metadata.trigger.path = path;
        metadata.webhook_url = `https://webhook.pipedream.com/v1/sources/${workflowId}/events`;
      } else if (triggerType === 'schedule') {
        let schedule = options.schedule || process.env.DEFAULT_SCHEDULE || '0 0 * * *';
        schedule = schedule.replace(/"/g, '');
        metadata.trigger.schedule = schedule;
      }
    }
    
    await fs.writeFile(
      path.join(workflowDir, 'workflow.json'),
      JSON.stringify(metadata, null, 2)
    );
    
    // Create placeholder for code
    await fs.writeFile(
      path.join(workflowDir, 'code.js'),
      `// Placeholder for workflow code\n// Workflow ID: ${workflowId}\n// Name: ${workflowName}\n`
    );
    
    // Generate URL for the workflow
    const workflowUrl = `https://pipedream.com/workflows/${workflowId}`;
    
    console.log('\n' + '-'.repeat(50));
    console.log(`✅ Workflow "${workflowName}" created successfully!`);
    console.log(`   - Workflow ID: ${workflowId}`);
    console.log(`   - URL: ${workflowUrl}`);
    console.log(`   - Local directory: ${workflowDir}`);
    
    // Display trigger information if applicable
    if (triggerType) {
      console.log(`   - Trigger type: ${triggerType}`);
      
      if (triggerType === 'http') {
        const webhookUrl = `https://webhook.pipedream.com/v1/sources/${workflowId}/events`;
        console.log(`   - Webhook URL: ${webhookUrl}`);
      } else if (triggerType === 'schedule') {
        let schedule = options.schedule || process.env.DEFAULT_SCHEDULE || '0 0 * * *';
        schedule = schedule.replace(/"/g, '');
        console.log(`   - Schedule: ${schedule}`);
      }
    }
    
    console.log('-'.repeat(50) + '\n');
    
    return { 
      workflowId, 
      workflowName, 
      workflowUrl,
      trigger: triggerType ? {
        type: triggerType,
        ...(triggerType === 'http' ? { 
          path: options.triggerPath || metadata.trigger?.path,
          webhook_url: `https://webhook.pipedream.com/v1/sources/${workflowId}/events`
        } : {}),
        ...(triggerType === 'schedule' ? { 
          schedule: options.schedule || process.env.DEFAULT_SCHEDULE?.replace(/"/g, '') || '0 0 * * *' 
        } : {})
      } : null
    };
  } catch (error) {
    console.error('Error creating workflow:', error.message);
    process.exit(1);
  }
}

module.exports = { createWorkflow };
