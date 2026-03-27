import * as vscode from 'vscode';
import { ConversationStorage } from './storage';
import { ConversationTreeProvider, ConversationNode } from './treeView';
import { ConversationWebviewPanel } from './webviewPanel';
import { HistoryChatParticipant } from './chatParticipant';

/**
 * Register all commands and return their disposables.
 */
export function registerCommands(
    context: vscode.ExtensionContext,
    storage: ConversationStorage,
    treeProvider: ConversationTreeProvider,
    chatParticipant: HistoryChatParticipant,
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // ------- Open conversation in webview -------
    disposables.push(
        vscode.commands.registerCommand('copilotHistory.openConversation', async (id: string) => {
            const conv = await storage.get(id);
            if (!conv) {
                vscode.window.showErrorMessage('Conversation not found.');
                return;
            }
            ConversationWebviewPanel.show(conv.id, conv, context.extensionUri);
        }),
    );

    // ------- Star / Unstar -------
    disposables.push(
        vscode.commands.registerCommand('copilotHistory.starConversation', async (node: ConversationNode) => {
            await storage.toggleStar(node.meta.id);
            treeProvider.refresh();
        }),
    );
    disposables.push(
        vscode.commands.registerCommand('copilotHistory.unstarConversation', async (node: ConversationNode) => {
            await storage.toggleStar(node.meta.id);
            treeProvider.refresh();
        }),
    );

    // ------- Tag -------
    disposables.push(
        vscode.commands.registerCommand('copilotHistory.tagConversation', async (node: ConversationNode) => {
            const current = node.meta.tags.join(', ');
            const input = await vscode.window.showInputBox({
                prompt: 'Enter tags (comma-separated)',
                value: current,
                placeHolder: 'e.g. bugfix, react, important',
            });
            if (input === undefined) { return; } // cancelled
            const tags = input.split(',').map(t => t.trim()).filter(Boolean);
            await storage.setTags(node.meta.id, tags);
            treeProvider.refresh();
        }),
    );

    // ------- Delete -------
    disposables.push(
        vscode.commands.registerCommand('copilotHistory.deleteConversation', async (node: ConversationNode) => {
            const confirm = await vscode.window.showWarningMessage(
                `Delete conversation "${node.meta.title}"?`,
                { modal: true },
                'Delete',
            );
            if (confirm !== 'Delete') { return; }
            await storage.delete(node.meta.id);
            treeProvider.refresh();
        }),
    );

    // ------- Export Markdown -------
    disposables.push(
        vscode.commands.registerCommand('copilotHistory.exportMarkdown', async (node: ConversationNode) => {
            const md = await storage.exportMarkdown(node.meta.id);
            if (!md) { return; }
            const doc = await vscode.workspace.openTextDocument({ content: md, language: 'markdown' });
            await vscode.window.showTextDocument(doc);
        }),
    );

    // ------- Export JSON -------
    disposables.push(
        vscode.commands.registerCommand('copilotHistory.exportJson', async (node: ConversationNode) => {
            const json = await storage.exportJson(node.meta.id);
            if (!json) { return; }
            const doc = await vscode.workspace.openTextDocument({ content: json, language: 'json' });
            await vscode.window.showTextDocument(doc);
        }),
    );

    // ------- Resume -------
    disposables.push(
        vscode.commands.registerCommand('copilotHistory.resumeConversation', async (node: ConversationNode) => {
            chatParticipant.queueResume(node.meta.id);
            vscode.window.showInformationMessage(
                `Conversation "${node.meta.title}" queued for resume. Send a message to @history to continue.`
            );
        }),
    );

    // ------- Search -------
    disposables.push(
        vscode.commands.registerCommand('copilotHistory.searchConversations', async () => {
            const query = await vscode.window.showInputBox({
                prompt: 'Search conversations',
                placeHolder: 'Enter a keyword…',
            });
            if (query === undefined) { return; }
            if (!query) {
                treeProvider.setFilter('');
                return;
            }
            treeProvider.setFilter(query);
        }),
    );

    // ------- Refresh -------
    disposables.push(
        vscode.commands.registerCommand('copilotHistory.refresh', () => {
            treeProvider.setFilter('');
        }),
    );

    return disposables;
}
