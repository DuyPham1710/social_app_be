# 🚀 Hướng dẫn Test WebSocket Comment System (Không cần JWT Auth)

## ✅ **Updated System:**
- ❌ Không cần JWT token
- ✅ Frontend Flutter truyền userId trực tiếp
- ✅ Đơn giản và dễ test hơn

---

## 📋 **Testing Flow với Postman:**

### **Step 1: Kết nối WebSocket**
- **URL**: `ws://localhost:3000/comment`
- **No Headers needed!**
- **Click Connect**

**Expected Response:**
```json
{
  "message": "Connected to comment service. Please send connect event with userId.",
  "socketId": "abc123",
  "timestamp": "2024-10-07T..."
}
```

---

### **Step 2: Register User**
**Send Event:**
```json
{
  "event": "register",
  "data": {
    "userId": "68af2546e5af803fed30af6c",
    "username": "testuser"
  }
}
```

**Expected Response:**
```json
{
  "message": "Successfully registered",
  "userId": "68af2546e5af803fed30af6c",
  "username": "testuser",
  "socketId": "abc123",
  "timestamp": "2024-10-07T..."
}
```

---

### **Step 3: Join Post**
**Send Event:**
```json
{
  "event": "joinPost",
  "data": {
    "postId": "60d5ecb54b24a92d4c8e4a1b"
  }
}
```

**Expected Response:**
```json
{
  "postId": "60d5ecb54b24a92d4c8e4a1b",
  "userId": "68af2546e5af803fed30af6c",
  "message": "Successfully joined post 60d5ecb54b24a92d4c8e4a1b"
}
```

---

### **Step 4: Send Comment**
**Send Event:**
```json
{
  "event": "newComment",
  "data": {
    "content": "Hello from Flutter! No JWT needed! 🎉",
    "postId": "60d5ecb54b24a92d4c8e4a1b"
  }
}
```

**Expected Response:**
```json
{
  "comment": {
    "_id": "comment-id",
    "content": "Hello from Flutter! No JWT needed! 🎉",
    "userId": {
      "_id": "68af2546e5af803fed30af6c",
      "username": "testuser",
      "fullName": "Test User",
      "avatarUrl": "avatar.jpg"
    },
    "postId": "60d5ecb54b24a92d4c8e4a1b",
    "createdAt": "2024-10-07T...",
    "updatedAt": "2024-10-07T..."
  },
  "timestamp": "2024-10-07T...",
  "postId": "60d5ecb54b24a92d4c8e4a1b",
  "message": "Comment created successfully"
}
```

---

### **Step 5: Send Typing Indicator**
**Send Event:**
```json
{
  "event": "typing",
  "data": {
    "postId": "60d5ecb54b24a92d4c8e4a1b",
    "isTyping": true
  }
}
```

**Others will receive:**
```json
{
  "userId": "68af2546e5af803fed30af6c",
  "username": "testuser",
  "isTyping": true,
  "postId": "60d5ecb54b24a92d4c8e4a1b",
  "timestamp": "2024-10-07T..."
}
```

---

### **Step 6: Update Comment**
**Send Event:**
```json
{
  "event": "updateComment",
  "data": {
    "commentId": "your-comment-id",
    "content": "Updated comment content!",
    "postId": "60d5ecb54b24a92d4c8e4a1b"
  }
}
```

---

### **Step 7: Get Online Users**
**Send Event:**
```json
{
  "event": "getOnlineUsers",
  "data": {
    "postId": "60d5ecb54b24a92d4c8e4a1b"
  }
}
```

**Expected Response:**
```json
{
  "postId": "60d5ecb54b24a92d4c8e4a1b",
  "users": [
    {
      "userId": "68af2546e5af803fed30af6c",
      "username": "testuser"
    },
    {
      "userId": "another-user-id",
      "username": "user2"
    }
  ],
  "count": 2,
  "timestamp": "2024-10-07T..."
}
```

---

### **Step 8: Delete Comment**
**Send Event:**
```json
{
  "event": "deleteComment",
  "data": {
    "commentId": "your-comment-id",
    "postId": "60d5ecb54b24a92d4c8e4a1b"
  }
}
```

---

### **Step 9: Leave Post**
**Send Event:**
```json
{
  "event": "leavePost",
  "data": {
    "postId": "60d5ecb54b24a92d4c8e4a1b"
  }
}
```

---

## 🔥 **Complete Test Sequence trong Postman:**

### **1. Multiple Users Test:**

**Tab 1 (User 1):**
```json
# 1. Connect → register with userId: "user1"
# 2. joinPost with postId: "post123"
# 3. Send comment: "Hello from User 1!"
```

**Tab 2 (User 2):**
```json
# 1. Connect → register with userId: "user2"
# 2. joinPost with postId: "post123"
# 3. Send comment: "Hello from User 2!"
# 4. See User 1's comment in real-time!
```

---

## ❌ **Error Cases để Test:**

### **1. Không Register trước:**
**Send joinPost without register:**
```json
{
  "event": "joinPost",
  "data": {
    "postId": "60d5ecb54b24a92d4c8e4a1b"
  }
}
```
**Expected Error:**
```json
{
  "message": "User not registered. Please send register event first.",
  "event": "joinPost"
}
```

### **2. Missing userId:**
**Send register without userId:**
```json
{
  "event": "register",
  "data": {
    "username": "testuser"
  }
}
```
**Expected Error:**
```json
{
  "message": "userId is required",
  "event": "register"
}
```

### **3. Empty content:**
**Send comment with empty content:**
```json
{
  "event": "newComment",
  "data": {
    "content": "",
    "postId": "60d5ecb54b24a92d4c8e4a1b"
  }
}
```
**Expected Error:**
```json
{
  "message": "Invalid input: postId and content are required",
  "event": "newComment"
}
```

---

## 🎯 **Flutter Implementation Example:**

```dart
// Flutter WebSocket client example
import 'package:socket_io_client/socket_io_client.dart' as IO;

class CommentService {
  late IO.Socket socket;
  
  void connect(String userId, String username) {
    socket = IO.io('http://your-server.com/comment', 
      IO.OptionBuilder()
        .setTransports(['websocket'])
        .build()
    );
    
    socket.onConnect((_) {
      print('Connected to comment service');
      
      // Register user sau khi connect
      socket.emit('register', {
        'userId': userId,
        'username': username,
      });
    });
    
    // Listen for register confirmation
    socket.on('register:ack', (data) {
      print('User registered: $data');
    });
    
    // Listen for new comments
    socket.on('commentAdded', (data) {
      print('New comment: ${data['comment']}');
    });
    
    // Listen for typing indicators
    socket.on('userTyping', (data) {
      print('${data['username']} is typing...');
    });
  }
  
  void joinPost(String postId) {
    socket.emit('joinPost', {'postId': postId});
  }
  
  void sendComment(String content, String postId) {
    socket.emit('newComment', {
      'content': content,
      'postId': postId,
    });
  }
  
  void sendTyping(String postId, bool isTyping) {
    socket.emit('typing', {
      'postId': postId,
      'isTyping': isTyping,
    });
  }
}
```

---

## 📊 **Server Logs (Expected):**

```bash
[CommentGateway] 🔌 New client connected: abc123
[CommentGateway] ✅ User registered: abc123, userId: 68af2546e5af803fed30af6c, username: testuser
[CommentGateway] 📥 User 68af2546e5af803fed30af6c (testuser) joined post 60d5ecb54b24a92d4c8e4a1b
[CommentGateway] Creating comment for user 68af2546e5af803fed30af6c on post 60d5ecb54b24a92d4c8e4a1b
[CommentGateway] Comment created successfully by user 68af2546e5af803fed30af6c
```

---

## 🎉 **Benefits của hệ thống mới:**

✅ **Đơn giản hơn** - Không cần JWT token  
✅ **Dễ test hơn** - Chỉ cần userId  
✅ **Flutter friendly** - Dễ implement  
✅ **Real-time hoàn hảo** - Tất cả features vẫn hoạt động  
✅ **Error handling tốt** - Clear error messages  

---

## 🔧 **Quick Start Checklist:**

1. ☐ Connect to `ws://localhost:3000/comment`
2. ☐ Send `register` event với `userId` + `username`
3. ☐ Send `joinPost` với `postId`
4. ☐ Send `newComment` với `content` + `postId`
5. ☐ Enjoy real-time comments! 🎉

**That's it! Super simple! 🚀**
