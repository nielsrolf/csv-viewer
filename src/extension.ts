import * as vscode from 'vscode';
import * as fs from 'fs';
import * as parse from 'csv-parse/sync';

export function activate(context: vscode.ExtensionContext) {
    console.log('CSV Viewer is now active!');

    let disposable = vscode.commands.registerCommand('csvViewer.openPreview', () => {
        console.log('CSV Viewer: openPreview command triggered');
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            console.log(`CSV Viewer: Active file is ${editor.document.fileName}`);
            console.log(`CSV Viewer: File language ID is ${editor.document.languageId}`);
            
            // Check if the file is CSV, Dynamic CSV, or looks like CSV
            const isCsvFile = editor.document.languageId === 'csv' ||
                              editor.document.languageId === 'dynamic-csv' ||
                              editor.document.fileName.toLowerCase().endsWith('.csv') || 
                              looksLikeCsv(editor.document.getText());
            
            if (isCsvFile) {
                console.log('CSV Viewer: CSV file detected, creating preview');
                try {
                    CsvPreviewPanel.createOrShow(context.extensionUri, editor.document.uri);
                } catch (error) {
                    console.error('CSV Viewer: Error creating preview', error);
                }
            } else {
                console.log('CSV Viewer: File does not appear to be CSV');
                vscode.window.showInformationMessage('The current file does not appear to be a CSV file.');
            }
        } else {
            console.log('CSV Viewer: No file is currently active');
            vscode.window.showInformationMessage('Please open a CSV file before using the CSV Viewer');
        }
    });

    context.subscriptions.push(disposable);

    if (vscode.window.registerWebviewPanelSerializer) {
        vscode.window.registerWebviewPanelSerializer(CsvPreviewPanel.viewType, {
            async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
                console.log('CSV Viewer: Deserializing webview panel');
                CsvPreviewPanel.revive(webviewPanel, context.extensionUri);
            }
        });
    }
}

function looksLikeCsv(content: string): boolean {
    // Check the first few lines to see if they have a consistent number of commas
    const lines = content.split('\n').slice(0, 5);  // Check first 5 lines
    if (lines.length < 2) return false;  // Need at least 2 lines to compare

    const commaCount = lines[0].split(',').length;
    return lines.every(line => line.split(',').length === commaCount);
}


class CsvPreviewPanel {
    public static currentPanel: CsvPreviewPanel | undefined;
    public static readonly viewType = 'csvPreview';
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, documentUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : vscode.ViewColumn.One;

        if (CsvPreviewPanel.currentPanel) {
            CsvPreviewPanel.currentPanel._panel.reveal(column);
            CsvPreviewPanel.currentPanel._update(documentUri);
        } else {
            CsvPreviewPanel.currentPanel = new CsvPreviewPanel(extensionUri, column || vscode.ViewColumn.One, documentUri);
        }
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        CsvPreviewPanel.currentPanel = new CsvPreviewPanel(extensionUri, panel.viewColumn || vscode.ViewColumn.One, undefined, panel);
    }

    private constructor(
        extensionUri: vscode.Uri,
        column: vscode.ViewColumn,
        documentUri?: vscode.Uri,
        panel?: vscode.WebviewPanel
    ) {
        this._extensionUri = extensionUri;

        if (panel) {
            this._panel = panel;
        } else {
            this._panel = vscode.window.createWebviewPanel(
                CsvPreviewPanel.viewType,
                'CSV Preview',
                column,
                {
                    enableScripts: true,
                    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
                }
            );
        }

        this._update(documentUri);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'alert':
                        vscode.window.showErrorMessage(message.text);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    private _update(documentUri?: vscode.Uri) {
        this._panel.webview.html = this._getHtmlForWebview(documentUri);
    }

    public dispose() {
        CsvPreviewPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _parseCSV(content: string): string[][] {
        return parse.parse(content, {
            columns: false,
            skip_empty_lines: true
        });
    }
    

    private _getHtmlForWebview(documentUri?: vscode.Uri) {
        if (!documentUri) {
            return `<html><body>No CSV file selected</body></html>`;
        }
    
        const csvContent = fs.readFileSync(documentUri.fsPath, 'utf8');
        const rows = this._parseCSV(csvContent);
        console.log('CSV Viewer: Parsed CSV file', rows);
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