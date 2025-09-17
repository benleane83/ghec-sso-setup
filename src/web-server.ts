
import express from 'express';
import path from 'path';
import { TemplateProcessor } from './utils/template';
import appInsights from 'applicationinsights';

// Initialize Application Insights if INSTRUMENTATION_KEY or CONNECTION_STRING is set
const aiKey = process.env.APPINSIGHTS_INSTRUMENTATIONKEY || process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
let aiClient = undefined;
if (aiKey) {
    appInsights.setup(aiKey)
        .setAutoCollectConsole(true, true)
        .setSendLiveMetrics(false)
        .start();
    console.log('Application Insights enabled');
    aiClient = appInsights.defaultClient;
}

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve the main HTML page
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GitHub Enterprise SSO Setup Plan Generator</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            overflow: hidden;
        }
        
        .header {
            background: #2c3e50;
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.2rem;
            margin-bottom: 10px;
        }
        
        .header p {
            opacity: 0.9;
            font-size: 1.1rem;
        }
        
        .form-container {
            padding: 40px;
        }
        
        .form-group {
            margin-bottom: 25px;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #2c3e50;
        }
        
        .required {
            color: #e74c3c;
        }
        
        input[type="text"],
        select {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid #ecf0f1;
            border-radius: 6px;
            font-size: 16px;
            transition: border-color 0.3s ease;
        }
        
        input[type="text"]:focus,
        select:focus {
            outline: none;
            border-color: #3498db;
        }
        
        .form-help {
            font-size: 0.9rem;
            color: #7f8c8d;
            margin-top: 5px;
        }
        
        .generate-btn {
            width: 100%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 15px;
            font-size: 1.1rem;
            font-weight: 600;
            border-radius: 6px;
            cursor: pointer;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        
        .generate-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
        
        .generate-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
        
        .loading {
            display: none;
            text-align: center;
            margin-top: 20px;
        }
        
        .loading.show {
            display: block;
        }
        
        .spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .footer {
            padding: 20px 40px;
            background: #f8f9fa;
            border-top: 1px solid #ecf0f1;
            font-size: 0.9rem;
            color: #7f8c8d;
            text-align: center;
        }
        
        .footer a {
            color: #3498db;
            text-decoration: none;
        }
        
        .footer a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 SSO Setup Plan Generator</h1>
            <p>Generate custom setup plans for GitHub Enterprise Cloud SSO</p>
        </div>
        
        <div class="form-container">
            <form id="sso-form">
                <div class="form-group">
                    <label for="enterpriseName">Enterprise Name <span class="required">*</span></label>
                    <input type="text" id="enterpriseName" name="enterpriseName" required 
                           placeholder="my-company">
                    <div class="form-help">
                        GitHub Enterprise slug (e.g., for /enterprises/my-company, use "my-company")
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="ssoType">SSO Type <span class="required">*</span></label>
                    <select id="ssoType" name="ssoType" required>
                        <option value="saml" selected>SAML</option>
                        <option value="oidc">OIDC</option>
                    </select>
                    <div class="form-help">
                        Protocol type for Single Sign-On
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="envType">Environment Type <span class="required">*</span></label>
                    <select id="envType" name="envType" required>
                        <option value="github.com" selected>github.com</option>
                        <option value="ghe.com">ghe.com (GitHub Enterprise with Data Residency)</option>
                    </select>
                    <div class="form-help">
                        Target GitHub environment
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="domain">Domain (Optional)</label>
                    <input type="text" id="domain" name="domain" 
                           placeholder="company.onmicrosoft.com">
                    <div class="form-help">
                        Your organization's Entra domain (leave blank for common/default tenant)
                    </div>
                </div>
                
                <button type="submit" class="generate-btn" id="generateBtn">
                    Generate Setup Plan
                </button>
                
                <div class="loading" id="loading">
                    <div class="spinner"></div>
                    <span style="margin-left: 10px;">Generating your setup plan...</span>
                </div>
            </form>
        </div>
        
        <div class="footer">
            Powered by <a href="https://github.com/benleane83/ghec-sso-setup" target="_blank">GHEC SSO CLI</a>
        </div>
    </div>

    <script>
        document.getElementById('sso-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const generateBtn = document.getElementById('generateBtn');
            const loading = document.getElementById('loading');
            
            // Show loading state
            generateBtn.disabled = true;
            loading.classList.add('show');
            
            try {
                const formData = new FormData(this);
                const data = Object.fromEntries(formData.entries());
                
                const response = await fetch('/api/generate-plan', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data)
                });
                
                if (!response.ok) {
                    throw new Error('Failed to generate plan');
                }
                
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'setup-plan.html';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
            } catch (error) {
                alert('Error generating plan: ' + error.message);
            } finally {
                // Hide loading state
                generateBtn.disabled = false;
                loading.classList.remove('show');
            }
        });
    </script>
</body>
</html>
  `);
});

// API endpoint to generate the setup plan
app.post('/api/generate-plan', async (req, res) => {
    try {
        const { enterpriseName, ssoType, envType, domain } = req.body;

        // Validate required fields
        if (!enterpriseName || !ssoType || !envType) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Validate field values
        if (!['saml', 'oidc'].includes(ssoType)) {
            return res.status(400).json({ error: 'Invalid SSO type' });
        }

        if (!['github.com', 'ghe.com'].includes(envType)) {
            return res.status(400).json({ error: 'Invalid environment type' });
        }

        const templateProcessor = new TemplateProcessor();

        // Generate HTML content using the same logic as CLI
        const htmlContent = await templateProcessor.generateHtmlSetupPlanContent(
            enterpriseName,
            domain || 'common',
            ssoType,
            envType as 'github.com' | 'ghe.com'
        );

        // Log event to Application Insights if enabled
        if (aiClient) {
            aiClient.trackEvent({
                name: 'PlanGenerated',
                properties: {
                    enterpriseName,
                    ssoType,
                    envType,
                    domain: domain || 'common',
                    timestamp: new Date().toISOString(),
                    source: 'web-server'
                }
            });
        }

        // Create filename
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
        const filename = `github-sso-setup-plan-${enterpriseName}-${timestamp}.html`;

        // Set headers for file download
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        // Send the HTML content
        res.send(htmlContent);

    } catch (error: any) {
        console.error('Error generating plan:', error);
        res.status(500).json({ error: 'Failed to generate setup plan: ' + error.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`🌐 SSO Setup Plan Generator is running at http://localhost:${port}`);
  console.log(`📋 Generate setup plans through the web interface`);
  console.log(`🏥 Health check available at http://localhost:${port}/health`);
});