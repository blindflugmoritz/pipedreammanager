const https = require('https');
const dotenv = require('dotenv');
const fs = require('fs').promises;
const path = require('path');
const ini = require('ini');

// Explicitly configure dotenv to look in the right place
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

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

// Get project ID from config.ini
async function getProjectIdFromConfig() {
  try {
    const configPath = path.join(process.cwd(), 'config.ini');
    const configContent = await fs.readFile(configPath, 'utf8');
    const config = ini.parse(configContent);
    
    if (config.project && config.project.id) {
      return config.project.id;
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Main function to list triggers for a workflow
async function listTriggers(options) {
  try {
    console.log('Fetching workflow triggers...');
    
    // Get API key from options or .env
    let apiKey = options.apiKey || process.env.PIPEDREAM_API_KEY;
    
    // If API key still not found, try to load from config.ini
    if (!apiKey) {
      try {
        const configPath = path.join(process.cwd(), 'config.ini');
        const exists = await fs.access(configPath).then(() => true).catch(() => false);
        if (exists) {
          const configContent = await fs.readFile(configPath, 'utf8');
          const config = ini.parse(configContent);
          
          if (config.api && config.api.key) {
            apiKey = config.api.key;
            console.log('Using API key from config.ini');
          }
        }
      } catch (error) {
        // Silently continue if config.ini reading fails
      }
    }
    
    if (!apiKey) {
      console.error('Error: API key is required. Provide via --apiKey option or set PIPEDREAM_API_KEY in .env file');
      process.exit(1);
    }
    
    // Get workflow ID
    let workflowId = options.workflow;
    
    // If workflow ID not provided directly, try to read from local directory or options
    if (!workflowId) {
      // Check if we're in a workflow directory by looking for workflow.json
      try {
        const workflowJsonPath = path.join(process.cwd(), 'workflow.json');
        const exists = await fs.access(workflowJsonPath).then(() => true).catch(() => false);
        
        if (exists) {
          const workflowContent = await fs.readFile(workflowJsonPath, 'utf8');
          const workflowData = JSON.parse(workflowContent);
          
          if (workflowData && workflowData.id) {
            workflowId = workflowData.id;
            console.log(`Found workflow ID in workflow.json: ${workflowId}`);
          }
        }
      } catch (error) {
        console.log(`Note: Could not read workflow.json: ${error.message}`);
      }
      
      // Try to detect if we're in a workflow subdirectory
      if (!workflowId) {
        const currentDir = process.cwd();
        const dirName = path.basename(currentDir);
        
        // Check if the directory name matches a workflow ID pattern (may be specific to your naming)
        if (dirName.startsWith('wf_') || dirName.match(/^[a-zA-Z0-9_-]+$/)) {
          console.log(`Trying to use directory name as workflow ID: ${dirName}`);
          workflowId = dirName;
        }
      }
      
      // Get user details to find org ID before listing workflows
      let orgId = null;
      try {
        const userDetails = await makeApiRequest('GET', '/users/me', apiKey);
        
        if (userDetails && userDetails.data && userDetails.data.orgs && userDetails.data.orgs.length > 0) {
          orgId = userDetails.data.orgs[0].id;
          console.log(`Using workspace (org_id): ${orgId}`);
        } else {
          console.error('Error: No workspace found for the user');
          process.exit(1);
        }
      } catch (error) {
        console.error(`Error getting user details: ${error.message}`);
        process.exit(1);
      }
      
      // If still no workflow ID and project ID provided, list all workflows and prompt user
      if (!workflowId && options.project) {
        console.log(`No workflow ID provided. Listing workflows in project ${options.project}...`);
        try {
          const workflows = await makeApiRequest('GET', `/projects/${options.project}/workflows?org_id=${orgId}`, apiKey);
          
          if (workflows && workflows.data && workflows.data.length > 0) {
            console.log('\nAvailable workflows:');
            workflows.data.forEach((workflow, index) => {
              console.log(`${index + 1}. ${workflow.name} (${workflow.id})`);
            });
            
            console.log('\nPlease use --workflow <id> to specify which workflow to retrieve triggers for.');
            return;
          } else {
            console.log('No workflows found in the project.');
            return;
          }
        } catch (error) {
          console.error(`Error fetching workflows: ${error.message}`);
          return;
        }
      } else if (!workflowId && !options.project) {
        // Try to get project ID from config.ini
        const projectId = await getProjectIdFromConfig();
        
        if (projectId) {
          console.log(`No workflow ID provided. Listing workflows in project ${projectId}...`);
          try {
            const workflows = await makeApiRequest('GET', `/projects/${projectId}/workflows?org_id=${orgId}`, apiKey);
            
            if (workflows && workflows.data && workflows.data.length > 0) {
              console.log('\nAvailable workflows:');
              workflows.data.forEach((workflow, index) => {
                console.log(`${index + 1}. ${workflow.name} (${workflow.id})`);
              });
              
              console.log('\nPlease use --workflow <id> to specify which workflow to retrieve triggers for.');
              return;
            } else {
              console.log('No workflows found in the project.');
              return;
            }
          } catch (error) {
            console.error(`Error fetching workflows: ${error.message}`);
            return;
          }
        } else {
          console.error('Error: Workflow ID is required. Please provide --workflow <id> or run this command from a workflow directory.');
          process.exit(1);
        }
      }
    }
    
    if (!workflowId) {
      console.error('Error: Workflow ID is required. Please provide --workflow <id> or run this command from a workflow directory.');
      process.exit(1);
    }
    
    // Get user details to find org ID
    console.log('Fetching user details to determine workspace...');
    let orgId = null;
    try {
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
    } catch (error) {
      console.error(`Error getting user details: ${error.message}`);
      process.exit(1);
    }
    
    // Fetch workflow details
    console.log(`Fetching details for workflow ${workflowId}...`);
    let workflow;
    try {
      workflow = await makeApiRequest('GET', `/workflows/${workflowId}?org_id=${orgId}`, apiKey);
      
      if (!workflow || !workflow.data) {
        console.error('Error: Failed to fetch workflow details - No data returned');
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error fetching workflow details: ${error.message}`);
      
      // Check if this might be a project ID instead of a workflow ID
      if (workflowId.startsWith('p_')) {
        console.log('\nThe ID provided appears to be a project ID (starting with p_) rather than a workflow ID.');
        console.log('Workflow IDs typically start with "wf_" or have a similar format.');
        console.log('\nTrying to list workflows in this project instead...');
        
        try {
          const workflows = await makeApiRequest('GET', `/projects/${workflowId}/workflows?org_id=${orgId}`, apiKey);
          
          if (workflows && workflows.data && workflows.data.length > 0) {
            console.log('\nWorkflows in this project:');
            workflows.data.forEach((workflow, index) => {
              console.log(`${index + 1}. ${workflow.name} (${workflow.id})`);
            });
            
            console.log('\nPlease use one of these workflow IDs with --workflow option.');
            process.exit(0);
          } else {
            console.log('No workflows found in this project.');
            process.exit(0);
          }
        } catch (projectError) {
          console.error(`Error fetching project workflows: ${projectError.message}`);
          process.exit(1);
        }
      }
      
      process.exit(1);
    }
    
    const workflowName = workflow.data.name || 'Unnamed Workflow';
    console.log(`\nWorkflow: ${workflowName} (${workflowId})`);
    
    // Extract triggers from components
    const components = workflow.data.components || [];
    const triggers = components.filter(component => 
      component.type === 'source' || 
      component.type === 'trigger' || 
      (component.source && component.source.type)
    );
    
    if (triggers.length === 0) {
      console.log('No triggers found for this workflow.');
      process.exit(0);
    }
    
    console.log('\nTriggers:');
    console.log('-'.repeat(50));
    
    triggers.forEach((trigger, index) => {
      const triggerType = trigger.source?.type || trigger.type;
      const triggerApp = trigger.app || 'unknown';
      
      console.log(`Trigger #${index + 1}: ${triggerApp} (${triggerType})`);
      
      if (triggerApp === 'http') {
        // For HTTP webhook, display the URL
        const webhookUrl = `https://webhook.pipedream.com/v1/sources/${workflowId}/events`;
        console.log(`Webhook URL: ${webhookUrl}`);
      } else if (triggerApp === 'schedule') {
        // For schedule trigger, display the cron expression
        const cronExpression = trigger.source?.cron || trigger.options?.cron || 'unknown';
        console.log(`Schedule: ${cronExpression}`);
      }
      
      // Display all options/configuration for debugging
      console.log('Configuration:');
      if (trigger.source) {
        console.log(JSON.stringify(trigger.source, null, 2));
      } else if (trigger.options) {
        console.log(JSON.stringify(trigger.options, null, 2));
      }
      
      console.log('-'.repeat(50));
    });
    
    // Make sure to exit the process after returning data
    process.exit(0);
  } catch (error) {
    console.error('Error listing triggers:', error.message);
    process.exit(1);
  }
}

module.exports = { listTriggers };