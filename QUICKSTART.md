# Quick Start Guide

## For IT Administrators

This guide helps you set up GitHub Enterprise Cloud SAML SSO with Microsoft Entra ID using our automated CLI tool.

### What You'll Need

**Before starting:**
- [ ] Admin access to your GitHub Enterprise Cloud account
- [ ] Admin access to Microsoft Entra ID (Azure AD)
- [ ] Your GitHub Enterprise name (e.g., `mycompany`)
- [ ] Your organization domain (e.g., `mycompany.com`)

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

#### Step 1: Authenticate with GitHub
```bash
ghec-sso auth login-pat
```
- You'll be prompted to create a Personal Access Token
- Follow the link to GitHub settings
- Grant these permissions: `admin:enterprise`, `admin:org`, `repo`
- Copy and paste the token when prompted

#### Step 2: Run the automated setup
```bash
ghec-sso setup --enterprise YOUR-ENTERPRISE --domain YOUR-DOMAIN.com
```

**Example:**
```bash
ghec-sso setup --enterprise acme-corp --domain acme.com
```

#### Step 3: Complete GitHub configuration
The tool will:
- ✅ Create and configure the Entra ID application automatically
- ✅ Assign you as Enterprise Owner
- ✅ Provide SAML configuration values
- ✅ Open GitHub Enterprise SAML settings page

**Copy the displayed values into GitHub:**
- Sign-On URL
- Issuer (Entity ID)
- Certificate

#### Step 4: Set up user provisioning (optional)
The tool will pause and ask if you want to configure SCIM provisioning:
- In GitHub, enable SAML SSO and get your SCIM token
- Provide the token to the CLI
- The tool will configure automatic user provisioning

### What the Tool Does

**Automatically:**
- ✅ Creates GitHub Enterprise Managed User app in Entra ID
- ✅ Configures all SAML settings and URLs
- ✅ Generates and configures certificates
- ✅ Sets up user roles and permissions
- ✅ Configures SCIM provisioning (optional)

**Requires manual steps:**
- 📋 Copy SAML values into GitHub Enterprise settings
- 📋 Test SAML authentication
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
ghec-sso auth debug -e YOUR-ENTERPRISE

# Re-authenticate if needed
ghec-sso auth logout
ghec-sso auth login-pat
```

### Getting Help

- **View all commands:** `ghec-sso --help`
- **Check status:** `ghec-sso auth status`
- **Validate setup:** `ghec-sso validate -e YOUR-ENTERPRISE`

### Important Security Notes

⚠️ **Before enabling SSO:**
- Test SAML authentication with a few users first
- Ensure you have recovery access to GitHub Enterprise
- Keep your Personal Access Token secure

⚠️ **After setup:**
- Add users/groups to the Entra ID application
- Test user access before enforcing SSO
- Set up monitoring for authentication issues

---

**Need more help?** See the full documentation in [README.md](README.md) or [INSTALL.md](INSTALL.md)
