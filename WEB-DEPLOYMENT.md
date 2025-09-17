# Web UI Deployment Guide

## Overview
The Web UI provides a simple interface for generating GitHub Enterprise Cloud SSO setup plans through a web browser instead of the command line.

## Features
- Clean, responsive web interface
- Form validation for all required fields
- Support for both SAML and OIDC SSO types
- Support for both github.com and ghe.com environments
- Automatic HTML file generation and download
- Same setup plan generation logic as the CLI

## Deployment to Azure Web App

### Prerequisites
- Azure subscription
- Node.js runtime (18.x or later)

### Local Development
```bash
# Install dependencies
npm install

# Build the project
npm run build

# Start the web server
npm run start:web

# Development mode with auto-reload
npm run dev:web
```

### Azure Web App Configuration

1. **Create Azure Web App**
   - Runtime: Node.js 18.x or later
   - Operating System: Linux (recommended)

2. **Environment Variables**
   - `PORT`: Set to the port Azure provides (usually handled automatically)
   - `NODE_ENV`: production

3. **Deployment Options**

   **Option A: GitHub Actions Deployment**
   ```yaml
   # Add to .github/workflows/azure-deploy.yml
   name: Deploy to Azure Web App
   
   on:
     push:
       branches: [ main ]
   
   jobs:
     deploy:
       runs-on: ubuntu-latest
       steps:
       - uses: actions/checkout@v3
       
       - name: Setup Node.js
         uses: actions/setup-node@v3
         with:
           node-version: '18'
           
       - name: Install dependencies
         run: npm install
         
       - name: Build project
         run: npm run build
         
       - name: Deploy to Azure Web App
         uses: azure/webapps-deploy@v2
         with:
           app-name: 'your-app-name'
           publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
           package: .
   ```

   **Option B: ZIP Deployment**
   ```bash
   # Build the project
   npm run build
   
   # Create deployment package
   zip -r deployment.zip . -x "node_modules/*" ".git/*" "*.log"
   
   # Upload via Azure CLI
   az webapp deployment source config-zip \
     --resource-group myResourceGroup \
     --name myWebApp \
     --src deployment.zip
   ```

   **Option C: Docker Container**
   ```dockerfile
   # Dockerfile
   FROM node:18-alpine
   
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production
   
   COPY . .
   RUN npm run build
   
   EXPOSE 3000
   CMD ["npm", "run", "start:web"]
   ```

### Startup Command
Set the startup command in Azure Web App settings:
```bash
npm run start:web
```

### File Structure for Deployment
Ensure these files are included in your deployment:
```
├── dist/                 # Compiled TypeScript
├── templates/           # Template files
├── node_modules/        # Dependencies (if not using npm install)
├── package.json
├── package-lock.json
└── web.config          # Optional: for Windows App Service
```

### Custom Domain and SSL
- Configure custom domain in Azure Web App settings
- SSL certificates are automatically managed by Azure

### Monitoring and Logs
- Application logs are available in Azure Portal
- Set up Application Insights for detailed monitoring
- Health check endpoint: `/health`

## API Endpoints

### GET /
Main web interface for generating setup plans.

### POST /api/generate-plan
Generates and downloads setup plan HTML file.

**Request Body:**
```json
{
  "enterpriseName": "my-company",
  "ssoType": "saml",
  "envType": "github.com",
  "domain": "company.onmicrosoft.com"
}
```

**Response:**
- Content-Type: text/html
- Content-Disposition: attachment; filename="setup-plan.html"
- Body: Generated HTML setup plan

### GET /health
Health check endpoint returning service status.

## Security Considerations
- Input validation on all form fields
- No sensitive data is stored or logged
- Generated plans contain configuration templates only
- HTTPS enforced in production (Azure handles this automatically)

## Troubleshooting
- Check Application Logs in Azure Portal
- Verify Node.js version compatibility
- Ensure all template files are included in deployment
- Test locally first using `npm run dev:web`