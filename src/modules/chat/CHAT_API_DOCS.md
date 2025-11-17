# Chat Module API Documentation

## Overview
Module chat real-time tương tự Facebook/Instagram với WebSocket, **không sử dụng REST API**. Tất cả operations đều thông qua Socket.IO với userId được truyền trong payload của mỗi event.

## WebSocket Events

### Connection
**Namespace:** `/chat`

**Connection URL:** `ws://localhost:3000/chat?userId=YOUR_USER_ID`

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000/chat', {
  query: {
    userId: 'your-user-id'
  }
});
```

---

## Client Events (Emit từ client)

### 1. Lấy danh sách cuộc hội thoại
**Event:** `conversations:get`

**Payload:**
```javascript
{
  userId: string;      // Required
  page?: number;       // Optional, default: 1
  limit?: number;      // Optional, default: 20
}
```

**Response:**
```javascript
{
  success: true,
  data: [
    {
      _id: "conversationId",
      participants: [
        {
          _id: "userId",
          username: "john_doe",
          fullName: "John Doe",
          avatarUrl: "https://..."
        }
      ],
      isGroup: false,
      name: null,
      avatar: null,
      lastMessage: {
        messageId: "messageId",
        text: "Hello!",
        sender: {
          _id: "userId",
          username: "jane_doe",
          fullName: "Jane Doe",
          avatarUrl: "https://..."
        },
        createdAt: "2024-01-01T00:00:00.000Z"
      },
      unreadCount: 5,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z"
    }
  ],
  pagination: {
    currentPage: 1,
    totalPages: 3,
    totalItems: 50,
    itemsPerPage: 20,
    hasNextPage: true,
    hasPrevPage: false
  }
}
```

**Example:**
```javascript
socket.emit('conversations:get', {
  userId: 'your-user-id',
  page: 1,
  limit: 20
}, (response) => {
  console.log(response.data); // Array of conversations
});
```

---

### 2. Tạo cuộc hội thoại mới
**Event:** `conversation:create`

**Payload:**
```javascript
{
  userId: string;              // Required
  participantIds: string[];    // Required - Array of user IDs
  isGroup?: boolean;           // Optional
  name?: string;              // Optional, required if isGroup=true
  avatar?: string;            // Optional
}
```

**Response:**
```javascript
{
  success: true,
  conversation: {
    _id: "conversationId",
    participants: [...],
    isGroup: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z"
  }
}
```

**Example:**
```javascript
socket.emit('conversation:create', {
  userId: 'your-user-id',
  participantIds: ['other-user-id'],
  isGroup: false
}, (response) => {
  console.log(response.conversation);
});
```

**Note:** Nếu đã có cuộc hội thoại 1-1 với user đó, sẽ trả về cuộc hội thoại cũ.

---

### 3. Lấy chi tiết cuộc hội thoại
**Event:** `conversation:get`

**Payload:**
```javascript
{
  userId: string;          // Required
  conversationId: string;  // Required
}
```

**Response:**
```javascript
{
  success: true,
  conversation: {
    _id: "conversationId",
    participants: [...],
    isGroup: false,
    lastMessage: {...},
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z"
  }
}
```

**Example:**
```javascript
socket.emit('conversation:get', {
  userId: 'your-user-id',
  conversationId: 'conversation-id'
}, (response) => {
  console.log(response.conversation);
});
```

---

### 4. Lấy tin nhắn trong cuộc hội thoại
**Event:** `messages:get`

**Payload:**
```javascript
{
  userId: string;          // Required
  conversationId: string;  // Required
  page?: number;           // Optional, default: 1
  limit?: number;          // Optional, default: 50
}
```

**Response:**
```javascript
{
  success: true,
  data: [
    {
      _id: "messageId",
      conversationId: "conversationId",
      sender: {
        _id: "userId",
        username: "john_doe",
        fullName: "John Doe",
        avatarUrl: "https://..."
      },
      text: "Hello!",
      attachments: [],
      reactions: [],
      seenBy: [
        {
          user: {...},
          seenAt: "2024-01-01T00:00:00.000Z"
        }
      ],
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z"
    }
  ],
  pagination: {...}
}
```

**Example:**
```javascript
socket.emit('messages:get', {
  userId: 'your-user-id',
  conversationId: 'conversation-id',
  page: 1,
  limit: 50
}, (response) => {
  console.log(response.data); // Array of messages
});
```

---

### 5. Join vào cuộc hội thoại
**Event:** `conversation:join`

**Payload:**
```javascript
{
  userId: string;          // Required
  conversationId: string;  // Required
}
```

**Response:**
```javascript
{
  success: true,
  conversationId: "conversationId"
}
```

**Example:**
```javascript
socket.emit('conversation:join', {
  userId: 'your-user-id',
  conversationId: 'conversation-id'
}, (response) => {
  console.log('Joined conversation');
});
```

---

### 6. Leave khỏi cuộc hội thoại
**Event:** `conversation:leave`

**Payload:**
```javascript
{
  conversationId: string;  // Required
}
```

**Response:**
```javascript
{
  success: true,
  conversationId: "conversationId"
}
```

**Example:**
```javascript
socket.emit('conversation:leave', {
  conversationId: 'conversation-id'
});
```

---

### 7. Gửi tin nhắn
**Event:** `message:send`

**Payload:**
```javascript
{
  userId: string;          // Required
  conversationId: string;  // Required
  text?: string;           // Optional
  attachments?: [{         // Optional
    url: string;
    type: string;          // image, video, file, audio
    size?: number;
  }];
  replyTo?: string;        // Optional - messageId to reply to
}
```

**Response:**
```javascript
{
  success: true,
  message: {
    _id: "messageId",
    conversationId: "conversationId",
    sender: {...},
    text: "Hello!",
    createdAt: "2024-01-01T00:00:00.000Z"
  }
}
```

**Example:**
```javascript
socket.emit('message:send', {
  userId: 'your-user-id',
  conversationId: 'conversation-id',
  text: 'Hello!'
}, (response) => {
  console.log(response.message);
});
```

---

### 8. User đang typing
**Event:** `typing:start`

**Payload:**
```javascript
{
  userId: string;          // Required
  conversationId: string;  // Required
}
```

**Example:**
```javascript
socket.emit('typing:start', {
  userId: 'your-user-id',
  conversationId: 'conversation-id'
});
```

---

### 9. User dừng typing
**Event:** `typing:stop`

**Payload:**
```javascript
{
  userId: string;          // Required
  conversationId: string;  // Required
}
```

**Example:**
```javascript
socket.emit('typing:stop', {
  userId: 'your-user-id',
  conversationId: 'conversation-id'
});
```

---

### 10. Đánh dấu đã đọc
**Event:** `message:read`

**Payload:**
```javascript
{
  userId: string;          // Required
  conversationId: string;  // Required
  messageId: string;       // Required
}
```

**Response:**
```javascript
{
  success: true
}
```

**Example:**
```javascript
socket.emit('message:read', {
  userId: 'your-user-id',
  conversationId: 'conversation-id',
  messageId: 'message-id'
});
```

**Note:** Đánh dấu tin nhắn này và tất cả tin nhắn trước đó là đã đọc.

---

### 11. React tin nhắn
**Event:** `message:react`

**Payload:**
```javascript
{
  userId: string;          // Required
  conversationId: string;  // Required
  messageId: string;       // Required
  reaction: string;        // Required - emoji
}
```

**Example:**
```javascript
socket.emit('message:react', {
  userId: 'your-user-id',
  conversationId: 'conversation-id',
  messageId: 'message-id',
  reaction: '❤️'
});
```

---

## Server Events (Listen từ server)

### 1. Tin nhắn mới
**Event:** `message:new`

```javascript
socket.on('message:new', (message) => {
  console.log('New message:', message);
  // message structure same as in messages:get response
});
```

---

### 2. User online
**Event:** `user:online`

```javascript
socket.on('user:online', ({ userId }) => {
  console.log('User online:', userId);
});
```

---

### 3. User offline
**Event:** `user:offline`

```javascript
socket.on('user:offline', ({ userId }) => {
  console.log('User offline:', userId);
});
```

---

### 4. User đang typing
**Event:** `typing:start`

```javascript
socket.on('typing:start', ({ conversationId, userId }) => {
  console.log('User typing:', userId);
});
```

---

### 5. User dừng typing
**Event:** `typing:stop`

```javascript
socket.on('typing:stop', ({ conversationId, userId }) => {
  console.log('User stopped typing:', userId);
});
```

---

### 6. Tin nhắn đã được đọc
**Event:** `message:read`

```javascript
socket.on('message:read', ({ conversationId, messageId, userId, readAt }) => {
  console.log('Message read by:', userId);
});
```

---

### 7. Reaction mới
**Event:** `message:reacted`

```javascript
socket.on('message:reacted', ({ conversationId, messageId, userId, reaction }) => {
  console.log('New reaction:', reaction);
});
```

---

## Full Example - React/Next.js

### Setup Socket Connection

```typescript
// hooks/useChat.ts
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export function useChat(userId: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socketInstance = io('http://localhost:3000/chat', {
      query: { userId }
    });

    socketInstance.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to chat');
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from chat');
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.close();
    };
  }, [userId]);

  return { socket, isConnected };
}
```

### Load Conversations

```typescript
async function loadConversations(socket: Socket, userId: string, page = 1) {
  return new Promise((resolve) => {
    socket.emit('conversations:get', {
      userId,
      page,
      limit: 20
    }, (response) => {
      resolve(response);
    });
  });
}

// Usage
const response = await loadConversations(socket, currentUserId, 1);
console.log(response.data); // Array of conversations
```

### Open Conversation and Load Messages

```typescript
async function openConversation(socket: Socket, userId: string, conversationId: string) {
  // Join conversation room
  socket.emit('conversation:join', {
    userId,
    conversationId
  });
  
  // Load messages
  return new Promise((resolve) => {
    socket.emit('messages:get', {
      userId,
      conversationId,
      page: 1,
      limit: 50
    }, (response) => {
      resolve(response);
    });
  });
}

// Usage
const response = await openConversation(socket, currentUserId, conversationId);
console.log(response.data); // Array of messages
```

### Send Message

```typescript
function sendMessage(socket: Socket, userId: string, conversationId: string, text: string) {
  socket.emit('message:send', {
    userId,
    conversationId,
    text
  }, (response) => {
    if (response.success) {
      console.log('Message sent:', response.message);
    }
  });
}

// Listen for new messages
socket.on('message:new', (message) => {
  // Add message to UI
  appendMessageToChat(message);
});
```

### Typing Indicator

```typescript
let typingTimeout: NodeJS.Timeout;

function handleTyping(socket: Socket, userId: string, conversationId: string) {
  socket.emit('typing:start', {
    userId,
    conversationId
  });
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('typing:stop', {
      userId,
      conversationId
    });
  }, 3000);
}

// Listen for typing events
socket.on('typing:start', ({ userId, conversationId }) => {
  showTypingIndicator(userId);
});

socket.on('typing:stop', ({ userId, conversationId }) => {
  hideTypingIndicator(userId);
});
```

### Mark as Read

```typescript
function markAsRead(socket: Socket, userId: string, conversationId: string, messageId: string) {
  socket.emit('message:read', {
    userId,
    conversationId,
    messageId
  });
}

// Listen for read receipts
socket.on('message:read', ({ messageId, userId, readAt }) => {
  updateMessageReadStatus(messageId, userId, readAt);
});
```

### Infinite Scroll for Messages

```typescript
function useMessages(socket: Socket, userId: string, conversationId: string) {
  const [messages, setMessages] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const loadMore = async () => {
    socket.emit('messages:get', {
      userId,
      conversationId,
      page,
      limit: 50
    }, (response) => {
      if (response.success) {
        setMessages(prev => [...prev, ...response.data]);
        setHasMore(response.pagination.hasNextPage);
        setPage(prev => prev + 1);
      }
    });
  };

  return { messages, loadMore, hasMore };
}
```

---

## Features Summary

✅ **Conversations:**
- Get all conversations with pagination
- Create new conversation (1-1 or group)
- Get conversation details

✅ **Messages:**
- Get messages with pagination
- Send messages with attachments
- Reply to messages
- Real-time message delivery

✅ **Real-time Features:**
- Typing indicators
- Online/offline status
- Read receipts
- Message reactions

✅ **Room Management:**
- Join/leave conversations
- Private rooms per conversation

---

## Error Handling

All events return either:
```javascript
{ success: true, ...data }
// or
{ error: "Error message" }
```

Always check for errors:
```javascript
socket.emit('message:send', data, (response) => {
  if (response.error) {
    console.error('Error:', response.error);
    return;
  }
  // Handle success
  console.log(response.message);
});
```

---

## Notes

- Tất cả events **đều truyền userId trong payload**
- Không sử dụng REST API, tất cả thông qua WebSocket
- Connection sử dụng query string: `?userId=xxx`
- Messages được sắp xếp theo thời gian mới nhất (createdAt desc)
- Pagination cho conversations và messages
- Real-time updates qua Socket.IO rooms

---

**Happy Coding! 🚀**
