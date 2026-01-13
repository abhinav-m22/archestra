"use client";

import { isToday, isWithinInterval, isYesterday, subDays } from "date-fns";
import { MessageSquare, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useConversations } from "@/lib/chat.query";

/**
 * Extracts a display title for a conversation.
 * Priority: explicit title > first user message > "New chat"
 * Matches the behavior of the sidebar to ensure consistency.
 */
function getConversationDisplayTitle(
  title: string | null,
  // biome-ignore lint/suspicious/noExplicitAny: UIMessage structure from AI SDK is dynamic
  messages?: any[],
): string {
  if (title) return title;

  // Extract from first user message only (not AI responses)
  if (messages && messages.length > 0) {
    for (const msg of messages) {
      if (msg.role === "user" && msg.parts) {
        for (const part of msg.parts) {
          if (part.type === "text" && part.text) {
            return part.text;
          }
        }
      }
    }
  }

  return "New chat";
}

/**
 * Extracts all text content from messages for search purposes.
 * Unlike getConversationDisplayTitle, this includes all messages (user + AI).
 */
function extractTextFromMessages(
  // biome-ignore lint/suspicious/noExplicitAny: UIMessage structure from AI SDK is dynamic
  messages?: any[],
): string {
  if (!messages || messages.length === 0) return "";

  const textParts: string[] = [];
  for (const msg of messages) {
    if (msg.parts && Array.isArray(msg.parts)) {
      for (const part of msg.parts) {
        if (part.type === "text" && part.text) {
          textParts.push(part.text);
        }
      }
    }
  }
  return textParts.join(" ");
}

/** Checks if a conversation matches the search query (title or content) */
function matchesQuery(query: string, title: string, content: string): boolean {
  if (!query.trim()) return true;

  const queryLower = query.toLowerCase().trim();
  const titleLower = title.toLowerCase();
  const contentLower = content.toLowerCase();

  return titleLower.includes(queryLower) || contentLower.includes(queryLower);
}

/**
 * Calculates relevance score for search results.
 * Scoring: title match (100) > title prefix match (+50) > early content match (15) > late content match (10)
 */
function calculateMatchScore(
  query: string,
  title: string,
  content: string,
): number {
  if (!query) return 0;

  const queryLower = query.toLowerCase().trim();
  const titleLower = title.toLowerCase();
  const contentLower = content.toLowerCase();

  let score = 0;

  if (titleLower.includes(queryLower)) {
    score += 100;
    if (titleLower.startsWith(queryLower)) {
      score += 50;
    }
  }

  const contentMatchIndex = contentLower.indexOf(queryLower);
  if (contentMatchIndex !== -1) {
    score += 10;
    if (contentMatchIndex < 100) {
      score += 5;
    }
  }

  return score;
}

/** Groups conversations into time-based buckets for organized display */
function groupConversationsByDate<T extends { updatedAt: string | Date }>(
  conversations: T[],
) {
  const today: T[] = [];
  const yesterday: T[] = [];
  const previous7Days: T[] = [];
  const older: T[] = [];

  const now = new Date();
  const sevenDaysAgo = subDays(now, 7);

  for (const conv of conversations) {
    const updatedAt = new Date(conv.updatedAt);
    if (isToday(updatedAt)) {
      today.push(conv);
    } else if (isYesterday(updatedAt)) {
      yesterday.push(conv);
    } else if (isWithinInterval(updatedAt, { start: sevenDaysAgo, end: now })) {
      previous7Days.push(conv);
    } else {
      older.push(conv);
    }
  }

  return { today, yesterday, previous7Days, older };
}

interface ConversationSearchPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConversationSearchPalette({
  open,
  onOpenChange,
}: ConversationSearchPaletteProps) {
  const router = useRouter();
  const { data: conversations = [], isLoading } = useConversations();
  const [searchQuery, setSearchQuery] = useState("");

  // Filter conversations based on search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) {
      // When no search, return all conversations grouped by date
      return conversations;
    }

    const query = searchQuery.trim();
    const results = conversations
      .map((conv) => {
        const title = conv.title || "";
        const content = extractTextFromMessages(conv.messages);
        const displayTitle = getConversationDisplayTitle(
          conv.title,
          conv.messages,
        );

        return {
          ...conv,
          displayTitle,
          title,
          content,
          score: calculateMatchScore(query, title, content),
        };
      })
      .filter((conv) => matchesQuery(query, conv.title, conv.content))
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      });

    return results;
  }, [conversations, searchQuery]);

  const groupedConversations = useMemo(() => {
    if (searchQuery.trim()) {
      return null;
    }
    return groupConversationsByDate(filteredConversations);
  }, [filteredConversations, searchQuery]);

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
    }
  }, [open]);

  const handleSelectConversation = (conversationId: string) => {
    router.push(`/chat?conversation=${conversationId}`);
    onOpenChange(false);
  };

  const handleNewChat = () => {
    router.push("/chat");
    onOpenChange(false);
  };

  /** Generates a contextual preview snippet, highlighting the search query if present */
  const getPreviewText = (
    // biome-ignore lint/suspicious/noExplicitAny: UIMessage structure from AI SDK is dynamic
    messages?: any[],
    query?: string,
  ): string => {
    const content = extractTextFromMessages(messages);
    if (!content) return "";

    if (query?.trim()) {
      const queryLower = query.toLowerCase();
      const contentLower = content.toLowerCase();
      const matchIndex = contentLower.indexOf(queryLower);

      if (matchIndex !== -1) {
        const start = Math.max(0, matchIndex - 50);
        const end = Math.min(content.length, matchIndex + query.length + 100);
        let snippet = content.slice(start, end);
        if (start > 0) snippet = `...${snippet}`;
        if (end < content.length) snippet = `${snippet}...`;
        return snippet;
      }
    }

    if (content.length <= 150) return content;
    return `${content.slice(0, 150)}...`;
  };

  /** Wraps search term matches in <span> elements for visual highlighting */
  const highlightMatch = (text: string, query: string): React.ReactNode => {
    if (!query.trim()) return text;

    const parts: React.ReactNode[] = [];
    const regex = new RegExp(
      `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "gi",
    );
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    // biome-ignore lint/suspicious/noAssignInExpressions: Standard regex exec pattern
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      parts.push(
        <span key={match.index} className="font-semibold">
          {match[0]}
        </span>,
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  const renderConversationItem = (
    conv: (typeof filteredConversations)[number],
    showPreview = false,
  ) => {
    const preview = showPreview
      ? getPreviewText(conv.messages, searchQuery)
      : "";
    const displayTitle = getConversationDisplayTitle(conv.title, conv.messages);

    return (
      <CommandItem
        key={conv.id}
        value={`${displayTitle} ${preview}`}
        onSelect={() => handleSelectConversation(conv.id)}
        className="flex flex-col items-start gap-1.5 px-3 py-2.5 cursor-pointer aria-selected:bg-accent rounded-sm w-full"
      >
        <div className="flex items-start gap-2 w-full min-w-0">
          <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm flex-1 min-w-0 break-words leading-snug line-clamp-2">
            {displayTitle}
          </span>
        </div>
        {showPreview && preview && (
          <div className="text-xs text-muted-foreground line-clamp-2 w-full pl-6">
            {highlightMatch(preview, searchQuery)}
          </div>
        )}
      </CommandItem>
    );
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search conversations"
      description="Search through your conversation history"
      className="max-w-2xl"
    >
      <CommandInput
        placeholder="Search chats..."
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList className="max-h-[500px]">
        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Loading conversations...
          </div>
        ) : (
          <>
            {!searchQuery.trim() && (
              <CommandGroup>
                <CommandItem
                  onSelect={handleNewChat}
                  className="flex items-center gap-2 px-3 py-3 cursor-pointer aria-selected:bg-accent"
                >
                  <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="font-medium">New chat</span>
                </CommandItem>
              </CommandGroup>
            )}

            {searchQuery.trim() ? (
              filteredConversations.length === 0 ? (
                <CommandEmpty>No conversations found.</CommandEmpty>
              ) : (
                <CommandGroup heading="Conversations">
                  {filteredConversations.map((conv) =>
                    renderConversationItem(conv, true),
                  )}
                </CommandGroup>
              )
            ) : groupedConversations ? (
              <>
                {groupedConversations.today.length > 0 && (
                  <CommandGroup heading="Today">
                    {groupedConversations.today.map((conv) =>
                      renderConversationItem(conv),
                    )}
                  </CommandGroup>
                )}
                {groupedConversations.yesterday.length > 0 && (
                  <CommandGroup heading="Yesterday">
                    {groupedConversations.yesterday.map((conv) =>
                      renderConversationItem(conv),
                    )}
                  </CommandGroup>
                )}
                {groupedConversations.previous7Days.length > 0 && (
                  <CommandGroup heading="Previous 7 Days">
                    {groupedConversations.previous7Days.map((conv) =>
                      renderConversationItem(conv),
                    )}
                  </CommandGroup>
                )}
                {groupedConversations.older.length > 0 && (
                  <CommandGroup heading="Previous 30 Days">
                    {groupedConversations.older.map((conv) =>
                      renderConversationItem(conv),
                    )}
                  </CommandGroup>
                )}
                {filteredConversations.length === 0 && (
                  <CommandEmpty>No conversations yet.</CommandEmpty>
                )}
              </>
            ) : null}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
