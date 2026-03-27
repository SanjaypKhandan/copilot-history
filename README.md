# Copilot History

Full conversation history, search, tagging, export and resume for GitHub Copilot Chat.

## Features

- **Full conversation history** — every message through `@history` is recorded with timestamps and model info
- **Sidebar panel** — browse conversations grouped by date (Today / Yesterday / This Week / Older)
- **Search & filter** — find past conversations by keyword across titles and content
- **Tagging & bookmarking** — star important conversations, add custom tags
- **Export** — export any conversation as Markdown or JSON
- **Resume** — continue a past conversation with full context injected into the LLM

## Usage

1. Open the Copilot Chat panel
2. Type `@history` followed by your question
3. Conversations are automatically saved per-workspace
4. Browse history in the **Copilot History** sidebar (clock icon in the activity bar)

### Slash Commands

| Command | Description |
|---------|-------------|
| `/new` | Start a new conversation |
| `/resume <id or title>` | Resume a past conversation |
| `/search <query>` | Search past conversations |

### Context Menu

Right-click any conversation in the sidebar to:
- Star / Unstar
- Add tags
- Export as Markdown or JSON
- Resume
- Delete

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `copilotHistory.maxConversations` | `500` | Maximum conversations to retain |
| `copilotHistory.autoTitle` | `true` | Auto-generate titles using the LLM |

## Requirements

- VS Code 1.90+
- GitHub Copilot extension installed and signed in
# copilot-history
