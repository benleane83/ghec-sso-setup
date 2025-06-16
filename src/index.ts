#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { setupCommand } from './commands/setup';
import { authCommand } from './commands/auth';
import { validateCommand } from './commands/validate';

const program = new Command();

program
  .name('ghec-sso')
  .description('CLI tool to automate GitHub Enterprise Cloud SSO setup with Entra ID')
  .version('1.0.0');

program
  .addCommand(setupCommand)
  .addCommand(authCommand)
  .addCommand(validateCommand);

program
  .configureHelp({
    sortSubcommands: true,
  })
  .showHelpAfterError();

// Show help if no command provided
if (process.argv.length === 2) {
  program.help();
}

program.parse();
