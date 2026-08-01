"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import { useSendChatbotMessage, useGetCurrentUser } from "@/api-client";
import { Button } from "@/components/ui/button";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatbotContextValue {
  /** Opens the floating widget and, if given, sends `prompt` as the first turn immediately. */
  askAbout: (prompt: string) => void;
  /**
   * Sends `prompt` as a user turn WITHOUT opening the floating popup, and
   * returns the index the assistant's reply will occupy in `messages`. Lets a
   * page (e.g. practice results) surface that one answer inline as its own card
   * instead of taking over the screen with the bubble. Returns null if a send
   * is already in flight.
   */
  sendSeeded: (prompt: string) => number | null;
  /** The shared conversation, so an inline surface can render the same thread. */
  messages: ChatMessage[];
  /** Draft input value + setter for a controlled inline composer. */
  draft: string;
  setDraft: (v: string) => void;
  /** Submit the current draft (or a passed string) as a user turn. */
  submitMessage: (content: string) => void;
  /** True while awaiting an assistant reply. */
  isPending: boolean;
}

const ChatbotContext = createContext<ChatbotContextValue | null>(null);

/** Lets any page (e.g. the practice reveal panel) drive or render the assistant. */
export function useChatbot(): ChatbotContextValue {
  const ctx = useContext(ChatbotContext);
  if (!ctx) throw new Error("useChatbot must be used within ChatbotProvider");
  return ctx;
}

function greetingFor(name: string | undefined): ChatMessage {
  return {
    role: "assistant",
    content: `Hi${name ? `, ${name}` : ""}. I'm the PhishAware Assistant. Ask me about a red flag you're unsure of, why a scenario was or wasn't a phish, or anything about staying safe from social engineering.`,
  };
}

/** Starter prompts shown only before the user's first message -- one tap away, no typing required. */
const QUICK_PROMPTS = [
  "What's the most common phishing red flag?",
  "How do BEC scams usually work?",
  "Give me a tip to improve my next practice round",
];

export function ChatbotProvider({ children }: { children: ReactNode }) {
  // Already fetched (and cached) by Layout -- this is a free cache hit, not
  // a second network call, and lets the greeting feel personally addressed
  // rather than generic.
  const { data: user } = useGetCurrentUser({ query: { retry: false } });
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([greetingFor(user?.name?.split(" ")[0])]);
  const [draft, setDraft] = useState("");
  const send = useSendChatbotMessage();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  };

  const sendTurn = (history: ChatMessage[]) => {
    send.mutate(
      { data: { messages: history } },
      {
        onSuccess: (data) => {
          setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
          scrollToBottom();
        },
        onError: () => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "Sorry, I couldn't reach the assistant just now. Please try again in a moment.",
            },
          ]);
          scrollToBottom();
        },
      },
    );
  };

  const submitMessage = (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || send.isPending) return;
    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(next);
    setDraft("");
    scrollToBottom();
    sendTurn(next);
  };

  const askAbout: ChatbotContextValue["askAbout"] = (prompt) => {
    setOpen(true);
    submitMessage(prompt);
  };

  // Same as submitMessage but leaves the floating popup closed and hands back
  // the slot the assistant reply will land in, so an inline surface can show
  // just that answer. Appends both the user turn and (async) the reply.
  const sendSeeded: ChatbotContextValue["sendSeeded"] = (prompt) => {
    const trimmed = prompt.trim();
    if (!trimmed || send.isPending) return null;
    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(next);
    sendTurn(next);
    // The assistant reply is appended after `next`, so it will be at index next.length.
    return next.length;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitMessage(draft);
  };

  const contextValue: ChatbotContextValue = {
    askAbout,
    sendSeeded,
    messages,
    draft,
    setDraft,
    submitMessage,
    isPending: send.isPending,
  };

  return (
    <ChatbotContext.Provider value={contextValue}>
      {children}

      <div className="fixed bottom-20 md:bottom-6 right-2 sm:right-4 md:right-6 z-50 flex flex-col items-end">
        {open && (
          <div className="mb-3 w-[min(26rem,calc(100vw-1rem))] sm:w-[min(26rem,calc(100vw-2rem))] lg:w-120 h-[clamp(20rem,70vh,42rem)] bg-card border border-border rounded-xl shadow-xl flex flex-col overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-primary/5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="bg-primary text-primary-foreground p-1.5 rounded-lg shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-display font-semibold text-sm truncate leading-tight">PhishAware Assistant</p>
                  <p className="text-[11px] text-muted-foreground leading-tight flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />
                    Always here to help
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close assistant"
                className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
              <ChatMessageList messages={messages} isPending={send.isPending} />

              {/* One-tap starter prompts -- hassle-free discovery of value before anyone's typed a word. */}
              {messages.length === 1 && !send.isPending && (
                <div className="mt-4 space-y-1.5">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => submitMessage(prompt)}
                      className="w-full text-left text-xs font-medium px-3 py-2 rounded-lg border border-border bg-background hover:bg-primary/5 hover:border-primary/30 transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <ChatComposer
              draft={draft}
              setDraft={setDraft}
              onSubmit={handleSubmit}
              disabled={send.isPending}
            />
          </div>
        )}

        <Button
          onClick={() => setOpen((v) => !v)}
          size="icon"
          className="w-14 h-14 rounded-full shadow-lg relative"
          aria-label={open ? "Close assistant" : "Open PhishAware Assistant"}
        >
          {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
          {!open && (
            <span className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full bg-success border-2 border-background animate-pulse" />
          )}
        </Button>
      </div>
    </ChatbotContext.Provider>
  );
}

/** Shared message-list rendering used by both the floating popup and inline panels. */
export function ChatMessageList({
  messages,
  isPending,
}: {
  messages: ChatMessage[];
  isPending: boolean;
}) {
  return (
    <div className="space-y-3">
      {messages.map((m, i) => (
        <div
          key={i}
          className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
            m.role === "user"
              ? "ml-auto bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          }`}
        >
          {m.content}
        </div>
      ))}
      {isPending && (
        <div className="bg-muted text-muted-foreground max-w-[85%] rounded-lg px-3 py-2 text-sm">
          Thinking…
        </div>
      )}
    </div>
  );
}

/** Shared composer (text input + send button) used by both the popup and inline panels. */
export function ChatComposer({
  draft,
  setDraft,
  onSubmit,
  disabled,
}: {
  draft: string;
  setDraft: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  disabled: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="border-t border-border p-3 flex gap-2">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Ask about a red flag…"
        aria-label="Message"
        className="flex-1 min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <Button type="submit" size="icon" disabled={disabled || !draft.trim()} aria-label="Send">
        <Send className="w-4 h-4" />
      </Button>
    </form>
  );
}
