import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { SendMessageDto, MarkAsReadDto, CreateConversationDto } from './dto';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Map để lưu userId -> socketId
  private userSockets = new Map<string, string>();

  constructor(private readonly chatService: ChatService) { }

  async handleConnection(client: Socket) {
    try {
      console.log(`Client connected: ${client.id}`);

      // Emit connection success - user sẽ cần gửi register event với userId
      client.emit('connected', {
        message: 'Connected to chat service. Please send register event with userId.',
        socketId: client.id,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Connection error:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    // Find user by socket ID
    let disconnectedUserId: string | null = null;
    for (const [userId, socketId] of this.userSockets.entries()) {
      if (socketId === client.id) {
        disconnectedUserId = userId;
        this.userSockets.delete(userId);
        break;
      }
    }

    if (disconnectedUserId) {
      // Emit offline status
      client.broadcast.emit('user:offline', { userId: disconnectedUserId });
      console.log(`Client disconnected: ${client.id} - User: ${disconnectedUserId}`);
    } else {
      console.log(`Client disconnected: ${client.id} - Unknown user`);
    }
  }

  // User register với userId sau khi connect
  @SubscribeMessage('register')
  async handleRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; username?: string },
  ) {
    try {
      const { userId, username } = data;

      if (!userId || userId.trim() === '') {
        client.emit('error', {
          message: 'userId is required',
          event: 'register'
        });
        return;
      }

      // Set user socket mapping
      this.userSockets.set(userId.trim(), client.id);

      console.log(`User registered: ${userId} (${username || 'Unknown'}) - Socket: ${client.id}`);

      // Emit registration success
      client.emit('register:ack', {
        message: 'Successfully registered',
        userId,
        username,
        socketId: client.id,
        timestamp: new Date(),
      });

      // Emit online status to others
      client.broadcast.emit('user:online', { userId });

      return { success: true };
    } catch (error) {
      console.error('Register error:', error);
      client.emit('error', {
        message: 'Failed to register user',
        event: 'register'
      });
    }
  }

  // Lấy tất cả cuộc hội thoại
  @SubscribeMessage('conversations:get')
  async handleGetConversations(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; page?: number; limit?: number },
  ) {
    try {
      const { userId, page = 1, limit = 10 } = data;

      if (!userId) {
        client.emit('error', { message: 'userId is required' });
        return;
      }

      const conversations = await this.chatService.getConversations(userId, page, limit);

      // Emit conversations list to client
      client.emit('conversations:list',
        conversations,
      );
      //  console.log(conversations.data);
      console.log(`Sent ${conversations.data.length} conversations to user ${userId}`);
    } catch (error) {
      console.error('Get conversations error:', error);
      client.emit('error', { message: 'Failed to get conversations' });
    }
  }

  // Tạo cuộc hội thoại mới
  @SubscribeMessage('conversation:create')
  async handleCreateConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string } & CreateConversationDto,
  ) {
    try {
      const { userId, ...createConversationDto } = data;

      if (!userId) {
        return { error: 'userId is required' };
      }

      const conversation = await this.chatService.createOrGetConversation(
        userId,
        createConversationDto,
      );

      return { success: true, conversation };
    } catch (error) {
      console.error('Create conversation error:', error);
      return { error: 'Failed to create conversation' };
    }
  }

  // Lấy chi tiết cuộc hội thoại
  @SubscribeMessage('conversation:get')
  async handleGetConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; conversationId: string },
  ) {
    try {
      const { userId, conversationId } = data;

      if (!userId || !conversationId) {
        return { error: 'userId and conversationId are required' };
      }

      const conversation = await this.chatService.getConversationById(
        conversationId,
        userId,
      );

      console.log('>>> conversation: ', conversation);

      return { success: true, conversation };
    } catch (error) {
      console.error('Get conversation error:', error);
      return { error: 'Failed to get conversation' };
    }
  }

  // Lấy tin nhắn trong cuộc hội thoại
  @SubscribeMessage('messages:get')
  async handleGetMessages(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; conversationId: string; page?: number; limit?: number },
  ) {
    try {
      const { userId, conversationId, page = 1, limit = 50 } = data;

      if (!userId || !conversationId) {
        client.emit('error', {
          message: 'userId and conversationId are required',
          event: 'messages:get'
        });
        return;
      }

      const messages = await this.chatService.getMessages(
        conversationId,
        userId,
        page,
        limit,
      );
      //   console.log('>>>> message: ', messages.data[0].reactions[0].emoji);
      // Emit messages tới tất cả user trong conversation room
      this.server
        .to(`conversation:${conversationId}`)
        .emit('messages:loaded', messages);

      console.log(`Sent ${messages.data?.length || 0} messages to conversation ${conversationId}`);
    } catch (error) {
      console.error('Get messages error:', error);
      client.emit('error', {
        message: 'Failed to get messages',
        event: 'messages:get'
      });
    }
  }

  // Join vào một cuộc hội thoại
  @SubscribeMessage('conversation:join')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; conversationId: string },
  ) {
    try {
      const { userId, conversationId } = data;

      if (!userId || !conversationId) {
        return { error: 'userId and conversationId are required' };
      }

      // Kiểm tra user có quyền truy cập conversation không
      const hasAccess = await this.chatService.checkUserInConversation(
        conversationId,
        userId,
      );

      if (!hasAccess) {
        return { error: 'You do not have access to this conversation' };
      }

      //  await this.chatService.markMessagesAsRead(conversationId, userId);

      // Join room
      client.join(`conversation:${conversationId}`);

      console.log(`User ${userId} joined conversation ${conversationId}`);

      // return { success: true, conversationId };
    } catch (error) {
      console.error('Join conversation error:', error);
      return { error: 'Failed to join conversation' };
    }
  }

  // Leave khỏi cuộc hội thoại
  @SubscribeMessage('conversation:leave')
  async handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const { conversationId } = data;
    client.leave(`conversation:${conversationId}`);

    console.log(`User left conversation ${conversationId}`);

    //   return { success: true, conversationId };
  }

  // Gửi tin nhắn
  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string } & SendMessageDto,
  ) {
    try {
      const { userId, ...sendMessageDto } = data;

      if (!userId) {
        return { error: 'userId is required' };
      }

      // Lưu tin nhắn vào database
      const message = await this.chatService.sendMessage(userId, sendMessageDto);
      //   console.log('>>>><<<< message: ', message);

      // Gửi tin nhắn đến tất cả người trong room
      this.server
        .to(`conversation:${sendMessageDto.conversationId}`)
        .emit('message:new', message);

      await this.sendUpdatedConversation(sendMessageDto.conversationId, userId);

      return { success: true, message };
    } catch (error) {
      console.error('Send message error:', error);
      return { error: 'Failed to send message' };
    }
  }

  // User đang typing
  @SubscribeMessage('typing:start')
  async handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; conversationId: string },
  ) {
    const { userId, conversationId } = data;

    // Broadcast đến các user khác trong conversation
    client.to(`conversation:${conversationId}`).emit('typing:start', {
      conversationId,
      userId,
    });

    //  return { success: true };
  }

  // User dừng typing
  @SubscribeMessage('typing:stop')
  async handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; conversationId: string },
  ) {
    const { userId, conversationId } = data;

    client.to(`conversation:${conversationId}`).emit('typing:stop', {
      conversationId,
      userId,
    });

    // return { success: true };
  }

  // Đánh dấu đã đọc
  @SubscribeMessage('message:read')
  async handleMarkAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: MarkAsReadDto,
  ) {
    try {
      const { userId, conversationId, messageId } = data;

      if (!userId) {
        return { error: 'userId is required' };
      }

      await this.chatService.markMessagesAsRead(
        conversationId,
        userId,
        messageId,
      );

      // Notify người gửi rằng tin nhắn đã được đọc
      client.to(`conversation:${conversationId}`).emit('message:read', {
        conversationId,
        messageId,
        userId,
        readAt: new Date(),
      });

      await this.sendUpdatedConversation(conversationId, userId);

      return { success: true };
    } catch (error) {
      console.error('Mark as read error:', error);
      return { error: 'Failed to mark as read' };
    }
  }

  // Add reaction to message
  @SubscribeMessage('message:react')
  async handleReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; conversationId: string; messageId: string; reaction: string },
  ) {
    const { userId, conversationId, messageId, reaction } = data;

    // Broadcast reaction đến các user khác
    this.server.to(`conversation:${conversationId}`).emit('message:reacted', {
      conversationId,
      messageId,
      userId,
      reaction,
    });

    return { success: true };
  }

  // Helper method để gửi tin nhắn đến một user cụ thể
  sendToUser(userId: string, event: string, data: any) {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.server.to(socketId).emit(event, data);
    }
  }

  // Helper method để gửi tin nhắn đến conversation
  sendToConversation(conversationId: string, event: string, data: any) {
    this.server.to(`conversation:${conversationId}`).emit(event, data);
  }

  // Helper method để gửi tin nhắn đến tất cả participants trừ mình
  async sendUpdatedConversation(conversationId: string, userId: string): Promise<void> {
    // Lấy tất cả participants trừ mình ra
    const allParticipants = await this.chatService.getParticipants(conversationId);
    const otherParticipants = allParticipants.filter(
      (participant: any) => participant._id.toString() !== userId
    );

    // Tính unreadCount cho từng participant khác và emit conversation:updated
    for (const participant of otherParticipants) {
      const participantId = participant._id.toString();

      // Lấy conversation với unreadCount cho participant này
      const updatedConversation = await this.chatService.getConversationById(
        conversationId,
        participantId,
      );

      // Emit conversation:updated cho từng participant với unreadCount của họ
      this.sendToUser(participantId, 'conversation:updated', updatedConversation);
    }

    // Cũng emit cho chính người gửi (với unreadCount = 0 hoặc không có unread)
    const senderConversation = await this.chatService.getConversationById(
      conversationId,
      userId,
    );
    this.sendToUser(userId, 'conversation:updated', senderConversation);
  }
}
