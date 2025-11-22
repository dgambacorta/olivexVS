import * as vscode from 'vscode';
import { ConfigManager } from '../config/settings';
import { HunterClient } from '../api/hunter-client';

export async function registerConfigureCommand(
  context: vscode.ExtensionContext,
  configManager: ConfigManager
): Promise<void> {
  context.subscriptions.push(
    vscode.commands.registerCommand('olivex.configure', async () => {
      const panel = vscode.window.createWebviewPanel(
        'olivexConfigure',
        '🛡️ OliveX - Configure 0xHunter',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );

      // Get current credentials
      const currentClientId = await configManager.getClientId();
      const currentBaseUrl = configManager.getApiBaseUrl();

      // Set up the HTML content (handle undefined currentClientId)
      panel.webview.html = getConfigureWebviewContent(currentClientId || '', currentBaseUrl);

      // Handle messages from the webview
      panel.webview.onDidReceiveMessage(
        async (message) => {
          switch (message.command) {
            case 'save':
              await handleSaveCredentials(
                message.clientId,
                message.clientSecret,
                message.baseUrl,
                configManager,
                panel
              );
              break;
            case 'cancel':
              panel.dispose();
              break;
            case 'test':
              await handleTestConnection(
                message.clientId,
                message.clientSecret,
                message.baseUrl,
                panel
              );
              break;
          }
        },
        undefined,
        context.subscriptions
      );
    })
  );
}

async function handleSaveCredentials(
  clientId: string,
  clientSecret: string,
  baseUrl: string,
  configManager: ConfigManager,
  panel: vscode.WebviewPanel
): Promise<void> {
  try {
    // Validate inputs
    if (!clientId || clientId.trim().length === 0) {
      panel.webview.postMessage({
        command: 'error',
        message: 'Client ID is required',
      });
      return;
    }

    if (!clientSecret || clientSecret.trim().length === 0) {
      panel.webview.postMessage({
        command: 'error',
        message: 'Client Secret is required',
      });
      return;
    }

    // Show progress
    panel.webview.postMessage({ command: 'testing' });

    // Test the credentials
    const testClient = new HunterClient({
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      baseUrl: baseUrl.trim() || 'https://api.0xhunter.io',
    });

    const isValid = await testClient.testConnection();

    if (!isValid) {
      panel.webview.postMessage({
        command: 'error',
        message: 'Invalid credentials or unable to connect to 0xHunter API',
      });
      return;
    }

    // Save credentials
    await configManager.setCredentials(clientId.trim(), clientSecret.trim());

    // Update base URL if changed
    const config = vscode.workspace.getConfiguration('olivex');
    if (baseUrl && baseUrl.trim() !== configManager.getApiBaseUrl()) {
      await config.update('apiBaseUrl', baseUrl.trim(), vscode.ConfigurationTarget.Global);
    }

    panel.webview.postMessage({ command: 'success' });

    // Close panel and offer to pull bugs
    setTimeout(() => {
      panel.dispose();
      vscode.window
        .showInformationMessage('✅ Successfully connected to 0xHunter!', 'Pull Bugs')
        .then((selection) => {
          if (selection === 'Pull Bugs') {
            vscode.commands.executeCommand('olivex.pullBugs');
          }
        });
    }, 1000);
  } catch (error: any) {
    panel.webview.postMessage({
      command: 'error',
      message: error.message || 'Unknown error occurred',
    });
  }
}

async function handleTestConnection(
  clientId: string,
  clientSecret: string,
  baseUrl: string,
  panel: vscode.WebviewPanel
): Promise<void> {
  try {
    if (!clientId || !clientSecret) {
      panel.webview.postMessage({
        command: 'error',
        message: 'Please enter both Client ID and Client Secret',
      });
      return;
    }

    panel.webview.postMessage({ command: 'testing' });

    const testClient = new HunterClient({
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      baseUrl: baseUrl.trim() || 'https://api.0xhunter.io',
    });

    const isValid = await testClient.testConnection();

    if (isValid) {
      panel.webview.postMessage({
        command: 'testSuccess',
        message: '✅ Connection successful!',
      });
    } else {
      panel.webview.postMessage({
        command: 'error',
        message: 'Connection failed. Please check your credentials.',
      });
    }
  } catch (error: any) {
    panel.webview.postMessage({
      command: 'error',
      message: error.message || 'Connection test failed',
    });
  }
}

function getConfigureWebviewContent(currentClientId: string | undefined, currentBaseUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Configure 0xHunter</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            padding: 30px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        
        .container {
            max-width: 600px;
            margin: 0 auto;
        }
        
        .header {
            margin-bottom: 30px;
        }
        
        .header h1 {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--vscode-foreground);
        }
        
        .header p {
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: var(--vscode-foreground);
        }
        
        .form-group input {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-size: 14px;
            font-family: inherit;
        }
        
        .form-group input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        
        .form-group small {
            display: block;
            margin-top: 6px;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }
        
        .buttons {
            display: flex;
            gap: 10px;
            margin-top: 30px;
        }
        
        button {
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            font-family: inherit;
            transition: opacity 0.2s;
        }
        
        button:hover:not(:disabled) {
            opacity: 0.9;
        }
        
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .btn-primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            flex: 1;
        }
        
        .btn-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .btn-cancel {
            background-color: transparent;
            color: var(--vscode-foreground);
            border: 1px solid var(--vscode-input-border);
        }
        
        .alert {
            padding: 12px 16px;
            border-radius: 4px;
            margin-bottom: 20px;
            font-size: 14px;
            display: none;
        }
        
        .alert.show {
            display: block;
        }
        
        .alert-error {
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            color: var(--vscode-errorForeground);
        }
        
        .alert-success {
            background-color: rgba(0, 200, 0, 0.1);
            border: 1px solid rgba(0, 200, 0, 0.3);
            color: rgba(0, 255, 0, 0.9);
        }
        
        .alert-info {
            background-color: var(--vscode-inputValidation-infoBackground);
            border: 1px solid var(--vscode-inputValidation-infoBorder);
            color: var(--vscode-foreground);
        }
        
        .spinner {
            display: none;
            margin-left: 10px;
        }
        
        .spinner.show {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid var(--vscode-button-foreground);
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .divider {
            height: 1px;
            background-color: var(--vscode-input-border);
            margin: 30px 0;
        }
        
        .help-link {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
            font-size: 13px;
        }
        
        .help-link:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🛡️ Configure 0xHunter Credentials</h1>
            <p>Connect your VSCode extension to 0xHunter platform</p>
        </div>
        
        <div id="alert" class="alert"></div>
        
        <form id="configForm">
            <div class="form-group">
                <label for="clientId">Client ID</label>
                <input 
                    type="text" 
                    id="clientId" 
                    name="clientId" 
                    placeholder="your-client-id"
                    value="${currentClientId || ''}"
                    required
                />
                <small>Your 0xHunter OAuth2 client ID</small>
            </div>
            
            <div class="form-group">
                <label for="clientSecret">Client Secret</label>
                <input 
                    type="password" 
                    id="clientSecret" 
                    name="clientSecret" 
                    placeholder="your-client-secret"
                    required
                />
                <small>Your 0xHunter OAuth2 client secret (stored securely)</small>
            </div>
            
            <div class="divider"></div>
            
            <div class="form-group">
                <label for="baseUrl">API Base URL (Optional)</label>
                <input 
                    type="url" 
                    id="baseUrl" 
                    name="baseUrl" 
                    placeholder="https://api.0xhunter.io"
                    value="${currentBaseUrl}"
                />
                <small>Leave default unless you're using a custom 0xHunter instance</small>
            </div>
            
            <div class="buttons">
                <button type="button" class="btn-secondary" id="testBtn">
                    Test Connection
                    <span class="spinner" id="testSpinner"></span>
                </button>
                <button type="submit" class="btn-primary" id="saveBtn">
                    Save & Connect
                    <span class="spinner" id="saveSpinner"></span>
                </button>
                <button type="button" class="btn-cancel" id="cancelBtn">Cancel</button>
            </div>
            
            <div style="margin-top: 20px; text-align: center;">
                <a href="https://0xhunter.io/settings/api" class="help-link" target="_blank">
                    Need API credentials? Get them here →
                </a>
            </div>
        </form>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        const form = document.getElementById('configForm');
        const alert = document.getElementById('alert');
        const saveBtn = document.getElementById('saveBtn');
        const testBtn = document.getElementById('testBtn');
        const cancelBtn = document.getElementById('cancelBtn');
        const saveSpinner = document.getElementById('saveSpinner');
        const testSpinner = document.getElementById('testSpinner');
        
        function showAlert(message, type = 'error') {
            alert.textContent = message;
            alert.className = 'alert alert-' + type + ' show';
            setTimeout(() => {
                alert.className = 'alert';
            }, 5000);
        }
        
        function setLoading(isLoading, isTest = false) {
            const btn = isTest ? testBtn : saveBtn;
            const spinner = isTest ? testSpinner : saveSpinner;
            
            btn.disabled = isLoading;
            spinner.className = isLoading ? 'spinner show' : 'spinner';
            
            if (isLoading) {
                testBtn.disabled = true;
                saveBtn.disabled = true;
            } else {
                testBtn.disabled = false;
                saveBtn.disabled = false;
            }
        }
        
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const clientId = document.getElementById('clientId').value.trim();
            const clientSecret = document.getElementById('clientSecret').value.trim();
            const baseUrl = document.getElementById('baseUrl').value.trim();
            
            if (!clientId || !clientSecret) {
                showAlert('Please fill in all required fields', 'error');
                return;
            }
            
            setLoading(true);
            vscode.postMessage({
                command: 'save',
                clientId,
                clientSecret,
                baseUrl
            });
        });
        
        testBtn.addEventListener('click', () => {
            const clientId = document.getElementById('clientId').value.trim();
            const clientSecret = document.getElementById('clientSecret').value.trim();
            const baseUrl = document.getElementById('baseUrl').value.trim();
            
            if (!clientId || !clientSecret) {
                showAlert('Please fill in Client ID and Client Secret first', 'error');
                return;
            }
            
            setLoading(true, true);
            vscode.postMessage({
                command: 'test',
                clientId,
                clientSecret,
                baseUrl
            });
        });
        
        cancelBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'cancel' });
        });
        
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'error':
                    setLoading(false);
                    showAlert(message.message, 'error');
                    break;
                case 'success':
                    setLoading(false);
                    showAlert('✅ Successfully connected!', 'success');
                    break;
                case 'testing':
                    showAlert('Testing connection...', 'info');
                    break;
                case 'testSuccess':
                    setLoading(false, true);
                    showAlert(message.message, 'success');
                    break;
            }
        });
    </script>
</body>
</html>`;
}
