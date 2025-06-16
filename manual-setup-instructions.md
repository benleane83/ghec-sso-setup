GitHub Copilot for Business Setup Guide
 
While GitHub supports multiple Identity Providers including Okta and OneLogin, these setup instructions assume usage of Microsoft Entra ID. Billing and IdP configurations are managed through separate Microsoft Entra ID Enterprise Applications. Note: While it is common to use the same Microsoft Entra ID tenant, it is not a requirement.
For new environments, an activation link for the root admin account is sent to the initially provided admin email address. After activating that account, you must login and perform the following configurations before Copilot can be used:
1.	Identity Provider Configuration (IdP): This connects your Microsoft Entra ID tenant to the GitHub Enterprise account to manage user authentication. Choose between:
•	Entra ID with OIDC: official guide 
•	Entra ID with SAML: official guide step 1 and step 2

•	Step 1 for SAML involves configuring SSO for your GitHub environment. 
In this step you’ll add a GitHub application from the Entra Application Gallery, and configure it with tenant URLs from your GitHub environment. You’ll then be asked to download an SSO certificate from the Entra app and register that within the GitHub portal. Finally you will add users or groups to your Entra app so they can be provisioned into GitHub.

•	Step 2 involves configuring SCIM provisioning for GitHub users. 
In this step you’ll create a SCIM token within the GitHub portal (follow the link from the ‘Getting Started’ page), and then configure the Provisioning workflow in the Entra app from Step 1 using that secret token. 
Note: The Tenant URL required for this will be in the format of https://api.github.com/scim/v2/enterprises/{enterprise}

2.	Azure Billing Configuration: This links your Azure subscription to the GitHub Enterprise account for the purpose of billing. See: GitHub: Connecting an Azure Subscription (official)
•	Note: This step needs to be performed by a user with Subscription Owner permissions to the Azure subscription being linked.

3.	Create Teams in GitHub and Assign Copilot Licenses
•	For GitHub Enterprise Cloud Trial accounts, you’ll need to create a new Organization under your Enterprise, and then create Teams to represent each group of users who will be licensed for Copilot.
•	For paid GitHub Copilot Standalone accounts, you’ll need to access the GitHub Enterprise Settings instead, create Teams to represent each group of users who will be licensed for Copilot
•	Once you have created your Team, add AD Groups to the created Team, and ensure these were also added to the Enterprise Application in #2
•	Assign Copilot licenses to each team member or enable automatic licensing for organizations if appropriate. For GitHub Enterprise Cloud Trial accounts this is found under the Organization Settings page: Copilot > Access.
Setup is now completed. For new licensed users, add users to the AD group in Entra ID. These users will be provisioned as a user in GitHub Enterprise and be automatically assigned a license if this was configured.
