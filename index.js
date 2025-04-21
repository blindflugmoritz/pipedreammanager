#!/usr/bin/env node

const { program } = require('commander');
const { open } = require('./commands/open');
const { newProject } = require('./commands/new-project');
const { login } = require('./commands/login');
const { loginSimple } = require('./commands/login-simple');
const { loginDirect } = require('./commands/login-direct');
const { loginTargeted } = require('./commands/login-targeted');
const { analyzeLoginPage } = require('./commands/analyze-login-page');
const { analyzeProjectsPage } = require('./commands/analyze-projects-page');
const { createProjectAfterLogin } = require('./commands/create-project-after-login');
const { createWorkflow } = require('./commands/create-workflow');
const { quickTest } = require('./commands/quick-test');

program
  .version('1.0.0')
  .description('CLI tool for managing Pipedream workflows');

program
  .command('open')
  .description('Open a Pipedream project in the browser')
  .option('-k, --apiKey <apiKey>', 'Pipedream API key')
  .option('-p, --project <id>', 'Project ID to open')
  .option('-u, --username <username>', 'Pipedream username/email (fallback if API key fails)')
  .option('-w, --password <password>', 'Pipedream password (fallback if API key fails)')
  .action(open);

program
  .command('new-project')
  .description('Create a new Pipedream project')
  .action(newProject);

program
  .command('login')
  .description('Test login to Pipedream')
  .option('-u, --username <username>', 'Pipedream username/email')
  .option('-p, --password <password>', 'Pipedream password')
  .action(login);

program
  .command('login-simple')
  .description('Simple login to Pipedream (more reliable)')
  .option('-u, --username <username>', 'Pipedream username/email')
  .option('-p, --password <password>', 'Pipedream password')
  .action(loginSimple);

program
  .command('login-direct')
  .description('Direct login to Pipedream with Auth0 support')
  .option('-u, --username <username>', 'Pipedream username/email')
  .option('-p, --password <password>', 'Pipedream password')
  .action(loginDirect);

program
  .command('login-targeted')
  .description('Targeted login based on page analysis')
  .option('-u, --username <username>', 'Pipedream username/email')
  .option('-p, --password <password>', 'Pipedream password')
  .action(loginTargeted);

program
  .command('create-project')
  .description('Create a new Pipedream project after login')
  .option('-u, --username <username>', 'Pipedream username/email')
  .option('-p, --password <password>', 'Pipedream password')
  .option('-n, --name <n>', 'Project name')
  .action(createProjectAfterLogin);

program
  .command('analyze-login')
  .description('Analyze the Pipedream login page structure')
  .action(analyzeLoginPage);

program
  .command('analyze-projects')
  .description('Analyze the Pipedream projects page structure')
  .action(analyzeProjectsPage);

program
  .command('quick-test')
  .description('Quick browser test to diagnose window closing issues')
  .action(quickTest);

program
  .command('create-workflow')
  .description('Create a new workflow in a Pipedream project')
  .option('-p, --project <id>', 'Project ID (optional if in project directory)')
  .option('-n, --name <name>', 'Workflow name')
  .option('-t, --template <id>', 'Template ID to use (optional)')
  .option('-d, --description <desc>', 'Workflow description (optional)')
  .option('-k, --apiKey <key>', 'Pipedream API key (optional if in .env)')
  .action(createWorkflow);

program.parse(process.argv);