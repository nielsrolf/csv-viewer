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
    
    private _getHtmlForWebview(documentUri?: vscode.Uri): string {
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
                    ${this._getStyles()}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="search-container">
                        <input type="text" id="searchInput" placeholder="Search...">
                        <span id="searchInfo"></span>
                        <button id="prevButton">Previous</button>
                        <button id="nextButton">Next</button>
                    </div>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th class="row-number">#</th>
                                    ${headers.map(header => `<th>${this._escapeHtml(header)}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${data.map((row, index) => `
                                    <tr>
                                        <td class="row-number">${index + 1}</td>
                                        ${row.map(cell => `<td><div class="cell-content">${this._escapeHtml(cell)}</div></td>`).join('')}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <script>
                    ${this._getJavaScript()}
                </script>
            </body>
            </html>
        `;
    }
    
    private _escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;")
            .replace(/\n/g, "<br>");
    }
    
    private _getStyles(): string {
        return `
            body { 
                font-family: Arial, sans-serif; 
                margin: 0;
                padding: 0;
            }
            .container {
                display: flex;
                flex-direction: column;
                height: 100vh;
            }
            .search-container {
                padding: 10px;
                background-color: #f0f0f0;
                display: flex;
                align-items: center;
            }
            #searchInput {
                flex-grow: 1;
                margin-right: 10px;
                padding: 5px;
            }
            #searchInfo {
                margin-right: 10px;
            }
            .table-container {
                flex-grow: 1;
                overflow: auto;
            }
            table { 
                border-collapse: collapse; 
            }
            th, td { 
                border: 1px solid #ddd; 
                padding: 8px; 
                min-width: 200px; 
                max-width: 200px; 
            }
            th { 
                background-color: black;
                color: white;
                position: sticky;
                top: 0;
                z-index: 10;
            }
            .row-number {
                position: sticky;
                left: 0;
                background-color: black;
                color: white;
                z-index: 5;
                width: 50px;
                min-width: 50px;
                max-width: 50px;
            }
            th.row-number {
                z-index: 15;
            }
            tr {
                height: 1.2em;
            }
            tr.expanded {
                height: auto;
            }
            td {
                vertical-align: top;
            }
            .cell-content {
                white-space: pre-wrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-height: 1.2em;
                transition: max-height 0.3s ease-out;
            }
            tr.expanded .cell-content {
                max-height: none;
            }
            .highlight {
                background-color: yellow;
            }
        `;
    }
    
    private _getJavaScript(): string {
        return `
            const rows = document.querySelectorAll('tbody tr');
            
            function expandRow(row) {
                rows.forEach(r => r.classList.remove('expanded'));
                row.classList.add('expanded');
            }
    
            rows.forEach(row => {
                const cells = row.querySelectorAll('td:not(.row-number)');
                cells.forEach(cell => {
                    cell.addEventListener('click', (event) => {
                        // Prevent click event when selecting text
                        if (window.getSelection().toString().length === 0) {
                            if (row.classList.contains('expanded')) {
                                row.classList.remove('expanded');
                            } else {
                                expandRow(row);
                            }
                        }
                    });
    
                    // Prevent collapsing when mouseup occurs after text selection
                    cell.addEventListener('mouseup', (event) => {
                        if (window.getSelection().toString().length > 0) {
                            event.stopPropagation();
                        }
                    });
                });
            });
    
            // Search functionality
            const searchInput = document.getElementById('searchInput');
            const searchInfo = document.getElementById('searchInfo');
            const prevButton = document.getElementById('prevButton');
            const nextButton = document.getElementById('nextButton');
            let currentMatchIndex = -1;
            let matches = [];
    
            function performSearch() {
                const searchTerm = searchInput.value.toLowerCase();
                matches = [];
                document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
                rows.forEach(row => row.classList.remove('expanded'));
                
                if (searchTerm) {
                    document.querySelectorAll('tbody td:not(.row-number) .cell-content').forEach((cell, index) => {
                        const cellText = cell.textContent.toLowerCase();
                        if (cellText.includes(searchTerm)) {
                            matches.push(cell);
                            cell.innerHTML = cell.textContent.replace(new RegExp(searchTerm, 'gi'), match => '<span class="highlight">' + match + '</span>');
                        }
                    });
                }
    
                currentMatchIndex = matches.length > 0 ? 0 : -1;
                updateSearchInfo();
                highlightCurrentMatch();
            }
    
            function updateSearchInfo() {
                searchInfo.textContent = matches.length > 0 
                    ? \`\${currentMatchIndex + 1} of \${matches.length} matches\` 
                    : 'No matches found';
            }
    
            function highlightCurrentMatch() {
                if (currentMatchIndex >= 0 && currentMatchIndex < matches.length) {
                    const currentCell = matches[currentMatchIndex];
                    currentCell.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    expandRow(currentCell.closest('tr'));
                }
            }
    
            searchInput.addEventListener('input', performSearch);
            prevButton.addEventListener('click', () => {
                if (matches.length > 0) {
                    currentMatchIndex = (currentMatchIndex - 1 + matches.length) % matches.length;
                    updateSearchInfo();
                    highlightCurrentMatch();
                }
            });
            nextButton.addEventListener('click', () => {
                if (matches.length > 0) {
                    currentMatchIndex = (currentMatchIndex + 1) % matches.length;
                    updateSearchInfo();
                    highlightCurrentMatch();
                }
            });
    
            // Handle Cmd+F (or Ctrl+F) to focus on search input
            document.addEventListener('keydown', (e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                    e.preventDefault();
                    searchInput.focus();
                }
            });
        `;
    }
}