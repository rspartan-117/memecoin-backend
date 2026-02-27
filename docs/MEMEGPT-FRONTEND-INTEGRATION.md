# Meme GPT — Frontend Integration Guide

> **Backend base URL:** `http://localhost:4000` (dev) or your production API URL.
> **Auth:** Every route (except `/meme-gpt/health`) requires a `Bearer <JWT>` token in the `Authorization` header. The JWT is obtained from your existing auth flow. The backend extracts `userId` from the token automatically — the frontend never needs to send a userId.

---

## Table of Contents

1. [API Routes Overview](#1-api-routes-overview)
2. [TypeScript Types (shared)](#2-typescript-types-shared)
3. [Session Lifecycle — How It Works](#3-session-lifecycle--how-it-works)
4. [Route Details & Contracts](#4-route-details--contracts)
   - 4.1 [Health Check](#41-get-meme-gpthealth)
   - 4.2 [Stream Chat (SSE)](#42-post-meme-gptchatstream)
   - 4.3 [Get Session History (with live status)](#43-get-meme-gptsessionssessionidhistory)
   - 4.4 [Get All Sessions](#44-get-meme-gptsessions)
5. [Complete Frontend Flows](#5-complete-frontend-flows)
   - 5.1 [New Conversation Flow](#51-new-conversation-flow)
   - 5.2 [Continue Existing Conversation Flow](#52-continue-existing-conversation-flow)
   - 5.3 [Session Resume Flow (page reload / tab switch)](#53-session-resume-flow)
   - 5.4 [Session List (sidebar / history page)](#54-session-list-sidebar--history-page)
6. [SSE Event Reference](#6-sse-event-reference)
7. [Code Examples](#7-code-examples)
   - 7.1 [API Client (axios)](#71-api-client)
   - 7.2 [SSE Stream Hook (React)](#72-sse-stream-hook-react)
   - 7.3 [Session Resume Hook (React)](#73-session-resume-hook-react)
   - 7.4 [Full Chat Component Skeleton](#74-full-chat-component-skeleton)
8. [Error Handling](#8-error-handling)
9. [Sequence Diagrams](#9-sequence-diagrams)

---

## 1. API Routes Overview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/meme-gpt/health` | No | Health check |
| `POST` | `/meme-gpt/chat/stream` | Yes | Stream a chat message (SSE) |
| `GET` | `/meme-gpt/sessions/:sessionId/history` | Yes | Get conversation history + live streaming status |
| `GET` | `/meme-gpt/sessions` | Yes | Get all sessions for the authenticated user |

That's it — four routes total.

---

## 2. TypeScript Types (shared)

Copy these into your frontend project (e.g. `src/types/meme-gpt.ts`):

```typescript
// ─── Request ────────────────────────────────────────────
export interface ChatStreamRequest {
  /** Your message to Meme GPT */
  message: string;
  /**
   * Session ID — always required.
   * For a NEW conversation: generate a UUID on the frontend (e.g. crypto.randomUUID()).
   * For a CONTINUING conversation: pass the existing sessionId.
   */
  sessionId: string;
  /** Optional coin ticker to focus the conversation (e.g. "BONK", "WIF") */
  coinName?: string;
}

// ─── SSE Events ─────────────────────────────────────────
/**
 * Each SSE `data` field is JSON-encoded as one of these event types.
 */
export type SSEEventType = 'session' | 'token' | 'tool_call' | 'tool_result' | 'done' | 'error';

export interface SSEEvent {
  type: SSEEventType;
  data: any;
}

/** First event — confirms which session is being used */
export interface SSESessionEvent {
  type: 'session';
  data: {
    sessionId: string;
    /** true = backend just created this session; false = existing session continued */
    isNew: boolean;
  };
}

/** Streamed text token — append to the assistant's current message */
export interface SSETokenEvent {
  type: 'token';
  data: string; // e.g. "Sol", "ana", " meme"
}

/** Tool call notification (research tool invoked) */
export interface SSEToolCallEvent {
  type: 'tool_call';
  data: any; // tool call details
}

/** Stream finished successfully */
export interface SSEDoneEvent {
  type: 'done';
  data: null;
}

/** Error during streaming */
export interface SSEErrorEvent {
  type: 'error';
  data: string; // error message
}

// ─── History Response ───────────────────────────────────
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamingInfo {
  /** All tokens accumulated so far in the current stream */
  partialResponse: string;
  /** Number of tokens received so far */
  tokenCount: number;
  /** ISO timestamp when streaming started */
  startedAt: string;
  /** ISO timestamp of the last token event */
  lastEventAt: string;
}

export interface SessionHistoryResponse {
  sessionId: string;
  /** Full persisted message history (user + assistant messages only) */
  messages: ChatMessage[];
  /** 'streaming' = a stream is currently in progress; 'idle' = nothing happening */
  status: 'streaming' | 'idle';
  /**
   * Non-null only when status === 'streaming'.
   * Contains the partial assistant response accumulated so far.
   */
  streaming: StreamingInfo | null;
  /** Total number of messages */
  count: number;
}

// ─── Sessions List Response ─────────────────────────────
export interface SessionSummary {
  id: string;
  coinName: string;
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  createdAt: string;
  messageCount: number;
  reportCount: number;
}

export interface SessionsListResponse {
  sessions: SessionSummary[];
  count: number;
}
```

---

## 3. Session Lifecycle — How It Works

### Key rule: **The frontend always generates and passes the `sessionId`.**

The backend does NOT generate session IDs for new conversations. Instead:

```
Frontend generates UUID → sends it to POST /chat/stream
                         ↓
              Backend checks DB:
              ├─ Session exists? → continue conversation (isNew: false)
              └─ Session missing? → create it with that exact UUID (isNew: true)
```

This means:
- **No "session not found" errors ever.** Any UUID you send will work.
- **No separate "create session" call needed.** The first `/chat/stream` call creates it.
- **The sessionId is stable** — you can store it in localStorage/URL/state and re-use it forever.

### Session states (from backend DB)

| Status | Meaning |
|--------|---------|
| `ACTIVE` | Conversation is ongoing |
| `COMPLETED` | Research finished (report generated) |
| `ARCHIVED` | Soft-deleted by user |

### Streaming states (from in-memory tracking)

| `status` field in history | Meaning |
|---------------------------|---------|
| `streaming` | Backend is actively sending tokens right now |
| `idle` | No active stream — all messages are persisted |

---

## 4. Route Details & Contracts

### 4.1 `GET /meme-gpt/health`

No auth required. Use for connectivity checks.

**Response `200`:**
```json
{
  "status": "ok",
  "module": "Meme GPT",
  "version": "1.0.0",
  "timestamp": "2026-02-26T12:00:00.000Z"
}
```

---

### 4.2 `POST /meme-gpt/chat/stream`

**The main endpoint.** Sends a user message and streams back the assistant response via Server-Sent Events (SSE).

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
Accept: text/event-stream
```

**Request body:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Tell me about Solana meme coins",
  "coinName": "BONK"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | `string` | **Yes** | UUID — frontend generates this. New UUID = new chat. Existing UUID = continue chat. |
| `message` | `string` | **Yes** | The user's message |
| `coinName` | `string` | No | Optional coin ticker to focus the research |

**Response:** SSE stream (`text/event-stream`). Each event has an `id` and `data` field.

**SSE event sequence:**

```
id: 1
data: {"type":"session","data":{"sessionId":"550e8400-...","isNew":true}}

id: 2
data: {"type":"token","data":"#"}

id: 3
data: {"type":"token","data":" Sol"}

id: 4
data: {"type":"token","data":"ana"}

... (hundreds of token events) ...

id: 738
data: {"type":"done","data":null}
```

**Error responses:**

| Code | When |
|------|------|
| `400` | `sessionId` is missing or empty |
| `401` | Missing / invalid JWT |
| SSE error event | Session already streaming, or LLM failure |

**Duplicate stream guard:** If you call `/chat/stream` while the same session already has an active stream, you'll receive:
```
data: {"type":"error","data":"Session is already processing a request. Wait for it to finish or poll the history endpoint for progress."}
```

---

### 4.3 `GET /meme-gpt/sessions/:sessionId/history`

Returns the full conversation history for a session **plus** real-time streaming status. This is the key endpoint for session resume.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response `200` — when idle (no active stream):**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "messages": [
    { "role": "user", "content": "Tell me about Solana meme coins" },
    { "role": "assistant", "content": "# Solana Meme Coins Overview\n\nSolana has become a **hotbed for meme coins**..." }
  ],
  "status": "idle",
  "streaming": null,
  "count": 2
}
```

**Response `200` — when streaming is in progress:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "messages": [
    { "role": "user", "content": "Tell me about Solana meme coins" },
    { "role": "assistant", "content": "Previous completed message..." },
    { "role": "user", "content": "What about WIF?" }
  ],
  "status": "streaming",
  "streaming": {
    "partialResponse": "# dogwifhat (WIF) Analysis\n\nWIF is a Solana-based meme coin featuring a Shiba Inu wearing a...",
    "tokenCount": 85,
    "startedAt": "2026-02-26T14:30:00.000Z",
    "lastEventAt": "2026-02-26T14:30:02.500Z"
  },
  "count": 3
}
```

**Key points:**
- `messages` array contains only **persisted** (fully completed) user and assistant messages.
- The **latest user message** that triggered the current stream IS included in `messages` (saved before streaming starts).
- The **partial assistant response** being actively streamed is NOT in `messages` — it's in `streaming.partialResponse`.
- When `status` is `idle`, the last assistant message in `messages` is the complete final response.

**Response `404`:**
```json
{
  "message": "Session not found: <sessionId>",
  "error": "Not Found",
  "statusCode": 404
}
```

---

### 4.4 `GET /meme-gpt/sessions`

Returns all sessions for the authenticated user. `userId` is extracted from the JWT — no path parameter needed.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response `200`:**
```json
{
  "sessions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "coinName": "BONK",
      "status": "ACTIVE",
      "createdAt": "2026-02-26T14:00:00.000Z",
      "messageCount": 6,
      "reportCount": 1
    },
    {
      "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "coinName": "General",
      "status": "ACTIVE",
      "createdAt": "2026-02-25T10:30:00.000Z",
      "messageCount": 2,
      "reportCount": 0
    }
  ],
  "count": 2
}
```

---

## 5. Complete Frontend Flows

### 5.1 New Conversation Flow

```
User clicks "New Chat" button
        │
        ▼
Frontend generates a new UUID:
  const sessionId = crypto.randomUUID()
        │
        ▼
Store sessionId in state / URL:
  e.g. /meme-gpt/chat/550e8400-...
        │
        ▼
User types message and clicks Send
        │
        ▼
POST /meme-gpt/chat/stream
  body: { sessionId, message, coinName? }
        │
        ▼
SSE stream begins:
  1. Receive { type: "session", data: { sessionId, isNew: true } }
     → isNew is true — confirms fresh session was created
  2. Receive { type: "token", data: "# Sol" }
     → Append to assistant message bubble
  3. ... more tokens ...
  4. Receive { type: "done", data: null }
     → Mark message as complete, re-enable input
```

**Frontend pseudocode:**
```typescript
const sessionId = crypto.randomUUID();
// Store in state, URL, or localStorage
navigate(`/meme-gpt/chat/${sessionId}`);

// When user sends message:
startStream({ sessionId, message: userInput, coinName: selectedCoin });
```

### 5.2 Continue Existing Conversation Flow

```
User opens an existing session (from sidebar, or via URL)
        │
        ▼
sessionId is already known (from URL / state / session list)
        │
        ▼
GET /meme-gpt/sessions/:sessionId/history
  → Populate chat UI with messages[]
  → Check status field (should be "idle")
        │
        ▼
User types follow-up message and clicks Send
        │
        ▼
POST /meme-gpt/chat/stream
  body: { sessionId, message }
        │
        ▼
SSE stream begins:
  1. Receive { type: "session", data: { sessionId, isNew: false } }
     → isNew is false — confirms we're continuing existing session
  2. Receive tokens... append to UI
  3. Receive { type: "done", data: null }
     → Done
```

### 5.3 Session Resume Flow

**Scenario:** User is in a chat session, the stream is in progress, and they:
- Navigate away (click another page)
- Close the tab
- Refresh the page
- Switch tabs and come back

**When they return to the session page:**

```
Page mounts / user navigates to /meme-gpt/chat/:sessionId
        │
        ▼
GET /meme-gpt/sessions/:sessionId/history
        │
        ├── status: "idle"
        │   → Render messages[] normally
        │   → Show input box, ready for new message
        │   → DONE
        │
        └── status: "streaming"
            → Render messages[] (completed messages)
            → Render streaming.partialResponse as the
              "currently typing" assistant message bubble
            → Show a loading/typing indicator
            → START POLLING (see below)
                │
                ▼
           Poll GET /sessions/:sessionId/history every 1-2 seconds
                │
                ├── status still "streaming"
                │   → Update the assistant bubble with
                │     streaming.partialResponse (latest content)
                │   → Continue polling
                │
                └── status changed to "idle"
                    → STOP polling
                    → The last message in messages[] is now
                      the complete assistant response
                    → Render final messages normally
                    → Re-enable input box
```

**Polling implementation rules:**
1. Poll interval: **1–2 seconds** (don't hammer the server).
2. Stop polling as soon as `status` becomes `idle`.
3. When `idle`, do one final fetch to get the fully persisted messages.
4. Show `streaming.tokenCount` as a progress indicator if desired.
5. Use `streaming.lastEventAt` to detect stale streams (if `lastEventAt` is > 30s ago and status is still `streaming`, the stream may have crashed — show a retry button).

### 5.4 Session List (sidebar / history page)

```
Page mounts (sidebar or /meme-gpt/history)
        │
        ▼
GET /meme-gpt/sessions
        │
        ▼
Render list of sessions:
  sessions.map(s => (
    <SessionItem
      key={s.id}
      title={s.coinName}
      date={s.createdAt}
      messageCount={s.messageCount}
      onClick={() => navigate(`/meme-gpt/chat/${s.id}`)}
    />
  ))
```

When user clicks a session → navigate to the chat view with that `sessionId` → the "Continue Existing Conversation" or "Session Resume" flow kicks in.

---

## 6. SSE Event Reference

Every SSE event from `POST /meme-gpt/chat/stream` has this structure:

```
id: <incrementing_number>
data: <JSON_string>
```

The `data` JSON always has `{ type, data }`:

| `type` | `data` payload | When | Frontend action |
|--------|----------------|------|-----------------|
| `session` | `{ sessionId: string, isNew: boolean }` | Always first event | Confirm session ID. If `isNew` is true, add to session list. |
| `token` | `string` (text fragment) | During generation | Append to the current assistant message bubble. Render markdown incrementally. |
| `tool_call` | `object` (tool details) | When AI invokes research tools | Show "Researching..." indicator. |
| `tool_result` | `object` (result data) | After tool execution | Update research progress UI. |
| `done` | `null` | Stream finished | Mark message as complete. Re-enable user input. Stop any loading indicators. |
| `error` | `string` (error message) | On failure | Show error toast/banner. Re-enable input. Possibly offer retry. |

### Token concatenation example

```
Received tokens:  "#"  " Sol"  "ana"  " M"  "eme"  " Coins"
Concatenated:     "# Solana Meme Coins"
```

The concatenated string is **Markdown**. Render it with a Markdown renderer (e.g. `react-markdown`, `marked`).

---

## 7. Code Examples

### 7.1 API Client

```typescript
// src/lib/meme-gpt-api.ts
import axios from 'axios';
import type { SessionHistoryResponse, SessionsListResponse } from '@/types/meme-gpt';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('jwt_token'); // or however you store it
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Health check */
export const checkHealth = () =>
  api.get('/meme-gpt/health').then((r) => r.data);

/** Get all sessions for authenticated user */
export const getSessions = (): Promise<SessionsListResponse> =>
  api.get('/meme-gpt/sessions').then((r) => r.data);

/** Get session history with streaming status */
export const getSessionHistory = (sessionId: string): Promise<SessionHistoryResponse> =>
  api.get(`/meme-gpt/sessions/${sessionId}/history`).then((r) => r.data);
```

### 7.2 SSE Stream Hook (React)

```typescript
// src/hooks/useMemeGptStream.ts
import { useCallback, useRef, useState } from 'react';
import type { SSEEvent, ChatMessage } from '@/types/meme-gpt';

interface UseMemeGptStreamOptions {
  onSessionConfirmed?: (sessionId: string, isNew: boolean) => void;
  onToken?: (token: string) => void;
  onDone?: (fullResponse: string) => void;
  onError?: (error: string) => void;
}

interface StreamState {
  isStreaming: boolean;
  partialResponse: string;
}

export function useMemeGptStream(options: UseMemeGptStreamOptions = {}) {
  const [state, setState] = useState<StreamState>({
    isStreaming: false,
    partialResponse: '',
  });
  const abortRef = useRef<AbortController | null>(null);

  const startStream = useCallback(
    async (sessionId: string, message: string, coinName?: string) => {
      // Abort any existing stream
      abortRef.current?.abort();
      const abortController = new AbortController();
      abortRef.current = abortController;

      setState({ isStreaming: true, partialResponse: '' });

      const token = localStorage.getItem('jwt_token');

      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/meme-gpt/chat/stream`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              Accept: 'text/event-stream',
            },
            body: JSON.stringify({ sessionId, message, coinName }),
            signal: abortController.signal,
          },
        );

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(errorBody.message || `HTTP ${response.status}`);
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullResponse = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;

            const jsonStr = line.slice(6); // Remove "data: "
            if (!jsonStr.trim()) continue;

            try {
              // The backend wraps in { data: <actual_event> }
              const wrapper = JSON.parse(jsonStr);
              const event: SSEEvent = wrapper.data || wrapper;

              switch (event.type) {
                case 'session':
                  options.onSessionConfirmed?.(event.data.sessionId, event.data.isNew);
                  break;

                case 'token':
                  fullResponse += event.data;
                  setState((prev) => ({
                    ...prev,
                    partialResponse: fullResponse,
                  }));
                  options.onToken?.(event.data);
                  break;

                case 'tool_call':
                  // Show "Researching..." in UI if desired
                  break;

                case 'done':
                  setState({ isStreaming: false, partialResponse: '' });
                  options.onDone?.(fullResponse);
                  return;

                case 'error':
                  setState({ isStreaming: false, partialResponse: '' });
                  options.onError?.(event.data);
                  return;
              }
            } catch {
              // Malformed JSON line — skip
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return; // User cancelled
        setState({ isStreaming: false, partialResponse: '' });
        options.onError?.(err.message);
      }
    },
    [options],
  );

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    setState({ isStreaming: false, partialResponse: '' });
  }, []);

  return {
    startStream,
    stopStream,
    isStreaming: state.isStreaming,
    partialResponse: state.partialResponse,
  };
}
```

### 7.3 Session Resume Hook (React)

```typescript
// src/hooks/useSessionResume.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { getSessionHistory } from '@/lib/meme-gpt-api';
import type { ChatMessage, StreamingInfo, SessionHistoryResponse } from '@/types/meme-gpt';

interface UseSessionResumeResult {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingInfo: StreamingInfo | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * On mount, fetches session history.
 * If the session is currently streaming, starts polling every 1.5s
 * until the stream finishes (status transitions to 'idle').
 */
export function useSessionResume(sessionId: string | null): UseSessionResumeResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingInfo, setStreamingInfo] = useState<StreamingInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!sessionId) return;

    try {
      const data: SessionHistoryResponse = await getSessionHistory(sessionId);

      setMessages(data.messages);
      setIsStreaming(data.status === 'streaming');
      setStreamingInfo(data.streaming);
      setError(null);

      return data;
    } catch (err: any) {
      if (err.response?.status === 404) {
        // Session doesn't exist yet — that's fine for brand new sessions
        setMessages([]);
        setIsStreaming(false);
        setStreamingInfo(null);
      } else {
        setError(err.message);
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  // Initial fetch + start polling if streaming
  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    const init = async () => {
      setIsLoading(true);
      const data = await fetchHistory();
      if (cancelled) return;

      // If currently streaming, start polling
      if (data?.status === 'streaming') {
        pollingRef.current = setInterval(async () => {
          const updated = await fetchHistory();
          if (cancelled) return;

          // Stop polling once status is no longer 'streaming'
          if (!updated || updated.status === 'idle') {
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
          }
        }, 1500); // Poll every 1.5 seconds
      }
    };

    init();

    return () => {
      cancelled = true;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [sessionId, fetchHistory]);

  return {
    messages,
    isStreaming,
    streamingInfo,
    isLoading,
    error,
    refresh: fetchHistory,
  };
}
```

### 7.4 Full Chat Component Skeleton

```tsx
// src/components/MemeGptChat.tsx
import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { useMemeGptStream } from '@/hooks/useMemeGptStream';
import { useSessionResume } from '@/hooks/useSessionResume';
import type { ChatMessage } from '@/types/meme-gpt';

interface Props {
  sessionId: string;
}

export function MemeGptChat({ sessionId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Session resume (load history on mount, poll if streaming) ──
  const resume = useSessionResume(sessionId);

  // Sync resumed messages into local state
  useEffect(() => {
    if (resume.messages.length > 0) {
      setMessages(resume.messages);
    }
  }, [resume.messages]);

  // ── SSE streaming ──
  const stream = useMemeGptStream({
    onSessionConfirmed: (sid, isNew) => {
      console.log(`Session ${sid} — ${isNew ? 'NEW' : 'EXISTING'}`);
    },
    onDone: (fullResponse) => {
      // Add the completed assistant message to the messages array
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: fullResponse },
      ]);
    },
    onError: (err) => {
      console.error('Stream error:', err);
      // Show error toast/notification
    },
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, stream.partialResponse, resume.streamingInfo?.partialResponse]);

  // ── Send message handler ──
  const handleSend = () => {
    const msg = input.trim();
    if (!msg || stream.isStreaming) return;

    // Add user message to UI immediately
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setInput('');

    // Start streaming
    stream.startStream(sessionId, msg);
  };

  // ── Determine what to show as the "in-progress" assistant message ──
  const activePartialResponse = stream.isStreaming
    ? stream.partialResponse // We have a live SSE connection
    : resume.isStreaming
      ? resume.streamingInfo?.partialResponse || '' // Resumed via polling
      : null;

  const isAnyStreamActive = stream.isStreaming || resume.isStreaming;

  return (
    <div className="flex flex-col h-full">
      {/* ── Message list ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {resume.isLoading ? (
          <div className="text-center text-gray-400">Loading conversation...</div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-blue-100 ml-auto max-w-[80%]'
                    : 'bg-gray-100 mr-auto max-w-[80%]'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
            ))}

            {/* ── Currently streaming assistant message ── */}
            {activePartialResponse !== null && (
              <div className="bg-gray-100 mr-auto max-w-[80%] p-3 rounded-lg">
                <ReactMarkdown>{activePartialResponse}</ReactMarkdown>
                <span className="inline-block w-2 h-4 bg-gray-500 animate-pulse ml-1" />
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input area ── */}
      <div className="border-t p-4 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={isAnyStreamActive ? 'Waiting for response...' : 'Ask about a meme coin...'}
          disabled={isAnyStreamActive}
          className="flex-1 border rounded-lg px-4 py-2 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={isAnyStreamActive || !input.trim()}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg disabled:opacity-50"
        >
          {isAnyStreamActive ? 'Streaming...' : 'Send'}
        </button>
        {isAnyStreamActive && (
          <button
            onClick={stream.stopStream}
            className="bg-red-500 text-white px-4 py-2 rounded-lg"
          >
            Stop
          </button>
        )}
      </div>
    </div>
  );
}
```

---

## 8. Error Handling

| Scenario | HTTP Code / Event | Frontend action |
|----------|-------------------|-----------------|
| Missing `sessionId` in stream request | `400 Bad Request` | Should never happen if frontend always generates UUID. Show generic error. |
| Invalid / expired JWT | `401 Unauthorized` | Redirect to login. |
| Session not found on history call | `404 Not Found` | For new sessions before first message, this is expected — show empty chat. For old sessions, show "Session not found" message. |
| Duplicate stream (session already streaming) | SSE `error` event | Show "A response is already in progress" message. Start polling `/history` instead. |
| LLM / network failure during stream | SSE `error` event | Show error message + "Retry" button. |
| SSE connection drops (network issue) | `fetch` throws | Catch in stream hook. Fall back to polling `/history` to get any partial/completed response. |
| Stale streaming state | `streaming.lastEventAt` > 30s ago | Stream may have crashed. Show "Response may have stalled" + retry button. |

### Retry strategy

```typescript
const handleRetry = () => {
  // Re-send the same message
  stream.startStream(sessionId, lastUserMessage);
};
```

---

## 9. Sequence Diagrams

### New Chat

```
┌──────────┐                    ┌──────────┐                    ┌──────────┐
│ Frontend  │                    │ Backend  │                    │    DB    │
└────┬─────┘                    └────┬─────┘                    └────┬─────┘
     │                               │                               │
     │  Generate UUID: "abc-123"     │                               │
     │──────────────────────────────>│                               │
     │  POST /chat/stream            │                               │
     │  { sessionId: "abc-123",      │  Find session "abc-123"      │
     │    message: "Tell me..." }    │──────────────────────────────>│
     │                               │  NOT FOUND                    │
     │                               │<──────────────────────────────│
     │                               │  Create session "abc-123"    │
     │                               │──────────────────────────────>│
     │                               │  OK                           │
     │                               │<──────────────────────────────│
     │                               │                               │
     │  SSE: { type: "session",      │                               │
     │    data: { isNew: true } }    │                               │
     │<──────────────────────────────│                               │
     │                               │  Save user message            │
     │                               │──────────────────────────────>│
     │                               │                               │
     │  SSE: { type: "token", ... }  │  (LLM streaming)             │
     │<──────────────────────────────│                               │
     │  SSE: { type: "token", ... }  │                               │
     │<──────────────────────────────│                               │
     │  ... (many tokens) ...        │                               │
     │                               │  Save assistant message       │
     │                               │──────────────────────────────>│
     │  SSE: { type: "done" }        │                               │
     │<──────────────────────────────│                               │
     │                               │                               │
```

### Session Resume (page reload during stream)

```
┌──────────┐                    ┌──────────┐                    ┌──────────┐
│ Frontend  │                    │ Backend  │                    │ In-Memory│
└────┬─────┘                    └────┬─────┘                    │  State   │
     │                               │                          └────┬─────┘
     │  (Page reloads — SSE connection lost)                         │
     │                               │  (Stream continues in bg)    │
     │                               │  tokens → streamingStates    │
     │                               │─────────────────────────────>│
     │                               │                               │
     │  GET /sessions/abc-123/history│                               │
     │──────────────────────────────>│  Read streamingStates["abc"] │
     │                               │──────────────────────────────>│
     │                               │  { status: "streaming",      │
     │                               │    partialResponse: "..." }  │
     │                               │<──────────────────────────────│
     │  200: { status: "streaming",  │                               │
     │    messages: [...],           │                               │
     │    streaming: {               │                               │
     │      partialResponse: "..."   │                               │
     │    }}                         │                               │
     │<──────────────────────────────│                               │
     │                               │                               │
     │  (Show partial response,      │                               │
     │   start polling every 1.5s)   │                               │
     │                               │                               │
     │  GET /sessions/abc-123/history│  (stream still going)        │
     │──────────────────────────────>│                               │
     │  200: { status: "streaming",  │                               │
     │    streaming.partialResponse  │                               │
     │    is now longer... }         │                               │
     │<──────────────────────────────│                               │
     │                               │                               │
     │  (Poll again 1.5s later...)   │  (stream finishes)           │
     │                               │  streamingState → "idle"     │
     │  GET /sessions/abc-123/history│                               │
     │──────────────────────────────>│                               │
     │  200: { status: "idle",       │                               │
     │    messages: [... + final],   │                               │
     │    streaming: null }          │                               │
     │<──────────────────────────────│                               │
     │                               │                               │
     │  (Stop polling,               │                               │
     │   show complete messages,     │                               │
     │   re-enable input)            │                               │
```

---

## Summary of Rules for the Frontend

1. **Always generate `sessionId` on the frontend** — use `crypto.randomUUID()`.
2. **Store `sessionId`** in the URL, React state, or localStorage.
3. **One endpoint for chat** — `POST /chat/stream`. It handles both new and existing sessions.
4. **First SSE event is always `session`** — check `isNew` to distinguish new vs. continued.
5. **On page load for a chat route**, call `GET /sessions/:sessionId/history` first.
6. **If `status === 'streaming'`**, show `streaming.partialResponse` and start polling.
7. **Poll every 1.5s** until `status` becomes `idle`, then stop and render final messages.
8. **Never send a new message while `isStreaming` is true** — the backend rejects it.
9. **`GET /sessions`** for the sidebar — no userId needed, JWT handles it.
10. **Render all assistant responses as Markdown** — the LLM outputs headers, tables, bold text, emojis, etc.
