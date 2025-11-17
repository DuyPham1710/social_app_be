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
    credentials: true,
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
      const userId = client.handshake.query.userId as string;

      if (!userId) {
        client.disconnect();
        return;
      }

      this.userSockets.set(userId, client.id);

      console.log(`Client connected: ${client.id} - User: ${userId}`);

      // Emit online status
      client.broadcast.emit('user:online', { userId });
    } catch (error) {
      console.error('Connection error:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.handshake.query.userId as string;

    if (userId) {
      this.userSockets.delete(userId);

      // Emit offline status
      client.broadcast.emit('user:offline', { userId });

      console.log(`Client disconnected: ${client.id} - User: ${userId}`);
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
        return { error: 'userId is required' };
      }

      const conversations = await this.chatService.getConversations(userId, page, limit);
      return { success: true, ...conversations };
    } catch (error) {
      console.error('Get conversations error:', error);
      return { error: 'Failed to get conversations' };
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
        return { error: 'userId and conversationId are required' };
      }

      const messages = await this.chatService.getMessages(
        conversationId,
        userId,
        page,
        limit,
      );

      return { success: true, ...messages };
    } catch (error) {
      console.error('Get messages error:', error);
      return { error: 'Failed to get messages' };
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

      // Join room
      client.join(`conversation:${conversationId}`);

      console.log(`User ${userId} joined conversation ${conversationId}`);

      return { success: true, conversationId };
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

    return { success: true, conversationId };
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

      // Gửi tin nhắn đến tất cả người trong room
      this.server
        .to(`conversation:${sendMessageDto.conversationId}`)
        .emit('message:new', message);

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

    return { success: true };
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

    return { success: true };
  }

  // Đánh dấu đã đọc
  @SubscribeMessage('message:read')
  async handleMarkAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string } & MarkAsReadDto,
  ) {
    try {
      const { userId, ...markAsReadDto } = data;

      if (!userId) {
        return { error: 'userId is required' };
      }

      await this.chatService.markMessagesAsRead(
        markAsReadDto.conversationId,
        userId,
        markAsReadDto.messageId,
      );

      // Notify người gửi rằng tin nhắn đã được đọc
      client.to(`conversation:${markAsReadDto.conversationId}`).emit('message:read', {
        conversationId: markAsReadDto.conversationId,
        messageId: markAsReadDto.messageId,
        userId,
        readAt: new Date(),
      });

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
}
