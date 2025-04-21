# Pipedream Manager CLI

A command-line tool for managing Pipedream workflows and projects.

## Features

- **Create Projects**: Easily create new Pipedream projects
- **Open Projects**: Open existing projects in the browser
- **Create Workflows**: Add new workflows to your projects via API
- **Authentication**: Support for both API key and username/password auth

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd pipedreammanager

# Install dependencies
npm install

# Link the CLI globally
npm link
```

## Configuration

Create a `.env` file based on the provided `.env.example`:

```bash
cp .env.example .env
```

Edit the `.env` file and set your Pipedream API key:

```
PIPEDREAM_API_KEY=your-api-key
```

You can get your API key from the [Pipedream settings page](https://pipedream.com/settings/account).

## Usage

### Create a New Project

Create a new Pipedream project:

```bash
# Create a project interactively
pdmanager new-project

# Create a project via project-after-login command with options
pdmanager create-project -u your-email -p your-password -n "My Project"
```

This command will:
1. Log in to Pipedream with your credentials
2. Navigate to the projects page
3. Create a new project with the specified name
4. Extract the project ID from the URL
5. Create a local project directory with a config.ini file

### Create a Workflow

Create a new workflow in a project:

```bash
# Create from within a project directory
pdmanager create-workflow --name "My API Workflow"

# Create with explicit project ID
pdmanager create-workflow --project proj_abc123 --name "My API Workflow"

# Create with description
pdmanager create-workflow --name "My API Workflow" --description "Handles API requests"

# Create with HTTP webhook trigger
pdmanager create-workflow --name "Webhook API" --trigger http

# Create with custom HTTP path
pdmanager create-workflow --name "Custom Path API" --trigger http --trigger-path my-special-endpoint

# Create with schedule trigger
pdmanager create-workflow --name "Daily Report" --trigger schedule --schedule "0 9 * * *"
```

### Open a Pipedream Project

You can open an existing project in several ways:

```bash
# Open a project by ID using API key from .env
pdmanager open --project <project-id>

# Open a project by ID with explicit API key
pdmanager open --apiKey your-api-key --project <project-id>

# Open a project using username/password authentication
pdmanager open --username your-email --password your-password --project <project-id>

# Open a project from a directory containing config.ini
cd my-project
pdmanager open
```

## Login Methods

The CLI supports various login methods for different scenarios:

```bash
# Basic login test
pdmanager login -u your-email -p your-password

# Simple login (more reliable)
pdmanager login-simple -u your-email -p your-password

# Direct login with Auth0 support
pdmanager login-direct -u your-email -p your-password

# Targeted login based on page analysis
pdmanager login-targeted -u your-email -p your-password
```

## Diagnostics

The CLI includes some diagnostic commands for troubleshooting:

```bash
# Analyze the login page structure
pdmanager analyze-login

# Analyze the projects page structure
pdmanager analyze-projects

# Quick browser test
pdmanager quick-test
```

## Future Features

- Support for more trigger types (Email, Custom Events, etc.)
- Pull workflow configurations for local development
- Push local changes back to Pipedream
- Deploy and manage workflows
- Add actions to workflows via API