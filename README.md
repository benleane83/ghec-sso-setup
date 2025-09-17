# GitHub Enterprise Cloud SSO CLI

[![Latest Release](https://img.shields.io/github/v/release/benleane83/ghec-sso-setup?style=for-the-badge&logo=github)](https://github.com/benleane83/ghec-sso-setup/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/benleane83/ghec-sso-setup/total?style=for-the-badge&logo=github)](https://github.com/benleane83/ghec-sso-setup/releases)
[![Build Status](https://img.shields.io/github/actions/workflow/status/benleane83/ghec-sso-setup/build-release.yml?style=for-the-badge&logo=github-actions)](https://github.com/benleane83/ghec-sso-setup/actions)

A command-line tool to automate GitHub Enterprise Cloud SSO setup with Microsoft Entra ID.

## 🚀 Features

- 🏢 **Automated Entra ID Setup**: Creates and configures GitHub Enterprise Managed User application
- 🔧 **SAML Configuration**: Automates SAML settings, certificates, and URLs in Entra ID
- 👥 **User Assignment**: Automatically assigns current user with Enterprise Owner role
- 📋 **GitHub SAML Activation**: Provides exact values and opens GitHub SAML settings page
- 📋 **OIDC Mode**: Provides instructions to enable OIDC SSO (semi-manual)
- 🔄 **SCIM Provisioning**: Guides user to configure automatic user provisioning (currently manual)
- ✅ **Validation**: Built-in checks for enterprise access and prerequisites
- 🛡️ **Safe Setup**: Plan mode and confirmation prompts for critical actions
- 🌐 **Web Interface**: Simple web UI for generating setup plans without CLI

This tool automates the complex process described in [Microsoft's GitHub Enterprise SSO documentation](https://learn.microsoft.com/en-us/entra/identity/saas-apps/github-tutorial). Always verify your configuration in both GitHub and Entra ID admin portals after setup.

## Installation

### 🚀 Method 1: Standalone Executable (Recommended)

**📦 [Download Latest Release →](https://github.com/benleane83/ghec-sso-setup/releases/latest)**

1. Go to [Releases](https://github.com/benleane83/ghec-sso-setup/releases/latest)
2. Download `ghec-sso.exe`
3. Save it anywhere (e.g., Desktop, Downloads)
4. Open Command Prompt or PowerShell where you saved the file
5. Run: `.\ghec-sso.exe --help`

### Method 2: Install from GitHub
```bash
# Install directly from GitHub repository
npm install -g git+https://github.com/benleane83/ghec-sso-setup.git
```

#### Prerequisites
- **Node.js 16 or higher** - [Download here](https://nodejs.org/)
- **Git** (for GitHub installation method) - [Download here](https://git-scm.com/)

### Method 2: Clone and Install (Alternative)
```bash
# Clone the repository
git clone https://github.com/benleane83/ghec-sso-setup.git
cd ghec-sso-setup

# Install dependencies and build
npm install
npm run build

# Install globally
npm install -g .
```

### Verify Installation
```bash
# Check if the tool is installed correctly
ghec-sso --help

# Check version
ghec-sso --version
```

### Update the Tool
```bash
# To update to the latest version
npm uninstall -g ghec-sso-cli
npm install -g git+https://github.com/benleane83/ghec-sso-setup.git
```

## Quick Start

1. **Authenticate with Azure:**
   ```bash
   ghec-sso auth login
   ```

2. **Set up SSO for your enterprise:**
   ```bash
   ghec-sso setup --enterprise mycompany --domain mycompany.onmicrosoft.com
   ```

3. **Follow the interactive prompts for SCIM setup after GitHub SSO is configured**

## 🌐 Web Interface

For users who prefer a web interface over command line, this tool also provides a simple web UI for generating setup plans.

### Features
- Clean, responsive web interface
- Form validation for all required fields  
- Support for both SAML and OIDC SSO types
- Support for both github.com and ghe.com environments
- Automatic HTML file generation and download
- Same setup plan generation logic as the CLI

### Running the Web Interface

**Local Development:**
```bash
# Start the web server
npm run start:web

# Development mode with auto-reload
npm run dev:web
```

The web interface will be available at `http://localhost:3000`

**Azure Web App Deployment:**
See [WEB-DEPLOYMENT.md](WEB-DEPLOYMENT.md) for detailed deployment instructions to Azure Web App.

### Web UI Screenshots

![Web UI Form](https://github.com/user-attachments/assets/e16ebaae-2b71-4ff9-a837-9850d20f69d0)

## Commands

### `ghec-sso setup`

Automate Entra ID configuration and guide GitHub SSO setup.

```bash
ghec-sso setup [options]

Options:
  -e, --enterprise <name>   GitHub Enterprise name (e.g. for /enterprises/my-company, use my-company)
  -d, --domain <domain>     Organization domain (optional, e.g. company.onmicrosoft.com)
  --plan                    Generate a HTML plan document with customized instructions for configuration
  --plan-output <path>      Custom output path for the setup plan (only with --plan)
  --ssoType <type>          SSO protocol type: saml (default) or oidc
  --envType <type>          GitHub environment type: github.com (default) or ghe.com

```

**What it does:**
1. ✅ Validates access
2. 🏢 Creates GitHub Enterprise Managed User app in Entra ID
3. ⚙️ Configures SAML settings (URLs, certificates, claims)
4. 👤 Assigns current user as Enterprise Owner
5. 📋 Outputs SAML values for manual GitHub configuration
6. 🌐 Opens GitHub Enterprise SAML settings page

**Example:**
```bash
# Interactive setup
ghec-sso setup

# With parameters  
ghec-sso setup --enterprise mycompany

# Plan mode to generate a customized plan for the setup
ghec-sso setup --enterprise mycompany --plan

```

### `ghec-sso auth`

Manage authentication with Azure.

```bash
# Login to Azure
ghec-sso auth login

# Check authentication status and show enterprise access
ghec-sso auth status

# Clear stored authentication
ghec-sso auth logout
```

### `ghec-sso validate`

Validate enterprise access and SSO prerequisites.
Only supports SAML SSO currently and not OIDC.

```bash
# Validate specific enterprise  
ghec-sso validate --enterprise mycompany
```

## Prerequisites

### Required Permissions

**Azure/Entra ID:**
- Global Administrator or Application Administrator role
- Permission to create Enterprise Applications
- Permission to configure SSO and provisioning

### Required Information

- GitHub Enterprise name (e.g., `mycompany`)
- Admin access to Entra ID

## Authentication

The CLI uses different authentication methods optimized for enterprise access:

1. **Azure**: Device flow or Azure CLI credentials
   - Attempts Azure CLI first for seamless experience
   - Falls back to device flow authentication

## What the Setup Process Does

### Automated SAML Configuration in Entra ID:
1. 🔍 **Finds GitHub Enterprise Managed User template** in application gallery
2. 🏢 **Creates Enterprise Application** with proper naming
3. ⚙️ **Configures SAML settings:**
   - Entity ID: `https://github.com/enterprises/{enterprise}`
   - Reply URL: `https://github.com/enterprises/{enterprise}/saml/consume`
   - Sign-on URL: `https://github.com/enterprises/{enterprise}/sso`
4. 🔐 **Generates SAML signing certificate**
5. 👤 **Assigns current user with Enterprise Owner role**
6. 📋 **Extracts SAML configuration values**
7. 🌐 **Opens GitHub Enterprise SAML settings page** automatically
8. 📋 **Provides exact values** to copy into GitHub:
   - Sign-On URL
   - Issuer (Entity ID)  
   - Certificate (Base64)

**OR**

### Semi-Manual OIDC Configuration in Entra ID:
1. 🌐 **Opens GitHub OIDC SSO configuration page** automatically
2. 🏢 **Prompts user to complete OIDC link**

### Manual SCIM Provisioning:
11. 🔄 **Configure SCIM provisioning**:
    - Auto-generates SCIM endpoint: `https://api.github.com/scim/v2/enterprises/{enterprise}/`
    - Prompts user to create a SCIM token, and enable provisioning on the Entra ID app

## Important Notes

### GitHub Enterprise Types
- ✅ **GitHub Enterprise Cloud** - Fully supported (Github.com or GHE.com)
- ✅ **Trial Enterprises** - Fully supported
- ❌ **GitHub Enterprise Server** - Not supported
- ❌ **Organizations** - Not supported (use organization SAML instead)

### Security Considerations
⚠️ **Before running setup:**
- Ensure you have recovery access to GitHub Enterprise
- This configures SSO for the entire enterprise
- All users will need Entra ID accounts after setup

⚠️ **After setup:**
- Add additional users/groups to the Entra ID application
- Assign Copilot seats to users in GitHub if required

## Troubleshooting

### Authentication Issues

**"Bad credentials" or 401 errors:**
```bash
# Check current authentication
ghec-sso auth status

# Re-authenticate
ghec-sso auth logout
ghec-sso auth login
```

### Common SSO Setup Issues

**Entra ID application creation fails:**
- Verify Azure permissions (Application Administrator role)
- Check tenant settings allow enterprise app creation
- Try manual creation if automated approach fails

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Security & Privacy

This tool handles sensitive authentication data:
- 🔑 **Azure tokens** are temporary and not persisted
- 📜 **SSO certificates** are only displayed, not stored

---