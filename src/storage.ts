import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Conversation, ConversationMeta, ConversationTurn } from './types';

/**
 * Per-workspace conversation storage using JSON files.
 *
 * Layout:
 *   <storageUri>/
 *     index.json          – array of ConversationMeta
 *     conversations/
 *       <id>.json         – full Conversation objects
 */
export class ConversationStorage {
    private indexPath: string;
    private conversationsDir: string;
    private index: ConversationMeta[] = [];

    constructor(private storageUri: vscode.Uri) {
        const base = storageUri.fsPath;
        this.indexPath = path.join(base, 'index.json');
        this.conversationsDir = path.join(base, 'conversations');
    }

    /* ------------------------------------------------------------------ */
    /*  Initialisation                                                     */
    /* ------------------------------------------------------------------ */

    async init(): Promise<void> {
        await fs.promises.mkdir(this.conversationsDir, { recursive: true });

        if (fs.existsSync(this.indexPath)) {
            const raw = await fs.promises.readFile(this.indexPath, 'utf-8');
            this.index = JSON.parse(raw) as ConversationMeta[];
        } else {
            this.index = [];
            await this.flushIndex();
        }
    }

    /* ------------------------------------------------------------------ */
    /*  CRUD                                                               */
    /* ------------------------------------------------------------------ */

    /** Create a new conversation and return it */
    async create(title: string): Promise<Conversation> {
        const id = generateId();
        const now = new Date().toISOString();
        const conv: Conversation = {
            id,
            title,
            createdAt: now,
            updatedAt: now,
            tags: [],
            starred: false,
            turnCount: 0,
            preview: '',
            turns: [],
        };

        await this.writeConversation(conv);
        this.index.unshift(this.toMeta(conv));
        await this.flushIndex();
        return conv;
    }

    /** Append a turn to an existing conversation */
    async addTurn(id: string, turn: ConversationTurn): Promise<Conversation | undefined> {
        const conv = await this.get(id);
        if (!conv) { return undefined; }

        conv.turns.push(turn);
        conv.updatedAt = new Date().toISOString();
        conv.turnCount = conv.turns.length;
        conv.preview = turn.content.slice(0, 120);

        await this.writeConversation(conv);
        this.updateMeta(conv);
        await this.flushIndex();
        return conv;
    }

    /** Get a full conversation by id */
    async get(id: string): Promise<Conversation | undefined> {
        const filePath = this.convPath(id);
        if (!fs.existsSync(filePath)) { return undefined; }
        const raw = await fs.promises.readFile(filePath, 'utf-8');
        return JSON.parse(raw) as Conversation;
    }

    /** List all conversation metadata, newest first */
    list(): ConversationMeta[] {
        return [...this.index];
    }

    /** Delete a conversation */
    async delete(id: string): Promise<void> {
        const filePath = this.convPath(id);
        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
        }
        this.index = this.index.filter(m => m.id !== id);
        await this.flushIndex();
    }

    /* ------------------------------------------------------------------ */
    /*  Mutations                                                          */
    /* ------------------------------------------------------------------ */

    async toggleStar(id: string): Promise<boolean> {
        const conv = await this.get(id);
        if (!conv) { return false; }
        conv.starred = !conv.starred;
        await this.writeConversation(conv);
        this.updateMeta(conv);
        await this.flushIndex();
        return conv.starred;
    }

    async setTags(id: string, tags: string[]): Promise<void> {
        const conv = await this.get(id);
        if (!conv) { return; }
        conv.tags = tags;
        await this.writeConversation(conv);
        this.updateMeta(conv);
        await this.flushIndex();
    }

    async rename(id: string, newTitle: string): Promise<void> {
        const conv = await this.get(id);
        if (!conv) { return; }
        conv.title = newTitle;
        await this.writeConversation(conv);
        this.updateMeta(conv);
        await this.flushIndex();
    }

    /* ------------------------------------------------------------------ */
    /*  Search                                                             */
    /* ------------------------------------------------------------------ */

    /** Full-text search across titles & turn content */
    async search(query: string): Promise<ConversationMeta[]> {
        const q = query.toLowerCase();
        const results: ConversationMeta[] = [];

        for (const meta of this.index) {
            if (meta.title.toLowerCase().includes(q)) {
                results.push(meta);
                continue;
            }
            const conv = await this.get(meta.id);
            if (conv && conv.turns.some(t => t.content.toLowerCase().includes(q))) {
                results.push(meta);
            }
        }
        return results;
    }

    /* ------------------------------------------------------------------ */
    /*  Export                                                              */
    /* ------------------------------------------------------------------ */

    async exportMarkdown(id: string): Promise<string | undefined> {
        const conv = await this.get(id);
        if (!conv) { return undefined; }

        const lines: string[] = [
            `# ${conv.title}`,
            '',
            `**Created:** ${conv.createdAt}  `,
            `**Tags:** ${conv.tags.length ? conv.tags.join(', ') : 'none'}  `,
            `**Starred:** ${conv.starred ? 'Yes' : 'No'}`,
            '',
            '---',
            '',
        ];

        for (const turn of conv.turns) {
            const role = turn.role === 'user' ? '**You**' : '**Copilot**';
            lines.push(`### ${role}  `);
            lines.push(`_${turn.timestamp}_\n`);
            lines.push(turn.content);
            lines.push('');
        }

        return lines.join('\n');
    }

    async exportJson(id: string): Promise<string | undefined> {
        const conv = await this.get(id);
        if (!conv) { return undefined; }
        return JSON.stringify(conv, null, 2);
    }

    /* ------------------------------------------------------------------ */
    /*  Pruning                                                            */
    /* ------------------------------------------------------------------ */

    async prune(maxConversations: number): Promise<void> {
        if (this.index.length <= maxConversations) { return; }

        // Keep starred conversations regardless
        const starred = this.index.filter(m => m.starred);
        const unstarred = this.index.filter(m => !m.starred);

        const toRemove = unstarred.slice(maxConversations - starred.length);
        for (const meta of toRemove) {
            const filePath = this.convPath(meta.id);
            if (fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath);
            }
        }

        const keepIds = new Set([
            ...starred.map(m => m.id),
            ...unstarred.slice(0, maxConversations - starred.length).map(m => m.id),
        ]);
        this.index = this.index.filter(m => keepIds.has(m.id));
        await this.flushIndex();
    }

    /* ------------------------------------------------------------------ */
    /*  Private helpers                                                    */
    /* ------------------------------------------------------------------ */

    private convPath(id: string): string {
        // Sanitize id to prevent path traversal
        const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
        return path.join(this.conversationsDir, `${safeId}.json`);
    }

    private toMeta(conv: Conversation): ConversationMeta {
        return {
            id: conv.id,
            title: conv.title,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt,
            tags: conv.tags,
            starred: conv.starred,
            turnCount: conv.turnCount,
            preview: conv.preview,
        };
    }

    private updateMeta(conv: Conversation): void {
        const idx = this.index.findIndex(m => m.id === conv.id);
        if (idx >= 0) {
            this.index[idx] = this.toMeta(conv);
        }
    }

    private async writeConversation(conv: Conversation): Promise<void> {
        await fs.promises.writeFile(this.convPath(conv.id), JSON.stringify(conv, null, 2), 'utf-8');
    }

    private async flushIndex(): Promise<void> {
        await fs.promises.writeFile(this.indexPath, JSON.stringify(this.index, null, 2), 'utf-8');
    }
}

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

function generateId(): string {
    const time = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `${time}-${rand}`;
}
