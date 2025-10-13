import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { CommentService } from './comment.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

interface UserConnection {
  userId: string;
  username?: string;
  connectedAt: Date;
}

@WebSocketGateway({
  cors: {
    origin: '*', // thay bằng domain FE khi deploy
  },
  namespace: '/comment',
})
export class CommentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CommentGateway.name);

  constructor(private readonly commentService: CommentService) { }

  // Giữ danh sách user đang kết nối: socketId -> UserConnection
  private connectedUsers = new Map<string, UserConnection>();

  handleConnection(client: Socket) {
    this.logger.log(`🔌 New client connected: ${client.id}`);

    // Emit connection success - user sẽ cần gửi connect event với userId
    client.emit('connected', {
      message: 'Connected to comment service. Please send connect event with userId.',
      socketId: client.id,
      timestamp: new Date(),
    });
  }

  handleDisconnect(client: Socket) {
    const userConnection = this.connectedUsers.get(client.id);
    if (userConnection) {
      this.connectedUsers.delete(client.id);
      this.logger.log(`❌ Client disconnected: ${client.id}, userId: ${userConnection.userId}`);
    } else {
      this.logger.warn(`Disconnection for unknown client: ${client.id}`);
    }
  }

  // User register với userId sau khi connect
  @SubscribeMessage('register')
  handleRegister(client: Socket, payload: { userId: string; username?: string }) {
    try {
      const { userId, username } = payload;

      if (!userId || userId.trim() === '') {
        client.emit('error', {
          message: 'userId is required',
          event: 'register'
        });
        return;
      }

      const userConnection: UserConnection = {
        userId: userId.trim(),
        username: username?.trim(),
        connectedAt: new Date(),
      };

      this.connectedUsers.set(client.id, userConnection);
      this.logger.log(`✅ User registered: ${client.id}, userId: ${userId}, username: ${username || 'Unknown'}`);

      client.emit('register:ack', {
        message: 'Successfully registered',
        userId,
        username,
        socketId: client.id,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error(`Error registering user: ${error.message}`);
      client.emit('error', {
        message: 'Failed to register user',
        event: 'register'
      });
    }
  }

  // Khi user join vào 1 bài post
  @SubscribeMessage('joinPost')
  handleJoinPost(client: Socket, payload: { postId: string }) {
    try {
      const userConnection = this.connectedUsers.get(client.id);
      const { postId } = payload;

      if (!userConnection) {
        client.emit('error', {
          message: 'User not registered. Please send register event first.',
          event: 'joinPost'
        });
        return;
      }

      if (!postId || postId.trim() === '') {
        client.emit('error', {
          message: 'postId is required',
          event: 'joinPost'
        });
        return;
      }

      client.join(postId);
      this.logger.log(`📥 User ${userConnection.userId} (${userConnection.username || 'Unknown'}) joined post ${postId}`);

      // Gửi xác nhận cho chính user đó
      client.emit('joinPost:ack', {
        postId,
        userId: userConnection.userId,
        message: `Successfully joined post ${postId}`
      });

      // Thông báo cho các user khác trong room
      client.to(postId).emit('userJoined', {
        userId: userConnection.userId,
        username: userConnection.username,
        postId,
        timestamp: new Date()
      });
    } catch (error) {
      this.logger.error(`Error in joinPost: ${error.message}`);
      client.emit('error', {
        message: 'Failed to join post',
        event: 'joinPost'
      });
    }
  }

  // Khi user rời khỏi 1 bài post
  @SubscribeMessage('leavePost')
  handleLeavePost(client: Socket, payload: { postId: string }) {
    try {
      const userConnection = this.connectedUsers.get(client.id);
      const { postId } = payload;

      if (!userConnection || !postId) return;

      client.leave(postId);
      this.logger.log(`📤 User ${userConnection.userId} left post ${postId}`);

      // Thông báo cho các user khác trong room
      client.to(postId).emit('userLeft', {
        userId: userConnection.userId,
        username: userConnection.username,
        postId,
        timestamp: new Date()
      });

      client.emit('leavePost:ack', { postId, message: `Left post ${postId}` });
    } catch (error) {
      this.logger.error(`Error in leavePost: ${error.message}`);
    }
  }

  // Khi user đang gõ bình luận
  @SubscribeMessage('typing')
  handleTyping(client: Socket, payload: { postId: string; isTyping: boolean }) {
    try {
      const userConnection = this.connectedUsers.get(client.id);
      const { postId, isTyping } = payload;

      if (!userConnection) {
        client.emit('error', {
          message: 'User not registered',
          event: 'typing'
        });
        return;
      }

      if (!postId) return;

      // Gửi cho tất cả user khác trong room (trừ chính người đó)
      client.to(postId).emit('userTyping', {
        userId: userConnection.userId,
        username: userConnection.username,
        isTyping,
        postId,
        timestamp: new Date()
      });
    } catch (error) {
      this.logger.error(`Error in typing event: ${error.message}`);
    }
  }

  // Khi user gửi comment mới
  @SubscribeMessage('newComment')
  async handleNewComment(
    client: Socket,
    payload: CreateCommentDto,
  ) {
    try {
      const userConnection = this.connectedUsers.get(client.id);
      const { postId, content, parentId } = payload;

      // Validate input
      if (!userConnection) {
        client.emit('error', {
          message: 'User not registered. Please send register event first.',
          event: 'newComment'
        });
        return;
      }

      if (!postId || !content || content.trim() === '') {
        client.emit('error', {
          message: 'Invalid input: postId and content are required',
          event: 'newComment'
        });
        return;
      }

      this.logger.log(`Creating comment for user ${userConnection.userId} on post ${postId}`);

      const created = await this.commentService.create(
        payload,
        userConnection.userId,
      );

      const commentData = {
        comment: created,
        timestamp: new Date(),
        postId: postId.toString(),
      };

      // Gửi comment tới tất cả user khác trong cùng bài post
      client.to(postId.toString()).emit('commentAdded', commentData);

      // Gửi lại chính user đó để xác nhận
      client.emit('commentAdded:ack', {
        ...commentData,
        message: 'Comment created successfully'
      });

      this.logger.log(`Comment created successfully by user ${userConnection.userId}`);
    } catch (error) {
      this.logger.error(`Error creating comment: ${error.message}`);
      client.emit('error', {
        message: error?.message || 'Failed to create comment',
        event: 'newComment'
      });
    }
  }

  // Sửa comment
  @SubscribeMessage('updateComment')
  async handleUpdateComment(
    client: Socket,
    payload: UpdateCommentDto,
  ) {
    try {
      const userConnection = this.connectedUsers.get(client.id);
      const { commentId, content, postId } = payload;

      // Validate input
      if (!userConnection) {
        client.emit('error', {
          message: 'User not registered. Please send register event first.',
          event: 'updateComment'
        });
        return;
      }

      if (!commentId || !content || content.trim() === '' || !postId) {
        client.emit('error', {
          message: 'Invalid input: commentId, content, and postId are required',
          event: 'updateComment'
        });
        return;
      }

      this.logger.log(`Updating comment ${commentId} by user ${userConnection.userId}`);

      const updated = await this.commentService.update(commentId, content.trim(), userConnection.userId);

      const updateData = {
        comment: updated,
        timestamp: new Date(),
        postId: postId.toString(),
      };

      // Gửi comment đã update tới tất cả user khác trong room
      client.to(postId.toString()).emit('commentUpdated', updateData);

      // Gửi xác nhận cho chính user đó
      client.emit('commentUpdated:ack', {
        ...updateData,
        message: 'Comment updated successfully'
      });

      this.logger.log(`Comment ${commentId} updated successfully`);
    } catch (error) {
      this.logger.error(`Error updating comment: ${error.message}`);
      client.emit('error', {
        message: error?.message || 'Failed to update comment',
        event: 'updateComment'
      });
    }
  }

  // Xóa comment
  @SubscribeMessage('deleteComment')
  async handleDeleteComment(
    client: Socket,
    payload: { commentId: string; postId: string },
  ) {
    try {
      const userConnection = this.connectedUsers.get(client.id);
      const { commentId, postId } = payload;

      // Validate input
      if (!userConnection) {
        client.emit('error', {
          message: 'User not registered. Please send register event first.',
          event: 'deleteComment'
        });
        return;
      }

      if (!commentId || !postId) {
        client.emit('error', {
          message: 'Invalid input: commentId and postId are required',
          event: 'deleteComment'
        });
        return;
      }

      this.logger.log(`Deleting comment ${commentId} by user ${userConnection.userId}`);

      await this.commentService.remove(commentId, userConnection.userId);

      const deleteData = {
        id: commentId,
        postId,
        timestamp: new Date(),
      };

      // Gửi thông báo xóa tới tất cả user khác trong room
      client.to(postId).emit('commentDeleted', deleteData);

      // Gửi xác nhận cho chính user đó
      client.emit('commentDeleted:ack', {
        ...deleteData,
        message: 'Comment deleted successfully'
      });

      this.logger.log(`Comment ${commentId} deleted successfully`);
    } catch (error) {
      this.logger.error(`Error deleting comment: ${error.message}`);
      client.emit('error', {
        message: error?.message || 'Failed to delete comment',
        event: 'deleteComment'
      });
    }
  }

  // Lấy danh sách user hiện đang online trong post
  @SubscribeMessage('getOnlineUsers')
  handleGetOnlineUsers(client: Socket, payload: { postId: string }) {
    try {
      const userConnection = this.connectedUsers.get(client.id);
      const { postId } = payload;

      if (!userConnection) {
        client.emit('error', {
          message: 'User not registered. Please send register event first.',
          event: 'getOnlineUsers'
        });
        return;
      }

      if (!postId) {
        client.emit('error', {
          message: 'postId is required',
          event: 'getOnlineUsers'
        });
        return;
      }

      // Lấy danh sách tất cả socket trong room
      const room = this.server.sockets.adapter.rooms.get(postId);
      const onlineUsers: Array<{ userId: string; username?: string }> = [];

      if (room) {
        room.forEach(socketId => {
          const connection = this.connectedUsers.get(socketId);
          if (connection) {
            onlineUsers.push({
              userId: connection.userId,
              username: connection.username
            });
          }
        });
      }

      client.emit('onlineUsers', {
        postId,
        users: onlineUsers,
        count: onlineUsers.length,
        timestamp: new Date()
      });

      this.logger.log(`Retrieved ${onlineUsers.length} online users for post ${postId}`);
    } catch (error) {
      this.logger.error(`Error getting online users: ${error.message}`);
      client.emit('error', {
        message: 'Failed to get online users',
        event: 'getOnlineUsers'
      });
    }
  }

  // Lấy tất cả comments của một bài post
  @SubscribeMessage('loadComments')
  async handleLoadComments(client: Socket, payload: { postId: string }) {
    try {
      const userConnection = this.connectedUsers.get(client.id);
      const { postId } = payload;

      if (!userConnection) {
        client.emit('error', {
          message: 'User not registered. Please send register event first.',
          event: 'loadComments'
        });
        return;
      }

      if (!postId || postId.trim() === '') {
        client.emit('error', {
          message: 'postId is required',
          event: 'loadComments'
        });
        return;
      }

      this.logger.log(`Loading comments for post ${postId} by user ${userConnection.userId}`);

      const comments = await this.commentService.findByPostId(postId);

      client.emit('commentsLoaded', {
        postId,
        comments,
        count: comments.length,
        timestamp: new Date()
      });

      this.logger.log(`Loaded ${comments.length} comments for post ${postId}`);
    } catch (error) {
      this.logger.error(`Error loading comments: ${error.message}`);
      client.emit('error', {
        message: error?.message || 'Failed to load comments',
        event: 'loadComments'
      });
    }
  }
}
