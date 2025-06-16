# GitHub Enterprise Cloud SSO CLI

A command-line tool to automate GitHub Enterprise Cloud SSO setup with Microsoft Entra ID.

## Features

- 🔐 **Easy Authentication**: Device flow authentication for both GitHub and Azure
- 🚀 **Automated Setup**: One-command SAML SSO configuration
- ✅ **Validation**: Built-in checks for configuration and prerequisites
- 🛡️ **Safe Setup**: Dry-run mode and clear warnings before making changes
- 📋 **Configuration Management**: Store and manage multiple enterprise configurations

## Installation

```bash
npm install -g ghec-sso-cli
```

## Quick Start

1. **Authenticate with both services:**
   ```bash
   ghec-sso auth login
   ```

2. **Set up SSO for your enterprise:**
   ```bash
   ghec-sso setup --enterprise mycompany --tenant mycompany.onmicrosoft.com
   ```

3. **Validate the configuration:**
   ```bash
   ghec-sso validate
   ```

## Commands

### `ghec-sso setup`

Configure SAML SSO between GitHub Enterprise Cloud and Entra ID.

```bash
ghec-sso setup [options]

Options:
  -e, --enterprise <name>   GitHub Enterprise name
  -t, --tenant <domain>     Entra ID tenant domain
  --dry-run                 Show what would be done without making changes
```

**Example:**
```bash
# Interactive setup
ghec-sso setup

# With parameters
ghec-sso setup --enterprise mycompany --tenant mycompany.onmicrosoft.com

# Dry run to see what would happen
ghec-sso setup --enterprise mycompany --tenant mycompany.onmicrosoft.com --dry-run
```

### `ghec-sso auth`

Manage authentication with GitHub and Azure.

```bash
# Login to both services
ghec-sso auth login

# Check authentication status
ghec-sso auth status

# Clear stored authentication
ghec-sso auth logout
```

### `ghec-sso validate`

Validate current SSO setup and configuration.

```bash
# Validate current enterprise
ghec-sso validate

# Validate specific enterprise
ghec-sso validate --enterprise mycompany
```

## Prerequisites

### Required Permissions

**GitHub:**
- Enterprise Owner role on the GitHub Enterprise account
- Access to the root admin account (before SSO is enabled)

**Azure/Entra ID:**
- Global Administrator or Application Administrator role
- Ability to create Enterprise Applications
- Access to download certificates and configure SAML

### Required Information

- GitHub Enterprise name/slug
- Entra ID tenant domain (e.g., `company.onmicrosoft.com`)
- Admin access to both platforms

## Authentication

The CLI uses device flow authentication for the best user experience:

1. **GitHub**: Uses OAuth device flow (same as GitHub CLI)
2. **Azure**: Attempts to use Azure CLI credentials first, falls back to device flow

No need to manage personal access tokens or application secrets!

## What It Does

The setup process will:

1. **Create Entra ID Enterprise Application** from the GitHub gallery
2. **Configure SAML settings** with the correct URLs and claims
3. **Download SAML certificate** from Entra ID
4. **Configure GitHub Enterprise SSO** with the certificate and endpoints
5. **Test the configuration** to ensure it's working

## Important Warnings

⚠️ **Before running setup:**

- This will configure SSO for your entire GitHub Enterprise
- Ensure you have admin access to both GitHub and Entra ID
- Users will need to be provisioned through Entra ID after setup
- Make sure you have recovery access to your GitHub Enterprise

⚠️ **After setup:**

- Add users/groups to the Entra ID Enterprise Application
- Users will need to authenticate via Entra ID to access GitHub
- Keep your SAML certificate up to date

## Configuration Storage

Configuration is stored locally using the `conf` package:

- **Windows**: `%APPDATA%\ghec-sso-cli\config.json`
- **macOS**: `~/Library/Preferences/ghec-sso-cli/config.json`  
- **Linux**: `~/.config/ghec-sso-cli/config.json`

## Troubleshooting

### Common Issues

**"Cannot access enterprise"**
- Verify you're signed in with the root admin account
- Check that the enterprise name is correct
- Ensure you have Enterprise Owner permissions

**"Authentication failed"**
- Try `ghec-sso auth logout` followed by `ghec-sso auth login`
- Check your internet connection
- Verify you have the required permissions

**"SAML configuration test failed"**
- This is often normal immediately after setup
- Manual verification in the GitHub admin panel is recommended
- Allow a few minutes for configuration to propagate

### Getting Help

1. **Check configuration**: `ghec-sso validate`
2. **Check authentication**: `ghec-sso auth status`
3. **View logs**: Configuration and errors are logged locally
4. **Manual verification**: Always verify SSO works in the GitHub admin panel

## Development

```bash
# Clone and install dependencies
git clone <repository>
cd ghec-sso-setup
npm install

# Build the project
npm run build

# Run in development mode
npm run dev

# Run tests
npm test
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Security

This tool handles authentication tokens and certificates. Always:
- Keep your system updated
- Don't share configuration files
- Use the logout command when done
- Verify any changes in the admin portals

---

**Note**: This tool automates the manual process described in the [Microsoft Learn documentation](https://learn.microsoft.com/en-us/entra/identity/saas-apps/github-tutorial). Always verify your setup in both the GitHub and Entra ID admin portals after running the tool.
