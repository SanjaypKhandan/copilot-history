import * as vscode from 'vscode';
import { ConversationStorage } from './storage';
import { Conversation, ConversationTurn } from './types';

/**
 * The @history chat participant.
 *
 * It proxies user messages to Copilot's language model,
 * streams back the response, and records every turn.
 */
export class HistoryChatParticipant {
    private currentConversation: Conversation | undefined;
    private participant: vscode.ChatParticipant;
    private onDidUpdateConversation: vscode.EventEmitter<void> = new vscode.EventEmitter();
    readonly onConversationUpdated: vscode.Event<void> = this.onDidUpdateConversation.event;

    /** Map of conversation IDs queued for resume */
    private resumeQueue = new Map<string, true>();

    constructor(private storage: ConversationStorage) {
        this.participant = vscode.chat.createChatParticipant(
            'copilot-history.chat',
            this.handleRequest.bind(this),
        );
        this.participant.iconPath = new vscode.ThemeIcon('history');
    }

    dispose(): void {
        this.participant.dispose();
        this.onDidUpdateConversation.dispose();
    }

    /** Queue a conversation to be resumed on the next user message */
    queueResume(conversationId: string): void {
        this.resumeQueue.set(conversationId, true);
    }

    /* ------------------------------------------------------------------ */
    /*  Request handler                                                    */
    /* ------------------------------------------------------------------ */

    private async handleRequest(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken,
    ): Promise<vscode.ChatResult> {
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

    private async handleNew(
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken,
    ): Promise<vscode.ChatResult> {
        const titleHint = request.prompt.trim() || 'New Conversation';
        this.currentConversation = await this.storage.create(titleHint);
        this.onDidUpdateConversation.fire();

        stream.markdown(`Started new conversation: **${this.currentConversation.title}**\n\nType your question to begin.`);
        return {};
    }

    /* ------------------------------------------------------------------ */
    /*  /resume                                                            */
    /* ------------------------------------------------------------------ */

    private async handleResume(
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken,
    ): Promise<vscode.ChatResult> {
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
        stream.markdown(
            `Resumed conversation: **${conv.title}** (${conv.turnCount} turns)\n\n` +
            `Last message: _${conv.preview}_\n\nSend your next message to continue.`
        );
        return {};
    }

    /* ------------------------------------------------------------------ */
    /*  /search                                                            */
    /* ------------------------------------------------------------------ */

    private async handleSearch(
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream,
    ): Promise<vscode.ChatResult> {
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

        const lines = results.slice(0, 20).map((m, i) =>
            `${i + 1}. **${m.title}** — ${m.turnCount} turns, _${m.updatedAt}_ ${m.starred ? '⭐' : ''}`
        );
        stream.markdown(`### Search results for "${query}"\n\n${lines.join('\n')}`);
        return {};
    }

    /* ------------------------------------------------------------------ */
    /*  LLM proxy (core flow)                                              */
    /* ------------------------------------------------------------------ */

    private async proxyToLLM(
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken,
    ): Promise<vscode.ChatResult> {
        // Ensure we have an active conversation
        if (!this.currentConversation) {
            const title = request.prompt.slice(0, 60) || 'Untitled';
            this.currentConversation = await this.storage.create(title);
            this.onDidUpdateConversation.fire();
        }

        // Record user turn
        const userTurn: ConversationTurn = {
            role: 'user',
            content: request.prompt,
            timestamp: new Date().toISOString(),
            command: request.command,
            references: request.references.map(r => String(r.id)),
        };
        await this.storage.addTurn(this.currentConversation.id, userTurn);

        // Build LLM messages from stored history
        const messages: vscode.LanguageModelChatMessage[] = [];

        // System message
        messages.push(
            vscode.LanguageModelChatMessage.User(
                'You are a helpful programming assistant. Answer concisely and accurately.'
            ),
        );

        // Inject prior turns (cap to last 40 to stay within context limits)
        const turns = this.currentConversation.turns.slice(-40);
        for (const t of turns) {
            if (t.role === 'user') {
                messages.push(vscode.LanguageModelChatMessage.User(t.content));
            } else {
                messages.push(vscode.LanguageModelChatMessage.Assistant(t.content));
            }
        }

        // Current user message (already appended to turns above via addTurn, but
        // we re-add it explicitly because addTurn didn't reload currentConversation.turns)
        const conv = await this.storage.get(this.currentConversation.id);
        if (conv) { this.currentConversation = conv; }

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
        } catch (err: unknown) {
            if (err instanceof vscode.LanguageModelError) {
                stream.markdown(`\n\n_Error: ${err.message}_`);
            } else {
                throw err;
            }
        }

        // Record assistant turn
        if (responseText) {
            const assistantTurn: ConversationTurn = {
                role: 'assistant',
                content: responseText,
                timestamp: new Date().toISOString(),
                model: model.name,
            };
            await this.storage.addTurn(this.currentConversation.id, assistantTurn);
        }

        // Auto-title if this is the first exchange and setting enabled
        const config = vscode.workspace.getConfiguration('copilotHistory');
        if (config.get<boolean>('autoTitle') && this.currentConversation.turnCount <= 2) {
            await this.autoTitle(model, request.prompt, token);
        }

        this.onDidUpdateConversation.fire();
        return {};
    }

    /* ------------------------------------------------------------------ */
    /*  Auto-title generation                                              */
    /* ------------------------------------------------------------------ */

    private async autoTitle(
        model: vscode.LanguageModelChat,
        userPrompt: string,
        token: vscode.CancellationToken,
    ): Promise<void> {
        if (!this.currentConversation) { return; }
        try {
            const titleMessages = [
                vscode.LanguageModelChatMessage.User(
                    `Generate a concise 3-6 word title for a conversation that starts with this message. Reply with ONLY the title, no quotes or punctuation:\n\n${userPrompt.slice(0, 200)}`
                ),
            ];
            const resp = await model.sendRequest(titleMessages, {}, token);
            let title = '';
            for await (const chunk of resp.text) { title += chunk; }
            title = title.trim().slice(0, 80);
            if (title) {
                await this.storage.rename(this.currentConversation.id, title);
                this.currentConversation.title = title;
            }
        } catch {
            // Non-critical – keep the original title
        }
    }
}
