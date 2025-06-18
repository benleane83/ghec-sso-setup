# Installation Guide

Choose the installation method that works best for you.

## 🚀 Option 1: Standalone Executable (Recommended - No Node.js Required!)

**For Windows Users:**
1. Go to [Releases](https://github.com/benleane83/ghec-sso-setup/releases/latest)
2. Download `ghec-sso-cli.exe`
3. Save it anywhere (e.g., Desktop, Downloads)
4. Open Command Prompt or PowerShell where you saved the file
5. Run: `.\ghec-sso-cli.exe --help`

## 🔧 Option 2: Traditional Node.js Installation

### Prerequisites
- **Node.js 16 or higher** - [Download here](https://nodejs.org/)
- **Git** (for GitHub installation method) - [Download here](https://git-scm.com/)

### Install via npm
Open a terminal/command prompt and run:
```bash
npm install -g git+https://github.com/benleane83/ghec-sso-setup.git
```

### Alternative: Clone and Build
```bash
git clone https://github.com/benleane83/ghec-sso-setup.git
cd ghec-sso-setup
npm install
npm run build
npm install -g .
```

## ✅ Verify Installation

### For Standalone Executable:
```bash
# Windows
.\ghec-sso-cli.exe --version

### For npm Installation:
```bash
ghec-sso --version
ghec-sso --help
```

## 🎯 Quick Start Examples

### Using Standalone Executable (Windows):
```bash
# Download ghec-sso-cli.exe to your Desktop
cd Desktop
.\ghec-sso-cli.exe auth login
.\ghec-sso-cli.exe setup --enterprise mycompany
```

### Using npm Installation:
```bash
ghec-sso auth login
ghec-sso setup --enterprise mycompany
```

## 🛟 Troubleshooting

### Standalone Executable Issues

**"Windows protected your PC" warning:**
- Click "More info" → "Run anyway"
- Or right-click the .exe → Properties → Check "Unblock"
- Or run in PowerShell: `Unblock-File .\ghec-sso-cli.exe`

**File not found:**
- Make sure you're in the same directory as the downloaded executable
- Use `ls` (macOS/Linux) or `dir` (Windows) to list files in current directory

### npm Installation Issues

**"Command not found" error:**
- Make sure Node.js and npm are installed correctly
- Try running with full path: `npx ghec-sso --help`
- Re-run: `npm install -g git+https://github.com/benleane83/ghec-sso-setup.git`

**Permission errors on macOS/Linux:**
```bash
sudo npm install -g git+https://github.com/benleane83/ghec-sso-setup.git
```

### General Issues

**Update to latest version:**
```bash
# For npm installation
npm uninstall -g ghec-sso-cli
npm install -g git+https://github.com/benleane83/ghec-sso-setup.git

# For executable, just download the latest from GitHub Releases
```

**Getting Help:**
- Check authentication: `ghec-sso auth status`
- Debug enterprise access: `ghec-sso auth debug -e my-company`
- View all commands: `ghec-sso --help`
- Test dry run: `ghec-sso setup --dry-run -e my-company`

---

**💡 Recommendation**: Use the standalone executable (Option 1) for the simplest experience - no Node.js or npm knowledge required!
- **Permissions**: Admin access to both GitHub Enterprise and Azure AD
