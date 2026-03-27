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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCommands = registerCommands;
const vscode = __importStar(require("vscode"));
const webviewPanel_1 = require("./webviewPanel");
/**
 * Register all commands and return their disposables.
 */
function registerCommands(context, storage, treeProvider, chatParticipant) {
    const disposables = [];
    // ------- Open conversation in webview -------
    disposables.push(vscode.commands.registerCommand('copilotHistory.openConversation', async (id) => {
        const conv = await storage.get(id);
        if (!conv) {
            vscode.window.showErrorMessage('Conversation not found.');
            return;
        }
        webviewPanel_1.ConversationWebviewPanel.show(conv.id, conv, context.extensionUri);
    }));
    // ------- Star / Unstar -------
    disposables.push(vscode.commands.registerCommand('copilotHistory.starConversation', async (node) => {
        await storage.toggleStar(node.meta.id);
        treeProvider.refresh();
    }));
    disposables.push(vscode.commands.registerCommand('copilotHistory.unstarConversation', async (node) => {
        await storage.toggleStar(node.meta.id);
        treeProvider.refresh();
    }));
    // ------- Tag -------
    disposables.push(vscode.commands.registerCommand('copilotHistory.tagConversation', async (node) => {
        const current = node.meta.tags.join(', ');
        const input = await vscode.window.showInputBox({
            prompt: 'Enter tags (comma-separated)',
            value: current,
            placeHolder: 'e.g. bugfix, react, important',
        });
        if (input === undefined) {
            return;
        } // cancelled
        const tags = input.split(',').map(t => t.trim()).filter(Boolean);
        await storage.setTags(node.meta.id, tags);
        treeProvider.refresh();
    }));
    // ------- Delete -------
    disposables.push(vscode.commands.registerCommand('copilotHistory.deleteConversation', async (node) => {
        const confirm = await vscode.window.showWarningMessage(`Delete conversation "${node.meta.title}"?`, { modal: true }, 'Delete');
        if (confirm !== 'Delete') {
            return;
        }
        await storage.delete(node.meta.id);
        treeProvider.refresh();
    }));
    // ------- Export Markdown -------
    disposables.push(vscode.commands.registerCommand('copilotHistory.exportMarkdown', async (node) => {
        const md = await storage.exportMarkdown(node.meta.id);
        if (!md) {
            return;
        }
        const doc = await vscode.workspace.openTextDocument({ content: md, language: 'markdown' });
        await vscode.window.showTextDocument(doc);
    }));
    // ------- Export JSON -------
    disposables.push(vscode.commands.registerCommand('copilotHistory.exportJson', async (node) => {
        const json = await storage.exportJson(node.meta.id);
        if (!json) {
            return;
        }
        const doc = await vscode.workspace.openTextDocument({ content: json, language: 'json' });
        await vscode.window.showTextDocument(doc);
    }));
    // ------- Resume -------
    disposables.push(vscode.commands.registerCommand('copilotHistory.resumeConversation', async (node) => {
        chatParticipant.queueResume(node.meta.id);
        vscode.window.showInformationMessage(`Conversation "${node.meta.title}" queued for resume. Send a message to @history to continue.`);
    }));
    // ------- Search -------
    disposables.push(vscode.commands.registerCommand('copilotHistory.searchConversations', async () => {
        const query = await vscode.window.showInputBox({
            prompt: 'Search conversations',
            placeHolder: 'Enter a keyword…',
        });
        if (query === undefined) {
            return;
        }
        if (!query) {
            treeProvider.setFilter('');
            return;
        }
        treeProvider.setFilter(query);
    }));
    // ------- Refresh -------
    disposables.push(vscode.commands.registerCommand('copilotHistory.refresh', () => {
        treeProvider.setFilter('');
    }));
    return disposables;
}
//# sourceMappingURL=commands.js.map