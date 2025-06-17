# Distribution Strategy for GHEC SSO CLI

## Current Challenge
Users need to install Node.js and run npm commands, which can be intimidating for non-developers.

## Solution Options

### 1. PKG - Standalone Executables (Recommended)

**Benefits:**
- ✅ No Node.js installation required
- ✅ Single executable file (.exe for Windows)
- ✅ Works offline after download
- ✅ Easy to implement with existing codebase
- ✅ Cross-platform support

**Implementation:**
```bash
# Install PKG
npm install -D pkg

# Build executables
npm run package:win    # Windows .exe
npm run package:all    # All platforms
```

**User Experience:**
1. Download `ghec-sso.exe` from GitHub Releases
2. Run directly: `.\ghec-sso.exe --help`
3. No installation needed

### 2. Electron Forge - Native Installers

**Benefits:**
- ✅ Professional MSI/DMG/DEB installers
- ✅ Auto-updater support
- ✅ System integration (Start Menu, etc.)
- ✅ Code signing support

**Implementation:**
- Convert CLI to Electron app with hidden window
- Use Electron Forge for packaging
- More complex but most professional

### 3. Docker + Executable Wrapper

**Benefits:**
- ✅ Consistent environment
- ✅ No dependency issues
- ❌ Requires Docker Desktop

**User Experience:**
```bash
# Download wrapper script
curl -O https://github.com/benleane83/ghec-sso-setup/releases/latest/download/ghec-sso.exe
# Runs Docker container internally
.\ghec-sso.exe setup --enterprise mycompany
```

### 4. GitHub Actions + Pre-built Binaries

**Benefits:**
- ✅ Automated build/release pipeline
- ✅ Multiple platform support
- ✅ Professional distribution

## Recommended Implementation Plan

### Phase 1: PKG Implementation (Immediate)
1. Add PKG configuration (✅ Done)
2. Set up GitHub Actions for automated builds
3. Create releases with pre-built executables
4. Update documentation

### Phase 2: Professional Installers (Optional)
1. MSI installer for Windows using WiX or Electron
2. Code signing for trust
3. Auto-updater functionality

## File Size Considerations
- PKG executable: ~50-80MB (includes Node.js runtime)
- Can be reduced with webpack bundling
- Still smaller than many desktop apps

## Distribution Channels
1. **GitHub Releases** (Primary)
   - Pre-built executables for download
   - Checksums for verification
   
2. **Chocolatey** (Windows)
   - `choco install ghec-sso-cli`
   
3. **Homebrew** (macOS)
   - `brew install ghec-sso-cli`
   
4. **Winget** (Windows)
   - `winget install ghec-sso-cli`

## Security Considerations
- Code signing for Windows executables
- Checksums for download verification
- GitHub's security scanning for releases
