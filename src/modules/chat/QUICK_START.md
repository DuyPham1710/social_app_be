# 🚀 Chat Module - Quick Start

## Chỉ WebSocket, Không REST API!

Module này **chỉ sử dụng WebSocket**, tương tự module comment. **Không có Controller**, tất cả operations qua Socket.IO với **userId trong payload**.

---

## 📦 1. Import Module

```typescript
// app.module.ts
import { ChatModule } from './modules/chat/chat.module';

@Module({
  imports: [
    // ... other modules
    ChatModule,  // Thêm dòng này
  ],
})
export class AppModule {}
```

---

## 🔌 2. Connect Socket (Client)

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000/chat', {
  query: {
    userId: 'your-user-id'  // userId qua query string
  }
});

socket.on('connect', () => {
  console.log('Connected!');
});
```

---

## 💬 3. Các Events Chính

### Get Conversations
```typescript
socket.emit('conversations:get', {
  userId: 'your-user-id',
  page: 1,
  limit: 20
}, (response) => {
  console.log(response.data); // Array of conversations
});
```

### Join Conversation
```typescript
socket.emit('conversation:join', {
  userId: 'your-user-id',
  conversationId: 'conversation-id'
});
```

### Get Messages
```typescript
socket.emit('messages:get', {
  userId: 'your-user-id',
  conversationId: 'conversation-id',
  page: 1,
  limit: 50
}, (response) => {
  console.log(response.data); // Array of messages
});
```

### Send Message
```typescript
socket.emit('message:send', {
  userId: 'your-user-id',
  conversationId: 'conversation-id',
  text: 'Hello!'
}, (response) => {
  console.log(response.message);
});
```

### Listen for New Messages
```typescript
socket.on('message:new', (message) => {
  console.log('New message:', message);
  // Update UI
});
```

---

## 🎯 4. All Events Reference

### Client → Server

| Event | Payload |
|-------|---------|
| `conversations:get` | `{ userId, page?, limit? }` |
| `conversation:create` | `{ userId, participantIds, isGroup?, name? }` |
| `conversation:get` | `{ userId, conversationId }` |
| `messages:get` | `{ userId, conversationId, page?, limit? }` |
| `conversation:join` | `{ userId, conversationId }` |
| `message:send` | `{ userId, conversationId, text }` |
| `typing:start` | `{ userId, conversationId }` |
| `typing:stop` | `{ userId, conversationId }` |
| `message:read` | `{ userId, conversationId, messageId }` |

### Server → Client

| Event | Data |
|-------|------|
| `message:new` | `message object` |
| `user:online` | `{ userId }` |
| `user:offline` | `{ userId }` |
| `typing:start` | `{ conversationId, userId }` |
| `typing:stop` | `{ conversationId, userId }` |
| `message:read` | `{ conversationId, messageId, userId }` |

---

## 🧪 5. Test Ngay

**Mở file `test-client.html` bằng browser:**
1. Nhập Server URL: `http://localhost:3000`
2. Nhập User ID
3. Click "Connect"
4. Bắt đầu chat! 🎉

---

## ✨ Key Points

- ✅ **Không có REST API** - Chỉ WebSocket
- ✅ **userId trong payload** - Mỗi event phải có userId
- ✅ **Phân trang** - Conversations & messages hỗ trợ page/limit
- ✅ **Real-time** - Socket.IO với rooms
- ✅ **Pattern giống comment module**

---

## 📚 Full Documentation

- **CHAT_API_DOCS.md** - Chi tiết tất cả events với examples
- **README.md** - Tổng quan module
- **SUMMARY.md** - Implementation summary

---

## 💡 React Hook Example

```typescript
// hooks/useChat.ts
export function useChat(userId: string) {
  const [socket, setSocket] = useState(null);
  
  useEffect(() => {
    const s = io('http://localhost:3000/chat', {
      query: { userId }
    });
    
    s.on('message:new', (message) => {
      // Handle new message
    });
    
    setSocket(s);
    return () => s.close();
  }, [userId]);
  
  const getConversations = (page = 1) => {
    return new Promise((resolve) => {
      socket.emit('conversations:get', {
        userId,
        page,
        limit: 20
      }, resolve);
    });
  };
  
  const sendMessage = (conversationId, text) => {
    socket.emit('message:send', {
      userId,
      conversationId,
      text
    });
  };
  
  return { socket, getConversations, sendMessage };
}
```

---

**That's it! Module sẵn sàng để sử dụng! 🚀**

