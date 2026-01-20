import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, StopCircle, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

interface PlanningChatProps {
  projectPath: string | null;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  tasks?: {
    added?: string[];
    updated?: string[];
    removed?: string[];
  };
}

export function PlanningChat({ projectPath }: PlanningChatProps) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch planning status
  const { data: status } = useQuery({
    queryKey: ["planning", "status"],
    queryFn: async () => {
      const res = await fetch("/api/planning/status");
      if (!res.ok) return { active: false, messages: [] };
      return res.json();
    },
    enabled: !!projectPath,
    refetchInterval: 5000,
  });

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch("/api/planning/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(error.error || "Failed to send message");
      }
      return res.json();
    },
    onMutate: async (message) => {
      // Optimistically add user message
      const userMessage: Message = {
        id: `temp-${Date.now()}`,
        role: "user",
        content: message,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
    },
    onSuccess: (data) => {
      // Add assistant response
      const assistantMessage: Message = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: data.response,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Invalidate tasks if changed
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error) => {
      // Add error message
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `Error: ${error.message}`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    },
  });

  // Start session mutation
  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/planning/start", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to start session");
      return res.json();
    },
    onSuccess: () => {
      setMessages([]);
      queryClient.invalidateQueries({ queryKey: ["planning", "status"] });
    },
  });

  // End session mutation
  const endMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/planning/end", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to end session");
      return res.json();
    },
    onSuccess: () => {
      setMessages([]);
      queryClient.invalidateQueries({ queryKey: ["planning", "status"] });
    },
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle send
  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || sendMutation.isPending) return;

    sendMutation.mutate(trimmed);
    setInput("");
  };

  // Handle keyboard shortcut
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!projectPath) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Select a project first</p>
      </div>
    );
  }

  const isActive = status?.active;

  return (
    <div className="flex flex-1 flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Planning Mode</h2>
          {isActive && (
            <span className="text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full">
              Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isActive ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => endMutation.mutate()}
              disabled={endMutation.isPending}
            >
              <StopCircle className="h-4 w-4 mr-1" />
              End Session
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
            >
              Start Planning
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <Sparkles className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              Plan Your Project
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Describe what you want to build, and Claude will help you break it
              down into tasks. You can iterate on the plan until you're happy
              with it.
            </p>
            {!isActive && (
              <Button
                className="mt-4"
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending}
              >
                Start Planning Session
              </Button>
            )}
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  {msg.tasks && (
                    <div className="mt-2 pt-2 border-t border-border/50 text-xs opacity-70">
                      {msg.tasks.added && msg.tasks.added.length > 0 && (
                        <span className="text-green-500">
                          +{msg.tasks.added.length} tasks{" "}
                        </span>
                      )}
                      {msg.tasks.updated && msg.tasks.updated.length > 0 && (
                        <span className="text-blue-500">
                          ~{msg.tasks.updated.length} updated{" "}
                        </span>
                      )}
                      {msg.tasks.removed && msg.tasks.removed.length > 0 && (
                        <span className="text-red-500">
                          -{msg.tasks.removed.length} removed
                        </span>
                      )}
                    </div>
                  )}
                  <p className="text-xs opacity-50 mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      {isActive && (
        <div className="border-t border-border p-4">
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe what you want to build..."
              className="min-h-[80px] resize-none"
              disabled={sendMutation.isPending}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || sendMutation.isPending}
              className="self-end"
            >
              {sendMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Press Cmd+Enter to send
          </p>
        </div>
      )}
    </div>
  );
}
