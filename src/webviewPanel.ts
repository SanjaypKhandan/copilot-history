import * as vscode from 'vscode';
import { Conversation } from './types';

/**
 * Webview panel that renders a full conversation in a rich, readable format.
 */
export class ConversationWebviewPanel {
    private static panels = new Map<string, ConversationWebviewPanel>();

    private panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];

    private constructor(
        private conversationId: string,
        private extensionUri: vscode.Uri,
    ) {
        this.panel = vscode.window.createWebviewPanel(
            'copilotHistory.conversation',
            'Conversation',
            vscode.ViewColumn.One,
            { enableScripts: false, retainContextWhenHidden: false },
        );

        this.panel.onDidDispose(() => {
            ConversationWebviewPanel.panels.delete(this.conversationId);
            this.disposables.forEach(d => d.dispose());
        }, null, this.disposables);
    }

    /** Show or focus a conversation panel */
    static show(
        conversationId: string,
        conversation: Conversation,
        extensionUri: vscode.Uri,
    ): void {
        const existing = ConversationWebviewPanel.panels.get(conversationId);
        if (existing) {
            existing.panel.reveal();
            existing.update(conversation);
            return;
        }

        const instance = new ConversationWebviewPanel(conversationId, extensionUri);
        ConversationWebviewPanel.panels.set(conversationId, instance);
        instance.update(conversation);
    }

    private update(conv: Conversation): void {
        this.panel.title = conv.title;
        this.panel.webview.html = this.buildHtml(conv);
    }

    private buildHtml(conv: Conversation): string {
        const turnsHtml = conv.turns.map(t => {
            const isUser = t.role === 'user';
            const roleLabel = isUser ? 'You' : 'Copilot';
            const roleClass = isUser ? 'user' : 'assistant';
            const escapedContent = escapeHtml(t.content);
            return `
                <div class="turn ${roleClass}">
                    <div class="turn-header">
                        <span class="role">${roleLabel}</span>
                        <span class="time">${new Date(t.timestamp).toLocaleString()}</span>
                        ${t.model ? `<span class="model">${escapeHtml(t.model)}</span>` : ''}
                    </div>
                    <div class="turn-content"><pre>${escapedContent}</pre></div>
                </div>`;
        }).join('\n');

        const tagsHtml = conv.tags.length
            ? conv.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join(' ')
            : '<span class="muted">No tags</span>';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(conv.title)}</title>
    <style>
        :root {
            --bg: var(--vscode-editor-background);
            --fg: var(--vscode-editor-foreground);
            --border: var(--vscode-panel-border);
            --user-bg: var(--vscode-textBlockQuote-background);
            --assistant-bg: var(--vscode-editor-background);
        }
        body { font-family: var(--vscode-font-family); color: var(--fg); background: var(--bg); padding: 16px; margin: 0; }
        h1 { font-size: 1.4em; margin-bottom: 4px; }
        .meta { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin-bottom: 16px; }
        .tag { display: inline-block; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 2px 8px; border-radius: 10px; font-size: 0.8em; margin-right: 4px; }
        .muted { color: var(--vscode-descriptionForeground); }
        .turn { margin-bottom: 16px; padding: 12px; border-radius: 6px; border: 1px solid var(--border); }
        .turn.user { background: var(--user-bg); }
        .turn.assistant { background: var(--assistant-bg); }
        .turn-header { display: flex; gap: 12px; align-items: center; margin-bottom: 8px; font-size: 0.85em; }
        .role { font-weight: 600; }
        .time { color: var(--vscode-descriptionForeground); }
        .model { color: var(--vscode-descriptionForeground); font-style: italic; }
        .turn-content pre { white-space: pre-wrap; word-wrap: break-word; margin: 0; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
        hr { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
    </style>
</head>
<body>
    <h1>${escapeHtml(conv.title)} ${conv.starred ? '⭐' : ''}</h1>
    <div class="meta">
        Created: ${new Date(conv.createdAt).toLocaleString()} · 
        ${conv.turnCount} turns · 
        Tags: ${tagsHtml}
    </div>
    <hr>
    ${turnsHtml}
</body>
</html>`;
    }
}

/* ------------------------------------------------------------------ */
/*  HTML escape                                                        */
/* ------------------------------------------------------------------ */

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
