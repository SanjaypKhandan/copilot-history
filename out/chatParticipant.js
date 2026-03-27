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
exports.HistoryChatParticipant = void 0;
const vscode = __importStar(require("vscode"));
/**
 * The @history chat participant.
 *
 * It proxies user messages to Copilot's language model,
 * streams back the response, and records every turn.
 */
class HistoryChatParticipant {
    storage;
    currentConversation;
    participant;
    onDidUpdateConversation = new vscode.EventEmitter();
    onConversationUpdated = this.onDidUpdateConversation.event;
    /** Map of conversation IDs queued for resume */
    resumeQueue = new Map();
    constructor(storage) {
        this.storage = storage;
        this.participant = vscode.chat.createChatParticipant('copilot-history.chat', this.handleRequest.bind(this));
        this.participant.iconPath = new vscode.ThemeIcon('history');
    }
    dispose() {
        this.participant.dispose();
        this.onDidUpdateConversation.dispose();
    }
    /** Queue a conversation to be resumed on the next user message */
    queueResume(conversationId) {
        this.resumeQueue.set(conversationId, true);
    }
    /* ------------------------------------------------------------------ */
    /*  Request handler                                                    */
    /* ------------------------------------------------------------------ */
    async handleRequest(request, context, stream, token) {
        // Handle slash commands
        if (request.command === 'new') {
            return this.handleNew(request, stream, token);
        }
        if (request.command === 'resume') {
            return this.handleResume(request, stream, token);
        }
        if (request.command === 'search') {
            return this.handleSearch(request, stream);
        }
        // Check for queued resume
        if (this.resumeQueue.size > 0) {
            const resumeId = [...this.resumeQueue.keys()][0];
            this.resumeQueue.delete(resumeId);
            const conv = await this.storage.get(resumeId);
            if (conv) {
                this.currentConversation = conv;
                stream.progress(`Resumed conversation: ${conv.title}`);
            }
        }
        // Default: proxy to LLM and record
        return this.proxyToLLM(request, stream, token);
    }
    /* ------------------------------------------------------------------ */
    /*  /new                                                               */
    /* ------------------------------------------------------------------ */
    async handleNew(request, stream, token) {
        const titleHint = request.prompt.trim() || 'New Conversation';
        this.currentConversation = await this.storage.create(titleHint);
        this.onDidUpdateConversation.fire();
        stream.markdown(`Started new conversation: **${this.currentConversation.title}**\n\nType your question to begin.`);
        return {};
    }
    /* ------------------------------------------------------------------ */
    /*  /resume                                                            */
    /* ------------------------------------------------------------------ */
    async handleResume(request, stream, token) {
        const query = request.prompt.trim();
        if (!query) {
            stream.markdown('Usage: `/resume <conversation id or title>`');
            return {};
        }
        // Try by ID first, then search by title
        let conv = await this.storage.get(query);
        if (!conv) {
            const matches = await this.storage.search(query);
            if (matches.length > 0) {
                conv = await this.storage.get(matches[0].id);
            }
        }
        if (!conv) {
            stream.markdown(`No conversation found matching **${query}**.`);
            return {};
        }
        this.currentConversation = conv;
        stream.markdown(`Resumed conversation: **${conv.title}** (${conv.turnCount} turns)\n\n` +
            `Last message: _${conv.preview}_\n\nSend your next message to continue.`);
        return {};
    }
    /* ------------------------------------------------------------------ */
    /*  /search                                                            */
    /* ------------------------------------------------------------------ */
    async handleSearch(request, stream) {
        const query = request.prompt.trim();
        if (!query) {
            stream.markdown('Usage: `/search <query>`');
            return {};
        }
        const results = await this.storage.search(query);
        if (results.length === 0) {
            stream.markdown(`No conversations matching **${query}**.`);
            return {};
        }
        const lines = results.slice(0, 20).map((m, i) => `${i + 1}. **${m.title}** — ${m.turnCount} turns, _${m.updatedAt}_ ${m.starred ? '⭐' : ''}`);
        stream.markdown(`### Search results for "${query}"\n\n${lines.join('\n')}`);
        return {};
    }
    /* ------------------------------------------------------------------ */
    /*  LLM proxy (core flow)                                              */
    /* ------------------------------------------------------------------ */
    async proxyToLLM(request, stream, token) {
        // Ensure we have an active conversation
        if (!this.currentConversation) {
            const title = request.prompt.slice(0, 60) || 'Untitled';
            this.currentConversation = await this.storage.create(title);
            this.onDidUpdateConversation.fire();
        }
        // Record user turn
        const userTurn = {
            role: 'user',
            content: request.prompt,
            timestamp: new Date().toISOString(),
            command: request.command,
            references: request.references.map(r => String(r.id)),
        };
        await this.storage.addTurn(this.currentConversation.id, userTurn);
        // Build LLM messages from stored history
        const messages = [];
        // System message
        messages.push(vscode.LanguageModelChatMessage.User('You are a helpful programming assistant. Answer concisely and accurately.'));
        // Inject prior turns (cap to last 40 to stay within context limits)
        const turns = this.currentConversation.turns.slice(-40);
        for (const t of turns) {
            if (t.role === 'user') {
                messages.push(vscode.LanguageModelChatMessage.User(t.content));
            }
            else {
                messages.push(vscode.LanguageModelChatMessage.Assistant(t.content));
            }
        }
        // Current user message (already appended to turns above via addTurn, but
        // we re-add it explicitly because addTurn didn't reload currentConversation.turns)
        const conv = await this.storage.get(this.currentConversation.id);
        if (conv) {
            this.currentConversation = conv;
        }
        // Select model and send
        const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
        if (models.length === 0) {
            stream.markdown('No Copilot language model available. Make sure GitHub Copilot is installed and signed in.');
            return {};
        }
        const model = models[0];
        stream.progress('Thinking…');
        let responseText = '';
        try {
            const chatResponse = await model.sendRequest(messages, {}, token);
            for await (const chunk of chatResponse.text) {
                responseText += chunk;
                stream.markdown(chunk);
            }
        }
        catch (err) {
            if (err instanceof vscode.LanguageModelError) {
                stream.markdown(`\n\n_Error: ${err.message}_`);
            }
            else {
                throw err;
            }
        }
        // Record assistant turn
        if (responseText) {
            const assistantTurn = {
                role: 'assistant',
                content: responseText,
                timestamp: new Date().toISOString(),
                model: model.name,
            };
            await this.storage.addTurn(this.currentConversation.id, assistantTurn);
        }
        // Auto-title if this is the first exchange and setting enabled
        const config = vscode.workspace.getConfiguration('copilotHistory');
        if (config.get('autoTitle') && this.currentConversation.turnCount <= 2) {
            await this.autoTitle(model, request.prompt, token);
        }
        this.onDidUpdateConversation.fire();
        return {};
    }
    /* ------------------------------------------------------------------ */
    /*  Auto-title generation                                              */
    /* ------------------------------------------------------------------ */
    async autoTitle(model, userPrompt, token) {
        if (!this.currentConversation) {
            return;
        }
        try {
            const titleMessages = [
                vscode.LanguageModelChatMessage.User(`Generate a concise 3-6 word title for a conversation that starts with this message. Reply with ONLY the title, no quotes or punctuation:\n\n${userPrompt.slice(0, 200)}`),
            ];
            const resp = await model.sendRequest(titleMessages, {}, token);
            let title = '';
            for await (const chunk of resp.text) {
                title += chunk;
            }
            title = title.trim().slice(0, 80);
            if (title) {
                await this.storage.rename(this.currentConversation.id, title);
                this.currentConversation.title = title;
            }
        }
        catch {
            // Non-critical – keep the original title
        }
    }
}
exports.HistoryChatParticipant = HistoryChatParticipant;
//# sourceMappingURL=chatParticipant.js.map