import * as vscode from 'vscode';
import { ConversationStorage } from './storage';
import { ConversationMeta, DateGroup } from './types';

/**
 * TreeView provider for the Copilot History sidebar.
 *
 * Displays conversations grouped by date.
 */
export class ConversationTreeProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private filterText = '';

    constructor(private storage: ConversationStorage) {}

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    setFilter(text: string): void {
        this.filterText = text.toLowerCase();
        this.refresh();
    }

    /* ------------------------------------------------------------------ */
    /*  TreeDataProvider                                                    */
    /* ------------------------------------------------------------------ */

    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeNode): Promise<TreeNode[]> {
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

    private getGroups(): GroupNode[] {
        let conversations = this.storage.list();

        // Apply text filter
        if (this.filterText) {
            conversations = conversations.filter(c =>
                c.title.toLowerCase().includes(this.filterText) ||
                c.tags.some(t => t.toLowerCase().includes(this.filterText))
            );
        }

        const groups = new Map<DateGroup, ConversationMeta[]>();
        const now = new Date();

        for (const conv of conversations) {
            const group = getDateGroup(new Date(conv.updatedAt), now);
            if (!groups.has(group)) { groups.set(group, []); }
            groups.get(group)!.push(conv);
        }

        const order: DateGroup[] = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'];
        const result: GroupNode[] = [];

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

/* ------------------------------------------------------------------ */
/*  Tree nodes                                                         */
/* ------------------------------------------------------------------ */

export type TreeNode = GroupNode | ConversationNode;

export class GroupNode extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly children: ConversationNode[],
    ) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'group';
        this.iconPath = new vscode.ThemeIcon('calendar');
    }
}

export class ConversationNode extends vscode.TreeItem {
    constructor(public readonly meta: ConversationMeta) {
        super(meta.title, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'conversation';
        this.description = `${meta.turnCount} turns`;
        this.tooltip = new vscode.MarkdownString(
            `**${meta.title}**\n\n` +
            `Turns: ${meta.turnCount}  \n` +
            `Updated: ${meta.updatedAt}  \n` +
            `Tags: ${meta.tags.join(', ') || 'none'}  \n` +
            `${meta.starred ? '⭐ Starred' : ''}`
        );
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

/* ------------------------------------------------------------------ */
/*  Date helpers                                                       */
/* ------------------------------------------------------------------ */

function getDateGroup(date: Date, now: Date): DateGroup {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    if (date >= startOfToday) { return 'Today'; }
    if (date >= startOfYesterday) { return 'Yesterday'; }
    if (date >= startOfWeek) { return 'This Week'; }
    if (date >= startOfMonth) { return 'This Month'; }
    return 'Older';
}
