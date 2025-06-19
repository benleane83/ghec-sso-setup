# Quick Start Guide

## For IT Administrators

This guide helps you set up GitHub Enterprise Cloud SSO with Microsoft Entra ID using our automated CLI tool.

### What You'll Need

**Before starting:**
- [ ] Admin access to Microsoft Entra ID (Azure AD)
- [ ] Your GitHub Enterprise name (e.g., `mycompany`)
- [ ] Your organization's Entra domain (e.g., `mycompany.onmicrosoft.com`)

### Installation (5 minutes)

1. **Install Node.js** (if not already installed)
   - Download from [nodejs.org](https://nodejs.org/) - choose the LTS version
   - Follow the installer instructions

2. **Install the CLI tool**
   ```bash
   npm install -g git+https://github.com/benleane83/ghec-sso-setup.git
   ```

3. **Verify installation**
   ```bash
   ghec-sso --version
   ```

### Setup Process (15-20 minutes)

#### Step 1: Run the automated setup
```bash
ghec-sso setup --enterprise my-company
```

**Example:**
```bash
ghec-sso setup --enterprise acme-corp
```

#### Step 2: Complete GitHub configuration
The tool will:
- ✅ Create and configure the Entra ID application automatically
- ✅ Assign you as Enterprise Owner
- ✅ Provide SSO configuration values
- ✅ Open GitHub Enterprise SSO settings page

**Assist in copying the displayed values into GitHub:**
- Sign-On URL
- Issuer (Entity ID)
- Certificate

#### Step 3: Set up user provisioning (manual)
The tool will prompt the user to perform the following manual steps
- In GitHub, enable SSO and get your SCIM token
- Navigate to the Entra ID Application and enter the provided values to enable auto provisioning

### What the Tool Does

**Automatically:**
- ✅ Creates GitHub Enterprise Managed User app in Entra ID
- ✅ Configures all SSO settings and URLs
- ✅ Generates and configures certificates
- ✅ Sets up user roles and permissions

**Requires manual steps:**
- 📋 Copy SSO values into GitHub Enterprise settings
- 📋 Test SSO authentication
- 📋 Enable SSO enforcement when ready

### Troubleshooting

**Installation issues:**
```bash
# Try with administrator privileges
sudo npm install -g git+https://github.com/benleane83/ghec-sso-setup.git

# Or check Node.js installation
node --version
npm --version
```

**Authentication issues:**
```bash
# Check your authentication status
ghec-sso auth status

# Debug enterprise access
ghec-sso auth debug -e my-company

# Re-authenticate if needed
ghec-sso auth logout
ghec-sso auth login
```

### Getting Help

- **View all commands:** `ghec-sso --help`
- **Check status:** `ghec-sso auth status`
- **Validate setup:** `ghec-sso validate -e my-company`

### Important Security Notes

⚠️ **Before enabling SSO:**
- Test SSO authentication with a few users first
- Ensure you have recovery access to GitHub Enterprise

⚠️ **After setup:**
- Add users/groups to the Entra ID application
- Test user access before enforcing SSO
- Set up monitoring for authentication issues

---

**Need more help?** See the full documentation in [README.md](README.md) or [INSTALL.md](INSTALL.md)
