import * as vscode from 'vscode';

/** A single turn in a conversation */
export interface ConversationTurn {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    model?: string;
    command?: string;
    references?: string[];
}

/** Metadata for a conversation (stored in the index) */
export interface ConversationMeta {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    tags: string[];
    starred: boolean;
    turnCount: number;
    preview: string;
}

/** Full conversation record */
export interface Conversation extends ConversationMeta {
    turns: ConversationTurn[];
}

/** Groups for the tree view */
export type DateGroup = 'Today' | 'Yesterday' | 'This Week' | 'This Month' | 'Older';

/** Tree item types discriminator */
export type TreeItemType = 'group' | 'conversation';
