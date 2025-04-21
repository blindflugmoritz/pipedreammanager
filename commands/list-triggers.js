const https = require('https');
require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const ini = require('ini');

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
    const apiKey = options.apiKey || process.env.PIPEDREAM_API_KEY;
    if (!apiKey) {
      console.error('Error: API key is required. Provide via --apiKey option or set PIPEDREAM_API_KEY in .env file');
      process.exit(1);
    }
    
    // Get workflow ID
    let workflowId = options.workflow;
    
    // If workflow ID not provided directly, try to read from local directory or options
    if (!workflowId) {
      // If in a workflow directory, try to read from workflow.json
      try {
        const workflowJsonPath = path.join(process.cwd(), 'workflow.json');
        const workflowData = JSON.parse(await fs.readFile(workflowJsonPath, 'utf8'));
        if (workflowData && workflowData.id) {
          workflowId = workflowData.id;
          console.log(`Found workflow ID in workflow.json: ${workflowId}`);
        }
      } catch (error) {
        // Not in a workflow directory, that's okay
      }
      
      // If still no workflow ID and project ID provided, list all workflows and prompt user
      if (!workflowId && options.project) {
        console.log(`No workflow ID provided. Listing workflows in project ${options.project}...`);
        try {
          const workflows = await makeApiRequest('GET', `/projects/${options.project}/workflows`, apiKey);
          
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
            const workflows = await makeApiRequest('GET', `/projects/${projectId}/workflows`, apiKey);
            
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
    
    // Fetch workflow details
    console.log(`Fetching details for workflow ${workflowId}...`);
    const workflow = await makeApiRequest('GET', `/workflows/${workflowId}`, apiKey);
    
    if (!workflow || !workflow.data) {
      console.error('Error: Failed to fetch workflow details');
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
      return;
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
    
    return triggers;
  } catch (error) {
    console.error('Error listing triggers:', error.message);
    process.exit(1);
  }
}

module.exports = { listTriggers };