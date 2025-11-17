# Chat Module Integration Guide

## Tổng quan
Module chat đã được tạo hoàn chỉnh với đầy đủ tính năng. Hướng dẫn này sẽ giúp bạn tích hợp vào ứng dụng chính.

## Files đã được tạo

### 1. DTOs (Data Transfer Objects)
- ✅ `dto/create-conversation.dto.ts` - Tạo cuộc hội thoại
- ✅ `dto/send-message.dto.ts` - Gửi tin nhắn
- ✅ `dto/get-conversations.dto.ts` - Query params cho pagination
- ✅ `dto/get-messages.dto.ts` - Query params cho pagination
- ✅ `dto/conversation-response.dto.ts` - Response cuộc hội thoại
- ✅ `dto/message-response.dto.ts` - Response tin nhắn
- ✅ `dto/pagination-response.dto.ts` - Pagination response
- ✅ `dto/mark-as-read.dto.ts` - Đánh dấu đã đọc
- ✅ `dto/index.ts` - Export tất cả DTOs

### 2. Schemas
- ✅ `schemas/conversation.schema.ts` - Schema cuộc hội thoại (đã cập nhật)
- ✅ `schemas/message.schema.ts` - Schema tin nhắn (đã cập nhật)

### 3. Services & Controllers
- ✅ `chat.service.ts` - Service xử lý logic chat
- ✅ `chat.controller.ts` - REST API endpoints
- ✅ `chat.gateway.ts` - WebSocket gateway
- ✅ `chat.module.ts` - Module configuration

### 4. Documentation
- ✅ `CHAT_API_DOCS.md` - API documentation chi tiết
- ✅ `INTEGRATION_GUIDE.md` - Hướng dẫn tích hợp (file này)

---

## Bước 1: Cài đặt Dependencies

Nếu chưa có, cài đặt các package cần thiết:

```bash
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
npm install class-transformer class-validator
```

---

## Bước 2: Import ChatModule vào AppModule

Mở file `app.module.ts` và import `ChatModule`:

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatModule } from './modules/chat/chat.module';
// ... other imports

@Module({
  imports: [
    MongooseModule.forRoot('your-mongodb-connection-string'),
    ChatModule, // Thêm dòng này
    // ... other modules
  ],
  // ...
})
export class AppModule {}
```

---

## Bước 3: Cấu hình CORS cho WebSocket (nếu cần)

Nếu frontend và backend chạy trên domain khác nhau, cập nhật `main.ts`:

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:3001'], // Frontend URLs
    credentials: true,
  });
  
  await app.listen(3000);
}
bootstrap();
```

---

## Bước 4: Setup Authentication (Quan trọng!)

Module chat hiện tại chưa có authentication. Để bảo mật, cần implement:

### 4.1. Tạo JWT Auth Guard cho REST API

```typescript
// src/modules/auth/guards/jwt-auth.guard.ts
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
```

### 4.2. Tạo WebSocket Auth Guard

```typescript
// src/modules/auth/guards/ws-jwt.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient();
    const token = client.handshake.auth.token || 
                  client.handshake.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return false;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      client.userId = payload.userId || payload.sub;
      return true;
    } catch {
      return false;
    }
  }
}
```

### 4.3. Apply Guards vào Chat Module

Cập nhật `chat.controller.ts`:

```typescript
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('chat')
@UseGuards(JwtAuthGuard) // Uncomment dòng này
export class ChatController {
  // ...
}
```

Cập nhật `chat.gateway.ts`:

```typescript
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard';

@WebSocketGateway(...)
@UseGuards(WsJwtGuard) // Thêm dòng này
export class ChatGateway {
  // ...
  
  async handleConnection(client: AuthenticatedSocket) {
    // client.userId đã được set bởi WsJwtGuard
    // Xóa phần lấy userId từ query string
    console.log(`Client connected: ${client.id} - User: ${client.userId}`);
    // ...
  }
}
```

---

## Bước 5: Add Database Indexes (Tối ưu Performance)

Thêm indexes vào schemas để tối ưu query:

```typescript
// conversation.schema.ts
export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// Add indexes
ConversationSchema.index({ participants: 1, updatedAt: -1 });
ConversationSchema.index({ isGroup: 1 });
ConversationSchema.index({ 'lastMessage.createdAt': -1 });
```

```typescript
// message.schema.ts
export const MessageSchema = SchemaFactory.createForClass(Message);

// Add indexes
MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1, createdAt: -1 });
MessageSchema.index({ 'seenBy.userId': 1 });
MessageSchema.index({ deletedFor: 1 });
```

---

## Bước 6: Test các API Endpoints

### 6.1. Test bằng Postman/Thunder Client

**1. Get Conversations:**
```
GET http://localhost:3000/chat/conversations?page=1&limit=20
Headers:
  Authorization: Bearer YOUR_JWT_TOKEN
```

**2. Create Conversation:**
```
POST http://localhost:3000/chat/conversations
Headers:
  Authorization: Bearer YOUR_JWT_TOKEN
  Content-Type: application/json
Body:
{
  "participantIds": ["USER_ID_HERE"],
  "isGroup": false
}
```

**3. Get Messages:**
```
GET http://localhost:3000/chat/conversations/CONVERSATION_ID/messages?page=1&limit=50
Headers:
  Authorization: Bearer YOUR_JWT_TOKEN
```

**4. Send Message:**
```
POST http://localhost:3000/chat/messages
Headers:
  Authorization: Bearer YOUR_JWT_TOKEN
  Content-Type: application/json
Body:
{
  "conversationId": "CONVERSATION_ID",
  "text": "Hello!"
}
```

### 6.2. Test WebSocket với Frontend

**HTML Test Page:**
```html
<!DOCTYPE html>
<html>
<head>
  <title>Chat Test</title>
  <script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
</head>
<body>
  <h1>Chat Test</h1>
  <div id="messages"></div>
  <input id="messageInput" type="text" placeholder="Type a message...">
  <button onclick="sendMessage()">Send</button>

  <script>
    const socket = io('http://localhost:3000/chat', {
      auth: {
        token: 'YOUR_JWT_TOKEN'
      }
    });

    socket.on('connect', () => {
      console.log('Connected!');
      // Join a conversation
      socket.emit('conversation:join', {
        conversationId: 'YOUR_CONVERSATION_ID'
      });
    });

    socket.on('message:new', (message) => {
      console.log('New message:', message);
      const div = document.getElementById('messages');
      div.innerHTML += `<p>${message.sender.username}: ${message.text}</p>`;
    });

    function sendMessage() {
      const input = document.getElementById('messageInput');
      socket.emit('message:send', {
        conversationId: 'YOUR_CONVERSATION_ID',
        text: input.value
      });
      input.value = '';
    }
  </script>
</body>
</html>
```

---

## Bước 7: Frontend Integration (React/Next.js)

### 7.1. Install Socket.IO Client

```bash
npm install socket.io-client
```

### 7.2. Create Chat Context

```typescript
// contexts/ChatContext.tsx
import { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface ChatContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const ChatContext = createContext<ChatContextType>({
  socket: null,
  isConnected: false,
});

export function ChatProvider({ children, token }: { children: React.ReactNode; token: string }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socketInstance = io('http://localhost:3000/chat', {
      auth: { token }
    });

    socketInstance.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to chat server');
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from chat server');
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.close();
    };
  }, [token]);

  return (
    <ChatContext.Provider value={{ socket, isConnected }}>
      {children}
    </ChatContext.Provider>
  );
}

export const useChat = () => useContext(ChatContext);
```

### 7.3. Create Chat Hook

```typescript
// hooks/useConversation.ts
import { useEffect, useState } from 'react';
import { useChat } from '../contexts/ChatContext';

export function useConversation(conversationId: string) {
  const { socket } = useChat();
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!socket || !conversationId) return;

    // Join conversation
    socket.emit('conversation:join', { conversationId });

    // Listen for new messages
    socket.on('message:new', (message) => {
      setMessages(prev => [message, ...prev]);
    });

    // Cleanup
    return () => {
      socket.emit('conversation:leave', { conversationId });
      socket.off('message:new');
    };
  }, [socket, conversationId]);

  const sendMessage = (text: string) => {
    if (!socket) return;
    
    socket.emit('message:send', {
      conversationId,
      text
    });
  };

  return { messages, sendMessage };
}
```

---

## Bước 8: Environment Variables

Thêm vào `.env`:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/your_database

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# CORS
FRONTEND_URL=http://localhost:3000

# WebSocket
WS_PORT=3000
```

---

## Testing Checklist

- [ ] REST API endpoints hoạt động
- [ ] WebSocket connection thành công
- [ ] Gửi và nhận tin nhắn real-time
- [ ] Pagination hoạt động đúng
- [ ] Typing indicator hoạt động
- [ ] Mark as read hoạt động
- [ ] Authentication đã được apply
- [ ] Unread count hiển thị chính xác
- [ ] Group chat hoạt động
- [ ] File attachments hoạt động (nếu có)

---

## Common Issues & Solutions

### 1. WebSocket không kết nối được
**Giải pháp:**
- Kiểm tra CORS configuration
- Kiểm tra firewall settings
- Verify JWT token đang được gửi đúng

### 2. Tin nhắn không real-time
**Giải pháp:**
- Kiểm tra đã join conversation room chưa
- Verify socket connection status
- Check server logs

### 3. Pagination không hoạt động
**Giải pháp:**
- Kiểm tra query parameters
- Verify limit và page values
- Check database indexes

### 4. Performance chậm
**Giải pháp:**
- Add database indexes (xem Bước 5)
- Implement caching (Redis)
- Optimize populate queries

---

## Next Steps

1. **File Upload:** Implement file upload cho attachments
2. **Notifications:** Push notifications cho tin nhắn mới
3. **Message Search:** Tìm kiếm tin nhắn
4. **Delete/Edit:** Xóa và sửa tin nhắn
5. **Group Management:** Quản lý nhóm (add/remove members)
6. **Voice/Video Call:** Tích hợp WebRTC

---

## Support

Nếu có vấn đề, check:
1. Server logs: `console.log` trong gateway và service
2. Client logs: Browser console
3. Network tab: Kiểm tra WebSocket connection
4. MongoDB logs: Verify queries

Happy coding! 🚀

