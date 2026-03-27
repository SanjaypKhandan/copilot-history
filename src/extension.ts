import * as vscode from 'vscode';
import { ConversationStorage } from './storage';
import { HistoryChatParticipant } from './chatParticipant';
import { ConversationTreeProvider } from './treeView';
import { registerCommands } from './commands';

export async function activate(context: vscode.ExtensionContext) {
    // Ensure workspace storage directory exists
    const storageUri = context.storageUri;
    if (!storageUri) {
        vscode.window.showWarningMessage(
            'Copilot History requires an open workspace to store conversations.'
        );
        return;
    }

    // Initialise storage
    const storage = new ConversationStorage(storageUri);
    await storage.init();

    // Prune old conversations based on setting
    const config = vscode.workspace.getConfiguration('copilotHistory');
    const max = config.get<number>('maxConversations', 500);
    await storage.prune(max);

    // Create tree view provider
    const treeProvider = new ConversationTreeProvider(storage);
    const treeView = vscode.window.createTreeView('copilotHistory.conversationList', {
        treeDataProvider: treeProvider,
        showCollapseAll: true,
    });

    // Create chat participant
    const chatParticipant = new HistoryChatParticipant(storage);

    // Refresh tree when conversations change
    chatParticipant.onConversationUpdated(() => treeProvider.refresh());

    // Register commands
    const commandDisposables = registerCommands(
        context,
        storage,
        treeProvider,
        chatParticipant,
    );

    // Add all disposables
    context.subscriptions.push(
        treeView,
        chatParticipant,
        ...commandDisposables,
    );
}

export function deactivate() {
    // Nothing to clean up beyond disposables
}
