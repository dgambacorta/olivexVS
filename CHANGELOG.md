# Changelog

All notable changes to the OliveX Security VSCode Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Support for filtering bugs by program
- Bulk bug operations
- Custom severity filters
- Export bug reports to PDF
- Integration with Git for automatic commits
- Security metrics dashboard
- Team collaboration features
- AI-powered vulnerability detection in workspace

## [0.1.0] - 2024-01-XX

### Added
- Initial release
- OAuth2 authentication with 0xHunter API
- Bug tree view grouped by severity
- Pull bugs from 0xHunter platform
- Claude Code integration for automated fixing
- Bug detail webview panel
- Mark bugs as fixed functionality
- Open bugs in browser
- Secure credential storage using VSCode Secret Storage
- Auto-refresh capability
- Context file generation in .olivex directory
- Rich bug information display with:
  - Severity badges and colors
  - CVSS scores
  - CWE classifications
  - Proof of concept code
  - Recommended fixes
- Command palette integration
- Keyboard shortcuts support
- Configurable API endpoint
- Error handling and user feedback
- Progress notifications for long operations

### Features
- **Authentication**: Secure OAuth2 client credentials flow
- **Bug Management**: View, filter, and manage vulnerabilities
- **AI-Powered Fixing**: Integration with Claude Code for automated vulnerability remediation
- **Rich UI**: Custom tree view with severity-based grouping and icons
- **WebView Panel**: Detailed bug information with interactive buttons
- **Status Updates**: Update bug status directly from VSCode
- **External Links**: Open bugs in 0xHunter web interface

### Technical
- TypeScript implementation
- Axios for HTTP requests
- VSCode Extension API
- Markdown formatting for bug contexts
- SVG icons for branding
- ESLint for code quality

### Documentation
- README.md with usage instructions
- SETUP.md with installation guide
- DEVELOPMENT.md with developer documentation
- CONFIGURATION.md with examples
- Example bug context file

## [0.0.1] - 2024-01-XX

### Added
- Project scaffolding
- Basic extension structure
- Initial API client implementation

---

## Release Notes Format

### Added
New features.

### Changed
Changes in existing functionality.

### Deprecated
Soon-to-be removed features.

### Removed
Removed features.

### Fixed
Bug fixes.

### Security
Security vulnerability fixes.
