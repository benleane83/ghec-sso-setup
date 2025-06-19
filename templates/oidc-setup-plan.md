# GitHub Enterprise OIDC SSO Setup Plan

**Generated on:** {{DATE}}  
**Enterprise:** {{ENTERPRISE_NAME}}  
**Domain:** {{DOMAIN}}  
**SSO Type:** {{SSO_TYPE}}

## Overview

This plan will guide you through setting up OIDC SSO between your GitHub Enterprise ({{ENTERPRISE_NAME}}) and Microsoft Entra ID (Azure AD) using OpenID Connect (OIDC) protocol.

## Prerequisites

- [ ] GitHub Enterprise Owner permissions for `{{ENTERPRISE_NAME}}`
- [ ] Microsoft Entra ID Global Administrator or Application Administrator permissions

## Phase 1: Create Entra ID OIDC Application

### Step 1: Access Azure Portal
1. In the Azure portal, navigate to [**Microsoft Entra ID** > **Enterprise applications**](https://portal.azure.com/#view/Microsoft_AAD_IAM/StartboardApplicationsMenuBlade/~/AppAppsPreview)
2. Sign in with your Azure administrator account if prompted

### Step 2: Create New Application
1. Click **+ New application**
2. Use **Search application** to search for **GitHub Enterprise Managed User (OIDC)** in the gallery
3. Enter a name of **{{DISPLAY_NAME}}** for your application
4. Click **Create**

### Step 3: Configure Single Sign-On (Optional - for additional configuration)
1. In your new application, navigate to **Single sign-on** in the left menu
2. Select **OIDC** as the single sign-on method if prompted
3. Note: The OIDC application is primarily for user provisioning; GitHub Enterprise OIDC SSO is configured directly in GitHub

### Step 4: Assign Users
1. Navigate to **Users and groups** in the left menu
2. Click **+ Add user/group**
3. Assign users or groups who should have access to GitHub Enterprise
4. Select appropriate roles (Enterprise Owner or User)

## Phase 2: Configure SCIM User Provisioning

The main purpose of the OIDC application in Entra ID is to enable automatic user provisioning via SCIM.

### Step 1: Create SCIM Token in GitHub
1. Open your browser and navigate to: **{{GITHUB_TOKEN_URL}}**
2. Click **Generate token**, accepting all default settings provided
3. **Important:** Copy and save this token securely - you won't be able to see it again

### Step 2: Configure Provisioning in Entra ID
1. In your GitHub Enterprise Managed User (OIDC) application, navigate to **Provisioning**
2. Set **Provisioning Mode** to **Automatic**
3. Under **Admin Credentials**, configure:
   - **Tenant URL:** `{{SCIM_ENDPOINT}}`
   - **Secret Token:** [Paste the GitHub personal access token you created]
4. Click **Test Connection** to verify connectivity
5. Click **Save**

### Step 3: Start Provisioning
1. Open or refresh the **Provisioning** page within the left menu
2. Set **Provisioning Status** to **On**
2. Click **Save**
3. Initial synchronization will begin automatically

## Phase 3: GitHub Enterprise OIDC Configuration

**Note:** GitHub Enterprise OIDC SSO configuration is done directly in GitHub, not through the Entra ID application.

### Step 1: Configure OIDC in GitHub Enterprise

**Prerequisites:**
- You must be signed in as the setup user for your enterprise with your root admin account (ends with _admin)
- The setup user must have Global Administrator rights in Entra ID to consent to the application installation

**Configuration Steps:**

1. **Enable OIDC Configuration**
   - Open your browser and navigate to: **{{GITHUB_SSO_CONFIG_URL}}**
   - Under **"OIDC single sign-on"**, select **Enable OIDC configuration**
   - Click **Save** to continue setup and be redirected to Entra ID

2. **Complete Entra ID Integration**
   - GitHub will redirect you to your IdP (Entra ID)
   - Sign in to Entra ID with your administrator account
   - Follow the instructions to give consent and install the **GitHub Enterprise Managed User (OIDC)** application
   - When Entra ID asks for permissions for GitHub Enterprise Managed Users with OIDC:
     - Enable **"Consent on behalf of your organization"**
     - Click **Accept**

   **⚠️ Important:** You must sign in to Entra ID as a user with **global admin rights** in order to consent to the installation of the GitHub Enterprise Managed User (OIDC) application.

3. **Save Recovery Codes**
   - To ensure you can still access your enterprise if your IdP is unavailable in the future:
   - Click **Download**, **Print**, or **Copy** to save your recovery codes
   - Store these codes in a secure location

5. **Enable OIDC Authentication**
   - Click **Enable OIDC Authentication** to complete the setup

**Important Notes:**
- OIDC does not support IdP-initiated authentication
- Each Entra ID tenant can support only one OIDC integration with Enterprise Managed Users
- If you want to connect Entra ID to more than one enterprise on GitHub, use SAML instead
- This is a one-click setup process with certificates managed automatically by GitHub and your IdP

## Verification Checklist
- [ ] Users can sign in to GitHub Enterprise using their organizational credentials
- [ ] SSO is redirecting to the correct Entra ID login page
- [ ] After Entra ID authentication, users are properly redirected to GitHub

## Troubleshooting

### Common Issues
1. **Certificate mismatch:** Ensure the certificate copied from Azure matches exactly
2. **URL configuration:** Verify all URLs are copied correctly without extra spaces
3. **Permissions:** Ensure users have proper permissions in both systems

## Additional Resources

- [GitHub Enterprise Managed Users Documentation](https://docs.github.com/enterprise-cloud@latest/admin/authentication/managing-your-enterprise-users-with-your-identity-provider/about-enterprise-managed-users)
- [GitHub OIDC with Entra ID Tutorial](https://learn.microsoft.com/en-us/entra/identity/saas-apps/github-enterprise-managed-user-oidc-provisioning-tutorial)
- [GitHub OIDC Configuration Guide](https://docs.github.com/en/enterprise-cloud@latest/admin/managing-iam/configuring-authentication-for-enterprise-managed-users/configuring-oidc-for-enterprise-managed-users)

---

**Note:** This plan was generated automatically. Always verify current Microsoft and GitHub documentation for the most up-to-date procedures.
