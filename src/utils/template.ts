import * as fs from 'fs';
import * as path from 'path';
import { marked } from 'marked';
import chalk from 'chalk';
import { getBaseUrls } from '../utils/envUrls';

interface TemplateVariables {
  [key: string]: string;
}

export class TemplateProcessor {
  private templateDir: string;

  constructor() {
    // Get the template directory relative to the built dist folder
    this.templateDir = path.join(__dirname, '..', '..', 'templates');
  }

  /**
   * Process a template file by replacing placeholders with actual values
   */
  async processTemplate(templateName: string, variables: TemplateVariables): Promise<string> {
    try {
      const templatePath = path.join(this.templateDir, templateName);
      
      if (!fs.existsSync(templatePath)) {
        throw new Error(`Template file not found: ${templatePath}`);
      }

      let content = fs.readFileSync(templatePath, 'utf-8');
      
      // Replace all {{VARIABLE}} placeholders with actual values
      for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{{${key}}}`;
        content = content.replace(new RegExp(placeholder, 'g'), value);
      }

      return content;
    } catch (error: any) {
      throw new Error(`Failed to process template ${templateName}: ${error.message}`);
    }
  }  /**
   * Generate HTML setup plan file
   */
  async generateHtmlSetupPlan(
    enterpriseName: string,
    domain: string = 'common',
    ssoType: string = 'saml',
    outputPath?: string,
    envType: 'github.com' | 'ghe.com' = 'github.com'
  ): Promise<string> {
    // Use centralized helper for base URLs
    const { web, api } = getBaseUrls(envType, enterpriseName);
    const templateName = ssoType === 'oidc' ? 'oidc-setup-plan.md' : 'saml-setup-plan.md';
    const templateContent = await this.processTemplate(templateName, {
      DATE: new Date().toLocaleString(),
      ENTERPRISE_NAME: enterpriseName,
      DOMAIN: domain === 'common' ? 'your organization domain (e.g., company.onmicrosoft.com)' : domain,
      SSO_TYPE: ssoType.toUpperCase(),
      ENV_TYPE: envType,
      DISPLAY_NAME: `GitHub Enterprise ${ssoType.toUpperCase()} SSO - ${enterpriseName}`,
      ENTITY_ID: `${web}/enterprises/${enterpriseName}`,
      REPLY_URL: `${web}/enterprises/${enterpriseName}/saml/consume`,
      SIGN_ON_URL: `${web}/enterprises/${enterpriseName}/sso`,
      LOGOUT_URL: `${web}/enterprises/${enterpriseName}/saml/sls`,
      GITHUB_SAML_URL: `${web}/enterprises/${enterpriseName}/settings/saml_provider/edit`,
      GITHUB_TOKEN_URL: `${web}/settings/tokens/new?scopes=scim:enterprise&description=SCIM%20Token`,
      GITHUB_SSO_CONFIG_URL: `${web}/enterprises/${enterpriseName}/settings/single_sign_on_configuration`,
      SCIM_ENDPOINT: `${api}/scim/v2/enterprises/${enterpriseName}/`
    });

    // Convert to HTML
    const htmlContent = this.convertToHtml(templateContent, `GitHub Enterprise SSO Setup Plan - ${enterpriseName}`);

    // Determine output path
    if (!outputPath) {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      outputPath = path.join(process.cwd(), `github-sso-setup-plan-${enterpriseName}-${timestamp}.html`);
    }

    // Write the HTML file
    fs.writeFileSync(outputPath, htmlContent, 'utf-8');
    
    return outputPath;
  }
  /**
   * Generate a default output filename for HTML setup plans
   */
  getDefaultHtmlFilename(enterpriseName: string): string {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    return `github-sso-setup-plan-${enterpriseName}-${timestamp}.html`;
  }

  /**
   * Get the user's desktop directory for saving files
   */
  getDesktopPath(): string {
    const os = require('os');
    return path.join(os.homedir(), 'Desktop');
  }

  /**
   * Generate HTML setup plan to user's desktop
   */
  async generateHtmlSetupPlanToDesktop(
    enterpriseName: string,
    domain: string = 'common',
    ssoType: string = 'saml',
    envType: 'github.com' | 'ghe.com' = 'github.com'
  ): Promise<string> {
    const filename = this.getDefaultHtmlFilename(enterpriseName);
    const desktopPath = this.getDesktopPath();
    const fullPath = path.join(desktopPath, filename);
    try {
      await this.generateHtmlSetupPlan(enterpriseName, domain, ssoType, fullPath, envType);
      return fullPath;
    } catch (error) {
      // Fallback to current directory if desktop is not accessible
      const fallbackPath = path.join(process.cwd(), filename);
      console.log(chalk.yellow('Could not save to desktop, trying current directory...'));
      await this.generateHtmlSetupPlan(enterpriseName, domain, ssoType, fallbackPath, envType);
      return fallbackPath;
    }
  }
  /**
   * Convert template content to HTML with styling
   */
  convertToHtml(content: string, title: string = 'GitHub Enterprise SSO Setup Plan'): string {
    const htmlContent = marked(content);
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
            background-color: #fff;
        }
        
        h1 {
            color: #2c3e50;
            border-bottom: 3px solid #3498db;
            padding-bottom: 10px;
            margin-bottom: 30px;
        }
        
        h2 {
            color: #34495e;
            border-bottom: 2px solid #ecf0f1;
            padding-bottom: 8px;
            margin-top: 40px;
            margin-bottom: 20px;
        }
        
        h3 {
            color: #2980b9;
            margin-top: 30px;
            margin-bottom: 15px;
        }
        
        code {
            background-color: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 3px;
            padding: 2px 6px;
            font-family: 'Monaco', 'Consolas', 'Courier New', monospace;
            font-size: 0.9em;
        }
        
        pre {
            background-color: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 5px;
            padding: 15px;
            overflow-x: auto;
            margin: 15px 0;
        }
        
        pre code {
            background: none;
            border: none;
            padding: 0;
        }
        
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 20px 0;
            background-color: #fff;
        }
        
        th, td {
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
        }
        
        th {
            background-color: #f2f2f2;
            font-weight: 600;
            color: #2c3e50;
        }
        
        tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        
        ul, ol {
            margin: 15px 0;
            padding-left: 30px;
        }
        
        li {
            margin: 8px 0;
        }
        
        blockquote {
            border-left: 4px solid #3498db;
            padding-left: 20px;
            margin: 20px 0;
            background-color: #f8f9fa;
            padding: 15px 20px;
            border-radius: 0 5px 5px 0;
        }
        
        .checkbox-list {
            list-style: none;
            padding-left: 0;
        }
        
        .checkbox-list li {
            margin: 10px 0;
            padding-left: 25px;
            position: relative;
        }
        
        .checkbox-list li:before {
            content: '☐';
            position: absolute;
            left: 0;
            font-size: 16px;
            color: #7f8c8d;
        }
        
        .note {
            background-color: #e8f4fd;
            border-left: 4px solid #3498db;
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 5px 5px 0;
        }
        
        .warning {
            background-color: #fef9e7;
            border-left: 4px solid #f39c12;
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 5px 5px 0;
        }
        
        @media (max-width: 768px) {
            body {
                padding: 15px;
            }
            
            table {
                font-size: 14px;
            }
            
            th, td {
                padding: 8px;
            }
        }
        
        @media print {
            body {
                max-width: none;
                padding: 0;
            }
            
            h1, h2, h3 {
                page-break-after: avoid;
            }
            
            table, blockquote, pre {
                page-break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    ${htmlContent}
</body>
</html>`;
  }
}
