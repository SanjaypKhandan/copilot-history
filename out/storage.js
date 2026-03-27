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
exports.ConversationStorage = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
/**
 * Per-workspace conversation storage using JSON files.
 *
 * Layout:
 *   <storageUri>/
 *     index.json          – array of ConversationMeta
 *     conversations/
 *       <id>.json         – full Conversation objects
 */
class ConversationStorage {
    storageUri;
    indexPath;
    conversationsDir;
    index = [];
    constructor(storageUri) {
        this.storageUri = storageUri;
        const base = storageUri.fsPath;
        this.indexPath = path.join(base, 'index.json');
        this.conversationsDir = path.join(base, 'conversations');
    }
    /* ------------------------------------------------------------------ */
    /*  Initialisation                                                     */
    /* ------------------------------------------------------------------ */
    async init() {
        await fs.promises.mkdir(this.conversationsDir, { recursive: true });
        if (fs.existsSync(this.indexPath)) {
            const raw = await fs.promises.readFile(this.indexPath, 'utf-8');
            this.index = JSON.parse(raw);
        }
        else {
            this.index = [];
            await this.flushIndex();
        }
    }
    /* ------------------------------------------------------------------ */
    /*  CRUD                                                               */
    /* ------------------------------------------------------------------ */
    /** Create a new conversation and return it */
    async create(title) {
        const id = generateId();
        const now = new Date().toISOString();
        const conv = {
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
    async addTurn(id, turn) {
        const conv = await this.get(id);
        if (!conv) {
            return undefined;
        }
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
    async get(id) {
        const filePath = this.convPath(id);
        if (!fs.existsSync(filePath)) {
            return undefined;
        }
        const raw = await fs.promises.readFile(filePath, 'utf-8');
        return JSON.parse(raw);
    }
    /** List all conversation metadata, newest first */
    list() {
        return [...this.index];
    }
    /** Delete a conversation */
    async delete(id) {
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
    async toggleStar(id) {
        const conv = await this.get(id);
        if (!conv) {
            return false;
        }
        conv.starred = !conv.starred;
        await this.writeConversation(conv);
        this.updateMeta(conv);
        await this.flushIndex();
        return conv.starred;
    }
    async setTags(id, tags) {
        const conv = await this.get(id);
        if (!conv) {
            return;
        }
        conv.tags = tags;
        await this.writeConversation(conv);
        this.updateMeta(conv);
        await this.flushIndex();
    }
    async rename(id, newTitle) {
        const conv = await this.get(id);
        if (!conv) {
            return;
        }
        conv.title = newTitle;
        await this.writeConversation(conv);
        this.updateMeta(conv);
        await this.flushIndex();
    }
    /* ------------------------------------------------------------------ */
    /*  Search                                                             */
    /* ------------------------------------------------------------------ */
    /** Full-text search across titles & turn content */
    async search(query) {
        const q = query.toLowerCase();
        const results = [];
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
    async exportMarkdown(id) {
        const conv = await this.get(id);
        if (!conv) {
            return undefined;
        }
        const lines = [
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
    async exportJson(id) {
        const conv = await this.get(id);
        if (!conv) {
            return undefined;
        }
        return JSON.stringify(conv, null, 2);
    }
    /* ------------------------------------------------------------------ */
    /*  Pruning                                                            */
    /* ------------------------------------------------------------------ */
    async prune(maxConversations) {
        if (this.index.length <= maxConversations) {
            return;
        }
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
    convPath(id) {
        // Sanitize id to prevent path traversal
        const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
        return path.join(this.conversationsDir, `${safeId}.json`);
    }
    toMeta(conv) {
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
    updateMeta(conv) {
        const idx = this.index.findIndex(m => m.id === conv.id);
        if (idx >= 0) {
            this.index[idx] = this.toMeta(conv);
        }
    }
    async writeConversation(conv) {
        await fs.promises.writeFile(this.convPath(conv.id), JSON.stringify(conv, null, 2), 'utf-8');
    }
    async flushIndex() {
        await fs.promises.writeFile(this.indexPath, JSON.stringify(this.index, null, 2), 'utf-8');
    }
}
exports.ConversationStorage = ConversationStorage;
/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */
function generateId() {
    const time = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `${time}-${rand}`;
}
//# sourceMappingURL=storage.js.map