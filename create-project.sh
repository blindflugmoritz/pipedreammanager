#!/bin/bash

# This script sets environment variables and runs pdmanager new-project

# Check if arguments are provided
if [ "$#" -lt 3 ]; then
  echo "Usage: $0 \"Project Name\" username password [api_key]"
  exit 1
fi

# Set environment variables from arguments
export PROJECT_NAME="$1"
export PIPEDREAM_USERNAME="$2" 
export PIPEDREAM_PASSWORD="$3"

# Set API key if provided
if [ "$#" -eq 4 ]; then
  export PIPEDREAM_API_KEY="$4"
fi

# Run the pdmanager new-project command
pdmanager new-project

# Unset environment variables
unset PROJECT_NAME
unset PIPEDREAM_USERNAME
unset PIPEDREAM_PASSWORD
unset PIPEDREAM_API_KEY