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
exports.ConversationNode = exports.GroupNode = exports.ConversationTreeProvider = void 0;
const vscode = __importStar(require("vscode"));
/**
 * TreeView provider for the Copilot History sidebar.
 *
 * Displays conversations grouped by date.
 */
class ConversationTreeProvider {
    storage;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    filterText = '';
    constructor(storage) {
        this.storage = storage;
    }
    refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }
    setFilter(text) {
        this.filterText = text.toLowerCase();
        this.refresh();
    }
    /* ------------------------------------------------------------------ */
    /*  TreeDataProvider                                                    */
    /* ------------------------------------------------------------------ */
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (!element) {
            return this.getGroups();
        }
        if (element instanceof GroupNode) {
            return element.children;
        }
        return [];
    }
    /* ------------------------------------------------------------------ */
    /*  Grouping logic                                                     */
    /* ------------------------------------------------------------------ */
    getGroups() {
        let conversations = this.storage.list();
        // Apply text filter
        if (this.filterText) {
            conversations = conversations.filter(c => c.title.toLowerCase().includes(this.filterText) ||
                c.tags.some(t => t.toLowerCase().includes(this.filterText)));
        }
        const groups = new Map();
        const now = new Date();
        for (const conv of conversations) {
            const group = getDateGroup(new Date(conv.updatedAt), now);
            if (!groups.has(group)) {
                groups.set(group, []);
            }
            groups.get(group).push(conv);
        }
        const order = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'];
        const result = [];
        for (const label of order) {
            const items = groups.get(label);
            if (items && items.length > 0) {
                const children = items.map(m => new ConversationNode(m));
                result.push(new GroupNode(label, children));
            }
        }
        return result;
    }
}
exports.ConversationTreeProvider = ConversationTreeProvider;
class GroupNode extends vscode.TreeItem {
    label;
    children;
    constructor(label, children) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.label = label;
        this.children = children;
        this.contextValue = 'group';
        this.iconPath = new vscode.ThemeIcon('calendar');
    }
}
exports.GroupNode = GroupNode;
class ConversationNode extends vscode.TreeItem {
    meta;
    constructor(meta) {
        super(meta.title, vscode.TreeItemCollapsibleState.None);
        this.meta = meta;
        this.contextValue = 'conversation';
        this.description = `${meta.turnCount} turns`;
        this.tooltip = new vscode.MarkdownString(`**${meta.title}**\n\n` +
            `Turns: ${meta.turnCount}  \n` +
            `Updated: ${meta.updatedAt}  \n` +
            `Tags: ${meta.tags.join(', ') || 'none'}  \n` +
            `${meta.starred ? '⭐ Starred' : ''}`);
        this.iconPath = meta.starred
            ? new vscode.ThemeIcon('star-full')
            : new vscode.ThemeIcon('comment-discussion');
        this.command = {
            command: 'copilotHistory.openConversation',
            title: 'Open Conversation',
            arguments: [meta.id],
        };
    }
}
exports.ConversationNode = ConversationNode;
/* ------------------------------------------------------------------ */
/*  Date helpers                                                       */
/* ------------------------------------------------------------------ */
function getDateGroup(date, now) {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    if (date >= startOfToday) {
        return 'Today';
    }
    if (date >= startOfYesterday) {
        return 'Yesterday';
    }
    if (date >= startOfWeek) {
        return 'This Week';
    }
    if (date >= startOfMonth) {
        return 'This Month';
    }
    return 'Older';
}
//# sourceMappingURL=treeView.js.map