"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
function activate(context) {
    console.log('CSV Viewer is now active!');
    let disposable = vscode.commands.registerCommand('csvViewer.openPreview', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'csv') {
            CsvPreviewPanel.createOrShow(context.extensionUri, editor.document.uri);
        }
    });
    context.subscriptions.push(disposable);
    if (vscode.window.registerWebviewPanelSerializer) {
        vscode.window.registerWebviewPanelSerializer(CsvPreviewPanel.viewType, {
            async deserializeWebviewPanel(webviewPanel, state) {
                CsvPreviewPanel.revive(webviewPanel, context.extensionUri);
            }
        });
    }
}
exports.activate = activate;
class CsvPreviewPanel {
    static currentPanel;
    static viewType = 'csvPreview';
    _panel;
    _extensionUri;
    _disposables = [];
    static createOrShow(extensionUri, documentUri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : vscode.ViewColumn.One;
        if (CsvPreviewPanel.currentPanel) {
            CsvPreviewPanel.currentPanel._panel.reveal(column);
            CsvPreviewPanel.currentPanel._update(documentUri);
        }
        else {
            CsvPreviewPanel.currentPanel = new CsvPreviewPanel(extensionUri, column || vscode.ViewColumn.One, documentUri);
        }
    }
    static revive(panel, extensionUri) {
        CsvPreviewPanel.currentPanel = new CsvPreviewPanel(extensionUri, panel.viewColumn || vscode.ViewColumn.One, undefined, panel);
    }
    constructor(extensionUri, column, documentUri, panel) {
        this._extensionUri = extensionUri;
        if (panel) {
            this._panel = panel;
        }
        else {
            this._panel = vscode.window.createWebviewPanel(CsvPreviewPanel.viewType, 'CSV Preview', column, {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            });
        }
        this._update(documentUri);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'alert':
                    vscode.window.showErrorMessage(message.text);
                    return;
            }
        }, null, this._disposables);
    }
    _update(documentUri) {
        this._panel.webview.html = this._getHtmlForWebview(documentUri);
    }
    dispose() {
        CsvPreviewPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
    _getHtmlForWebview(documentUri) {
        if (!documentUri) {
            return `<html><body>No CSV file selected</body></html>`;
        }
        const csvContent = fs.readFileSync(documentUri.fsPath, 'utf8');
        const rows = csvContent.split('\n').map(row => row.split(','));
        const headers = rows[0];
        const data = rows.slice(1);
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>CSV Preview</title>
                <style>
                    body { font-family: Arial, sans-serif; }
                    table { border-collapse: collapse; }
                    th, td { border: 1px solid #ddd; padding: 8px; min-width: 200px; max-width: 200px; overflow: hidden; }
                    th { background-color: #f2f2f2; }
                    #selected-cell { padding: 10px; background-color: #f9f9f9; border: 1px solid #ddd; margin-bottom: 20px; }
                </style>
            </head>
            <body>
                <div id="selected-cell"></div>
                <table>
                    <thead>
                        <tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${data.map(row => `
                            <tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>
                        `).join('')}
                    </tbody>
                </table>
                <script>
                    const cells = document.querySelectorAll('td');
                    const selectedCell = document.getElementById('selected-cell');
                    cells.forEach(cell => {
                        cell.addEventListener('click', () => {
                            selectedCell.textContent = cell.textContent;
                        });
                    });
                </script>
            </body>
            </html>
        `;
    }
}
//# sourceMappingURL=extension.js.map