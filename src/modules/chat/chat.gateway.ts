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
import { SendMessageDto, MarkAsReadDto, CreateConversationDto, UpdateMessageDto, ReactMessageDto, DeleteMessageDto } from './dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';

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

  constructor(
    private readonly chatService: ChatService,
    private readonly eventEmitter: EventEmitter2,
  ) { }

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
      //   console.log('>>> conversations: ', conversations.data);
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

      const { conversation, isNew } = await this.chatService.createOrGetConversation(
        userId,
        createConversationDto,
      );

      // Emit event conversation:created cho tất cả participants (cả conversation mới và đã tồn tại)
      // Frontend cần event này để nhận conversation vì socket.io client không hỗ trợ acknowledgment
      if (conversation.participants) {
        const participantIds = conversation.participants.map((p: any) => p.userId || p._id?.toString() || p.toString());

        // Emit event cho tất cả participants
        participantIds.forEach((participantId: string) => {
          const socketId = this.userSockets.get(participantId);
          if (socketId) {
            this.server.to(socketId).emit('conversation:created', {
              conversation,
              isNew, // Thêm flag để biết conversation mới hay đã tồn tại
            });
          }
        });
      }

      return { success: true, conversation, isNew };
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

      //   console.log('>>> conversation: ', conversation);

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
      //  console.log('>>>> message: ', messages.data[13].replyTo);
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

  // Lấy tin nhắn xung quanh một message ID cụ thể
  @SubscribeMessage('messages:getAroundId')
  async handleGetMessagesAroundId(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; conversationId: string; messageId: string; limit?: number },
  ) {
    try {
      const { userId, conversationId, messageId, limit = 20 } = data;

      if (!userId || !conversationId || !messageId) {
        client.emit('error', {
          message: 'userId, conversationId and messageId are required',
          event: 'messages:getAroundId'
        });
        return;
      }

      const messages = await this.chatService.getMessagesAroundId(
        conversationId,
        userId,
        messageId,
        limit,
      );

      // Emit messages tới tất cả user trong conversation room
      this.server
        .to(`conversation:${conversationId}`)
        .emit('messages:loaded', messages);

      console.log(`Sent ${messages.data?.length || 0} messages around ID ${messageId} to conversation ${conversationId}`);
    } catch (error) {
      console.error('Get messages around ID error:', error);
      client.emit('error', {
        message: error?.message || 'Failed to get messages around ID',
        event: 'messages:getAroundId'
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

      // Lấy thông tin user đã đọc để gửi kèm event qua EventEmitter
      const [userInfo] = await this.eventEmitter.emitAsync(AppEvents.USER_GET_BASIC_INFO, { userId });
      // console.log('>>> userInfo: ', userInfo);
      // Notify tất cả người trong conversation rằng tin nhắn đã được đọc
      this.server.to(`conversation:${conversationId}`).emit('message:read', {
        conversationId,
        messageId,
        userId,
        user: userInfo || null, // Thông tin user đã đọc (userId, username, fullName, avatarUrl)
        readAt: new Date(),
      });

      await this.sendUpdatedConversation(conversationId, userId);

      return { success: true };
    } catch (error) {
      console.error('Mark as read error:', error);
      return { error: 'Failed to mark as read' };
    }
  }

  // Chỉnh sửa tin nhắn
  @SubscribeMessage('message:update')
  async handleUpdateMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string } & UpdateMessageDto,
  ) {
    try {
      const { userId, ...updateMessageDto } = data;

      if (!userId) {
        client.emit('error', {
          message: 'userId is required',
          event: 'message:update'
        });
        return;
      }

      // Cập nhật tin nhắn (có validation 15 phút và lưu log)
      const updatedMessage = await this.chatService.updateMessage(userId, updateMessageDto);

      // Lấy conversationId từ message để emit
      const conversationId = updatedMessage.conversationId;

      // Emit message đã được update đến tất cả user trong conversation
      this.server
        .to(`conversation:${conversationId}`)
        .emit('message:updated', updatedMessage);

      // Cập nhật conversation cho tất cả participants
      await this.sendUpdatedConversation(conversationId, userId);

      return { success: true, message: updatedMessage };
    } catch (error) {
      console.error('Update message error:', error);
      client.emit('error', {
        message: error?.message || 'Failed to update message',
        event: 'message:update'
      });
      return { error: error?.message || 'Failed to update message' };
    }
  }

  // Add reaction to message
  @SubscribeMessage('message:react')
  async handleReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; conversationId: string } & ReactMessageDto,
  ) {
    try {
      const { userId, conversationId, ...reactMessageDto } = data;

      if (!userId) {
        client.emit('error', {
          message: 'userId is required',
          event: 'message:react'
        });
        return;
      }

      // Thêm hoặc xóa reaction (toggle)
      const updatedMessage = await this.chatService.addReactionToMessage(
        userId,
        reactMessageDto.messageId,
        reactMessageDto.emojiId,
      );

      // Emit message đã được update đến tất cả user trong conversation
      this.server
        .to(`conversation:${conversationId}`)
        .emit('message:updated', updatedMessage);

      // Cập nhật conversation cho tất cả participants
      await this.sendUpdatedConversation(conversationId, userId);

      return { success: true, message: updatedMessage };
    } catch (error) {
      console.error('React message error:', error);
      client.emit('error', {
        message: error?.message || 'Failed to react to message',
        event: 'message:react'
      });
      return { error: error?.message || 'Failed to react to message' };
    }
  }

  // Xóa tin nhắn
  @SubscribeMessage('message:delete')
  async handleDeleteMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string } & DeleteMessageDto,
  ) {
    try {
      const { userId, ...deleteMessageDto } = data;

      if (!userId) {
        client.emit('error', {
          message: 'userId is required',
          event: 'message:delete'
        });
        return;
      }

      // Xóa tin nhắn
      const deletedMessage = await this.chatService.deleteMessage(userId, deleteMessageDto);

      // Lấy conversationId từ message để emit
      const conversationId = deletedMessage.conversationId;

      // Emit message đã được xóa đến tất cả user trong conversation
      this.server
        .to(`conversation:${conversationId}`)
        .emit('message:updated', deletedMessage);

      // Cập nhật conversation cho tất cả participants
      await this.sendUpdatedConversation(conversationId, userId);

      return { success: true, message: deletedMessage };
    } catch (error) {
      console.error('Delete message error:', error);
      client.emit('error', {
        message: error?.message || 'Failed to delete message',
        event: 'message:delete'
      });
      return { error: error?.message || 'Failed to delete message' };
    }
  }

  // Lấy lịch sử chỉnh sửa của message
  @SubscribeMessage('message:editLogs:get')
  async handleGetMessageEditLogs(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; messageId: string },
  ) {
    try {
      const { userId, messageId } = data;

      if (!userId || !messageId) {
        client.emit('error', {
          message: 'userId and messageId are required',
          event: 'message:editLogs:get'
        });
        return;
      }

      const editLogs = await this.chatService.getMessageEditLogs(messageId, userId);

      // Emit edit logs to client
      client.emit('message:editLogs:loaded', {
        messageId,
        editLogs,
      });

      return { success: true, editLogs };
    } catch (error) {
      console.error('Get message edit logs error:', error);
      client.emit('error', {
        message: error?.message || 'Failed to get message edit logs',
        event: 'message:editLogs:get'
      });
      return { error: error?.message || 'Failed to get message edit logs' };
    }
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
