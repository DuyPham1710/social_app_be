# Chat Module - Real-time Messaging

Module chat real-time đầy đủ tính năng tương tự Facebook/Instagram Messenger, được xây dựng với NestJS, Socket.IO và MongoDB.

## ✨ Tính năng chính

### 🎯 Core Features
- ✅ **Cuộc hội thoại 1-1 và nhóm** - Hỗ trợ cả chat cá nhân và group chat
- ✅ **Tin nhắn real-time** - Gửi và nhận tin nhắn tức thời qua WebSocket
- ✅ **Phân trang thông minh** - Lazy loading cho conversations và messages
- ✅ **Đánh dấu đã đọc** - Seen/Read receipts cho tin nhắn
- ✅ **Typing indicator** - Hiển thị khi người dùng đang soạn tin
- ✅ **Online/Offline status** - Trạng thái trực tuyến của người dùng
- ✅ **Số tin nhắn chưa đọc** - Badge hiển thị unread count
- ✅ **Reply to message** - Trả lời tin nhắn cụ thể
- ✅ **File attachments** - Đính kèm hình ảnh, video, file
- ✅ **Message reactions** - React tin nhắn bằng emoji
- ✅ **Last message preview** - Xem trước tin nhắn cuối cùng

### 🔒 Security
- JWT Authentication ready (cần cấu hình)
- Validation với class-validator
- User permission checks
- Rate limiting ready

### ⚡ Performance
- Database indexes cho query optimization
- Efficient pagination
- Lean queries cho performance
- WebSocket room management

## 📁 Cấu trúc thư mục

```
src/modules/chat/
├── dto/                              # Data Transfer Objects
│   ├── create-conversation.dto.ts
│   ├── send-message.dto.ts
│   ├── get-conversations.dto.ts
│   ├── get-messages.dto.ts
│   ├── conversation-response.dto.ts
│   ├── message-response.dto.ts
│   ├── pagination-response.dto.ts
│   ├── mark-as-read.dto.ts
│   └── index.ts
├── schemas/                          # MongoDB Schemas
│   ├── conversation.schema.ts
│   └── message.schema.ts
├── chat.service.ts                   # Business logic
├── chat.controller.ts                # REST API endpoints
├── chat.gateway.ts                   # WebSocket gateway
├── chat.module.ts                    # Module configuration
├── CHAT_API_DOCS.md                  # API Documentation chi tiết
├── INTEGRATION_GUIDE.md              # Hướng dẫn tích hợp
├── test-client.html                  # Test client (mở trực tiếp bằng browser)
└── README.md                         # File này
```

## 🚀 Quick Start

### 1. Cài đặt dependencies

```bash
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
npm install class-transformer class-validator
```

### 2. Import vào AppModule

```typescript
// app.module.ts
import { ChatModule } from './modules/chat/chat.module';

@Module({
  imports: [
    // ... other imports
    ChatModule,
  ],
})
export class AppModule {}
```

### 3. Test với HTML client

1. Mở file `test-client.html` bằng browser
2. Nhập User ID
3. Click "Connect"
4. Bắt đầu chat!

## 📚 Documentation

### Chi tiết API Endpoints
Xem file: **[CHAT_API_DOCS.md](./CHAT_API_DOCS.md)**

### Hướng dẫn tích hợp đầy đủ
Xem file: **[INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)**

## 🔧 API Endpoints (REST)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/chat/conversations` | Lấy danh sách cuộc hội thoại (có phân trang) |
| POST | `/chat/conversations` | Tạo cuộc hội thoại mới |
| GET | `/chat/conversations/:id` | Lấy chi tiết cuộc hội thoại |
| GET | `/chat/conversations/:id/messages` | Lấy tin nhắn (có phân trang) |
| POST | `/chat/messages` | Gửi tin nhắn |
| POST | `/chat/messages/read` | Đánh dấu đã đọc |

## 🔌 WebSocket Events

### Client Events (Emit)
- `conversation:join` - Join vào cuộc hội thoại
- `conversation:leave` - Rời khỏi cuộc hội thoại
- `message:send` - Gửi tin nhắn
- `typing:start` - Bắt đầu typing
- `typing:stop` - Dừng typing
- `message:read` - Đánh dấu đã đọc
- `message:react` - React tin nhắn

### Server Events (Listen)
- `message:new` - Tin nhắn mới
- `user:online` - User online
- `user:offline` - User offline
- `typing:start` - User đang typing
- `typing:stop` - User dừng typing
- `message:read` - Tin nhắn đã đọc
- `message:reacted` - Reaction mới

## 💡 Usage Examples

### REST API
```typescript
// Get conversations
const response = await fetch('/chat/conversations?page=1&limit=20', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// Send message
const response = await fetch('/chat/messages', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    conversationId: 'xxx',
    text: 'Hello!'
  })
});
```

### WebSocket
```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000/chat', {
  auth: { token: 'your-jwt-token' }
});

// Join conversation
socket.emit('conversation:join', { conversationId: 'xxx' });

// Listen for new messages
socket.on('message:new', (message) => {
  console.log('New message:', message);
});

// Send message
socket.emit('message:send', {
  conversationId: 'xxx',
  text: 'Hello!'
});
```

## 🔐 Security Setup

**⚠️ QUAN TRỌNG:** Module hiện tại chưa có authentication. Để deploy lên production:

1. **Uncomment JWT Guards** trong `chat.controller.ts`
2. **Implement WebSocket Auth** trong `chat.gateway.ts`
3. **Xem chi tiết** trong [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)

## 📊 Database Schema

### Conversation
```typescript
{
  _id: ObjectId,
  participants: [ObjectId], // User IDs
  isGroup: boolean,
  name?: string,
  avatar?: string,
  createdBy: ObjectId,
  lastMessage: {
    messageId: ObjectId,
    text: string,
    sender: ObjectId,
    createdAt: Date
  },
  createdAt: Date,
  updatedAt: Date
}
```

### Message
```typescript
{
  _id: ObjectId,
  conversationId: ObjectId,
  senderId: ObjectId,
  text?: string,
  attachments: [{
    url: string,
    type: string, // image, video, file, audio
    size: number
  }],
  replyTo?: ObjectId,
  reactions: [{
    userId: ObjectId,
    reaction: string // emoji
  }],
  seenBy: [{
    userId: ObjectId,
    seenAt: Date
  }],
  deletedForEveryone: boolean,
  deletedFor: [ObjectId],
  createdAt: Date,
  updatedAt: Date
}
```

## 🎨 Frontend Integration

### React/Next.js Example

```typescript
// hooks/useChat.ts
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export function useChat(token: string) {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const socketInstance = io('http://localhost:3000/chat', {
      auth: { token }
    });

    socketInstance.on('message:new', (message) => {
      setMessages(prev => [message, ...prev]);
    });

    setSocket(socketInstance);

    return () => socketInstance.close();
  }, [token]);

  const sendMessage = (conversationId, text) => {
    socket?.emit('message:send', { conversationId, text });
  };

  return { socket, messages, sendMessage };
}
```

## 🧪 Testing

### Test với Postman/Thunder Client
```
GET http://localhost:3000/chat/conversations?page=1&limit=20
Authorization: Bearer YOUR_TOKEN
```

### Test với Browser
Mở file `test-client.html` trong browser và làm theo hướng dẫn.

## 🔥 Performance Tips

1. **Add Database Indexes** (đã có trong code)
2. **Enable Compression** cho WebSocket
3. **Implement Caching** với Redis
4. **Use CDN** cho file attachments
5. **Optimize Images** trước khi upload

## 🐛 Troubleshooting

### WebSocket không kết nối được
- Kiểm tra CORS configuration
- Verify JWT token format
- Check firewall settings

### Tin nhắn không real-time
- Ensure đã join conversation room
- Check socket connection status
- Verify event names

### Performance issues
- Add database indexes
- Implement pagination properly
- Check N+1 query problems

## 🚦 Deployment Checklist

- [ ] Add JWT authentication
- [ ] Configure CORS properly
- [ ] Add rate limiting
- [ ] Setup Redis for scaling
- [ ] Add database indexes
- [ ] Implement file upload to cloud storage
- [ ] Add monitoring and logging
- [ ] Setup SSL/TLS
- [ ] Configure environment variables
- [ ] Test WebSocket on production

## 📈 Future Improvements

- [ ] Voice messages
- [ ] Video calls (WebRTC)
- [ ] Message search
- [ ] Delete/Edit messages
- [ ] Forward messages
- [ ] Pin conversations
- [ ] Mute notifications
- [ ] Block users
- [ ] Group management (add/remove members)
- [ ] Admin roles in groups

## 🤝 Contributing

Module này đã được xây dựng hoàn chỉnh và ready để sử dụng. Nếu cần thêm tính năng, tham khảo code hiện tại và mở rộng.

## 📝 License

MIT

## 💬 Support

Nếu gặp vấn đề:
1. Check [CHAT_API_DOCS.md](./CHAT_API_DOCS.md)
2. Check [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)
3. Check browser console logs
4. Check server logs
5. Verify database connection

---

**Built with ❤️ using NestJS, Socket.IO, and MongoDB**

