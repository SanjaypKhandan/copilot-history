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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const storage_1 = require("./storage");
const chatParticipant_1 = require("./chatParticipant");
const treeView_1 = require("./treeView");
const commands_1 = require("./commands");
async function activate(context) {
    // Ensure workspace storage directory exists
    const storageUri = context.storageUri;
    if (!storageUri) {
        vscode.window.showWarningMessage('Copilot History requires an open workspace to store conversations.');
        return;
    }
    // Initialise storage
    const storage = new storage_1.ConversationStorage(storageUri);
    await storage.init();
    // Prune old conversations based on setting
    const config = vscode.workspace.getConfiguration('copilotHistory');
    const max = config.get('maxConversations', 500);
    await storage.prune(max);
    // Create tree view provider
    const treeProvider = new treeView_1.ConversationTreeProvider(storage);
    const treeView = vscode.window.createTreeView('copilotHistory.conversationList', {
        treeDataProvider: treeProvider,
        showCollapseAll: true,
    });
    // Create chat participant
    const chatParticipant = new chatParticipant_1.HistoryChatParticipant(storage);
    // Refresh tree when conversations change
    chatParticipant.onConversationUpdated(() => treeProvider.refresh());
    // Register commands
    const commandDisposables = (0, commands_1.registerCommands)(context, storage, treeProvider, chatParticipant);
    // Add all disposables
    context.subscriptions.push(treeView, chatParticipant, ...commandDisposables);
}
function deactivate() {
    // Nothing to clean up beyond disposables
}
//# sourceMappingURL=extension.js.map