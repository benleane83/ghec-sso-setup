# GitHub Enterprise {{SSO_TYPE}} SSO Setup Plan

**Generated on:** {{DATE}}  
**Enterprise:** {{ENTERPRISE_NAME}}  
**Domain:** {{DOMAIN}}  
**SSO Type:** {{SSO_TYPE}}

## Overview

This plan will guide you through setting up {{SSO_TYPE}} SSO between your GitHub Enterprise ({{ENTERPRISE_NAME}}) and Microsoft Entra ID (Azure AD).

## Prerequisites

- [ ] GitHub Enterprise Owner permissions for `{{ENTERPRISE_NAME}}`
- [ ] Microsoft Entra ID Global Administrator or Application Administrator permissions

## Phase 1: Create Entra ID Enterprise Application

### Step 1: Access Azure Portal
1. In the Azure portal, navigate to [**Microsoft Entra ID** > **Enterprise applications**](https://portal.azure.com/#view/Microsoft_AAD_IAM/StartboardApplicationsMenuBlade/~/AppAppsPreview)
2. Sign in with your Azure administrator account if prompted

### Step 2: Create New Application
1. Click **+ New application**
2. Use **Search application** to search for **GitHub Enterprise Managed User** in the gallery
3. Enter a name of **{{DISPLAY_NAME}}** for your application
4. Click **Create**

### Step 3: Configure Single Sign-On
1. In your new application, navigate to **Single sign-on** in the left menu
2. Select **SAML** as the single sign-on method
3. Click **Edit** on the "Basic SAML Configuration" section
4. Configure the following fields:

   **Identifier (Entity ID):**
   ```
   {{ENTITY_ID}}
   ```

   **Reply URL (Assertion Consumer Service URL):**
   ```
   {{REPLY_URL}}
   ```

   **Sign on URL:**
   ```
   {{SIGN_ON_URL}}
   ```

5. Click **Save**

### Step 4: Download Certificate
1. In the "SAML Signing Certificate" section, download the **Certificate (Base64)**
2. Save this file - you'll need it for GitHub configuration

### Step 5: Note SAML URLs (You'll need these for GitHub)
Copy the following URLs from the "Set up {{DISPLAY_NAME}}" section:
- **Login URL**
- **Microsoft Entra Identifier** 

### Step 6: Assign Users
1. Navigate to **Users and groups** in the left menu
2. Click **+ Add user/group**
3. Assign users or groups who should have access to GitHub Enterprise
4. Select appropriate roles (Enterprise Owner or User)

## Phase 2: Configure GitHub Enterprise SAML

### Step 1: Enable SAML Authentication
1. Open your browser and navigate to: **{{GITHUB_SAML_URL}}**
2. Configure the following fields:

   **Sign-on URL:**
   ```
   [Use the Login URL from Entra ID]
   ```

   **Issuer:**
   ```
   [Use the Microsoft Entra Identifier from Entra ID]
   ```

   **Public Certificate:**
   ```
   [Paste the contents of the Base64 certificate from Entra ID]
   ```

### Step 2: Test SAML Configuration
1. Click **Test SAML configuration**
2. You should be redirected to Entra ID for authentication
3. After successful authentication, you'll be redirected back to GitHub
4. If the test succeeds, click **Save SAML settings**

## Phase 3: SCIM User Provisioning

To automatically provision users from Entra ID to GitHub Enterprise:

### Step 1: Create SCIM Token
1. Open your browser and navigate to: **{{GITHUB_TOKEN_URL}}**
2. Click **Generate token**, accepting all default settings provided
4. Copy the token value when displayed on the next screen

### Step 2: Configure Provisioning in Entra ID
1. Return to your Azure portal and your GitHub Enterprise application
2. Navigate to **Provisioning** in the left menu
3. On the next screen, navigate to **Provisioning** under Manage on the left menu
4. Set **Provisioning Mode** to **Automatic**
5. In the **Admin Credentials** section, configure:
   - **Tenant URL:** `{{SCIM_ENDPOINT}}`
   - **Secret Token:** [The SCIM token from GitHub Step 1]
6. Click **Test Connection** to verify
7. Click **Save**

### Step 3: Start Provisioning
1. Open or refresh the **Provisioning** page within the left menu
2. Set **Provisioning Status** to **On**
2. Click **Save**
3. Initial synchronization will begin automatically

## Verification Checklist
- [ ] Users can sign in to GitHub Enterprise using their organizational credentials
- [ ] SSO is redirecting to the correct Entra ID login page
- [ ] After Entra ID authentication, users are properly redirected to GitHub

## Troubleshooting

### Common Issues
1. **Certificate mismatch:** Ensure the certificate copied from Azure matches exactly
2. **URL configuration:** Verify all URLs are copied correctly without extra spaces
3. **Permissions:** Ensure users have proper permissions in both systems

### Support Resources
- **GitHub Enterprise Support:** https://support.github.com/
- **Microsoft Entra ID Documentation:** https://docs.microsoft.com/en-us/azure/active-directory/
- **GitHub Enterprise SAML Documentation:** https://docs.github.com/en/enterprise-cloud@latest/admin/identity-and-access-management/using-saml-for-enterprise-iam

## Important URLs for Reference

- **Azure Portal:** https://portal.azure.com
- **GitHub Enterprise Admin:** https://github.com/enterprises/{{ENTERPRISE_NAME}}/settings
- **Entra ID Enterprise Apps:** https://portal.azure.com/#view/Microsoft_AAD_IAM/StartboardApplicationsMenuBlade/~/AppAppsPreview

---

**Note:** This plan was generated automatically. Always verify current Microsoft and GitHub documentation for the most up-to-date procedures.
