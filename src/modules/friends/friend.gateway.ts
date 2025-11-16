import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { FriendsService } from './friends.service';

interface UserConnection {
  userId: string;
  username?: string;
  connectedAt: Date;
  lastSeen?: Date;
}

@WebSocketGateway({
  cors: {
    origin: '*', // thay bằng domain FE khi deploy
  },
  namespace: '/friend',
})
export class FriendGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(FriendGateway.name);

  // Map để lưu thông tin connection: socketId -> UserConnection
  private connectedUsers = new Map<string, UserConnection>();
  
  // Map để lưu danh sách bạn bè của mỗi user: userId -> Set<friendId>
  private userFriendsMap = new Map<string, Set<string>>();

  constructor(private readonly friendsService: FriendsService) {}

  handleConnection(client: Socket) {
    this.logger.log(`🔌 New client connected: ${client.id}`);

    // Emit connection success
    client.emit('connected', {
      message: 'Connected to friend service. Please send register event with userId.',
      socketId: client.id,
      timestamp: new Date(),
    });
  }

  handleDisconnect(client: Socket) {
    try {
      const userConnection = this.connectedUsers.get(client.id);
      if (userConnection) {
        const { userId } = userConnection;
        
        // Xóa connection
        this.connectedUsers.delete(client.id);
        
        // Kiểm tra xem còn connection nào khác của user này không
        const hasOtherConnections = Array.from(this.connectedUsers.entries()).some(
          ([socketId, conn]) => conn.userId === userId && socketId !== client.id,
        );
        
        if (!hasOtherConnections) {
          // Cập nhật lastSeen trước khi disconnect
          const connection = this.connectedUsers.get(client.id);
          if (connection) {
            connection.lastSeen = new Date();
          }

          // Lấy danh sách bạn bè và thông báo cho họ
          const friends = this.userFriendsMap.get(userId);
          if (friends) {
            friends.forEach((friendId) => {
              this.notifyFriendOffline(userId, friendId, connection?.lastSeen);
            });
          }
          
          // Xóa khỏi map
          this.userFriendsMap.delete(userId);
        }

        this.logger.log(`❌ Client disconnected: ${client.id}, userId: ${userId}`);
      } else {
        this.logger.warn(`Disconnection for unknown client: ${client.id}`);
      }
    } catch (error) {
      this.logger.error(`Error in handleDisconnect: ${error.message}`);
    }
  }

  // User register với userId sau khi connect
  @SubscribeMessage('register')
  async handleRegister(client: Socket, payload: { userId: string; username?: string }) {
    try {
      const { userId, username } = payload;

      if (!userId || userId.trim() === '') {
        client.emit('error', {
          message: 'userId is required',
          event: 'register',
        });
        return;
      }

      const userConnection: UserConnection = {
        userId: userId.trim(),
        username: username?.trim(),
        connectedAt: new Date(),
      };

      // Lưu connection
      this.connectedUsers.set(client.id, userConnection);

      // Lấy danh sách bạn bè của user
      const friends = await this.friendsService.getFriends(userId);
      const friendIds = friends.map((friend: any) => friend._id.toString());
      
      // Kiểm tra xem user đã có trong map chưa (trường hợp reconnect hoặc nhiều tab)
      const wasAlreadyOnline = this.userFriendsMap.has(userId);
      
      // Lưu/cập nhật danh sách bạn bè vào map
      this.userFriendsMap.set(userId, new Set(friendIds));

      this.logger.log(
        `✅ User registered: ${client.id}, userId: ${userId}, username: ${username || 'Unknown'}, friends: ${friendIds.length}`,
      );

      // Chỉ thông báo cho bạn bè nếu user chưa online trước đó (tránh spam khi reconnect)
      if (!wasAlreadyOnline) {
        friendIds.forEach((friendId: string) => {
          this.notifyFriendOnline(userId, friendId, username);
        });
      }

      // Lấy danh sách bạn bè đang online với thông tin chi tiết
      const onlineFriendsInfo = await this.getOnlineFriendsInfo(userId);
      const onlineFriendsCount = onlineFriendsInfo.length;

      // Gửi số lượng bạn bè đang online
      client.emit('onlineFriendsCount', {
        count: onlineFriendsCount,
        timestamp: new Date(),
      });

      // Gửi danh sách bạn bè đang online (để frontend có thể hiển thị trạng thái ngay)
      client.emit('onlineFriendsList', {
        friends: onlineFriendsInfo,
        count: onlineFriendsCount,
        timestamp: new Date(),
      });

      // Gửi xác nhận
      client.emit('register:ack', {
        message: 'Successfully registered',
        userId,
        username,
        socketId: client.id,
        friendsCount: friendIds.length,
        onlineFriendsCount,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error(`Error registering user: ${error.message}`);
      client.emit('error', {
        message: 'Failed to register user',
        event: 'register',
      });
    }
  }

  // Lấy số lượng bạn bè đang online
  @SubscribeMessage('getOnlineFriendsCount')
  async handleGetOnlineFriendsCount(client: Socket) {
    try {
      const userConnection = this.connectedUsers.get(client.id);

      if (!userConnection) {
        client.emit('error', {
          message: 'User not registered. Please send register event first.',
          event: 'getOnlineFriendsCount',
        });
        return;
      }

      const { userId } = userConnection;
      const onlineFriendsInfo = await this.getOnlineFriendsInfo(userId);
      const onlineCount = onlineFriendsInfo.length;

      client.emit('onlineFriendsCount', {
        count: onlineCount,
        timestamp: new Date(),
      });

      // Gửi kèm danh sách bạn bè online
      client.emit('onlineFriendsList', {
        friends: onlineFriendsInfo,
        count: onlineCount,
        timestamp: new Date(),
      });

      this.logger.log(`Retrieved online friends count for user ${userId}: ${onlineCount}`);
    } catch (error) {
      this.logger.error(`Error getting online friends count: ${error.message}`);
      client.emit('error', {
        message: 'Failed to get online friends count',
        event: 'getOnlineFriendsCount',
      });
    }
  }

  // Lấy danh sách bạn bè đang online
  @SubscribeMessage('getOnlineFriendsList')
  async handleGetOnlineFriendsList(client: Socket) {
    try {
      const userConnection = this.connectedUsers.get(client.id);

      if (!userConnection) {
        client.emit('error', {
          message: 'User not registered. Please send register event first.',
          event: 'getOnlineFriendsList',
        });
        return;
      }

      const { userId } = userConnection;
      const onlineFriendsInfo = await this.getOnlineFriendsInfo(userId);

      client.emit('onlineFriendsList', {
        friends: onlineFriendsInfo,
        count: onlineFriendsInfo.length,
        timestamp: new Date(),
      });

      this.logger.log(`Retrieved online friends list for user ${userId}: ${onlineFriendsInfo.length} friends`);
    } catch (error) {
      this.logger.error(`Error getting online friends list: ${error.message}`);
      client.emit('error', {
        message: 'Failed to get online friends list',
        event: 'getOnlineFriendsList',
      });
    }
  }

  // Helper: Lấy danh sách bạn bè đang online với thông tin chi tiết
  private async getOnlineFriendsInfo(userId: string): Promise<Array<{ userId: string; username?: string; lastSeen?: Date }>> {
    try {
      // Lấy danh sách bạn bè từ database
      const friends = await this.friendsService.getFriends(userId);
      const friendIds = friends.map((friend: any) => friend._id.toString());

      // Lấy danh sách user đang online
      const onlineUserIds = new Set(
        Array.from(this.connectedUsers.values()).map((conn) => conn.userId),
      );

      // Tạo map userId -> connection để lấy thông tin
      const userIdToConnection = new Map<string, UserConnection>();
      this.connectedUsers.forEach((conn) => {
        if (!userIdToConnection.has(conn.userId)) {
          userIdToConnection.set(conn.userId, conn);
        }
      });

      // Lọc và tạo danh sách bạn bè đang online
      const onlineFriendsInfo: Array<{ userId: string; username?: string; lastSeen?: Date }> = [];
      
      friendIds.forEach((friendId: string) => {
        if (onlineUserIds.has(friendId)) {
          const connection = userIdToConnection.get(friendId);
          onlineFriendsInfo.push({
            userId: friendId,
            username: connection?.username,
            lastSeen: connection?.connectedAt, // Sử dụng connectedAt như lastSeen khi online
          });
        }
      });

      return onlineFriendsInfo;
    } catch (error) {
      this.logger.error(`Error getting online friends info: ${error.message}`);
      return [];
    }
  }

  // Helper: Thông báo cho bạn bè khi một user online
  private notifyFriendOnline(userId: string, friendId: string, username?: string) {
    try {
      // Kiểm tra server và sockets có tồn tại không
      if (!this.server || !this.server.sockets || !this.server.sockets.sockets) {
        this.logger.warn('Server sockets not available for notifyFriendOnline');
        return;
      }

      // Tìm tất cả socket của friend đang online
      const friendSockets = Array.from(this.connectedUsers.entries())
        .filter(([_, conn]) => conn.userId === friendId)
        .map(([socketId]) => socketId);

      if (friendSockets.length > 0) {
        friendSockets.forEach((socketId) => {
          try {
            const socket = this.server.sockets.sockets.get(socketId);
            if (socket && socket.connected) {
              socket.emit('friendOnline', {
                userId,
                username,
                timestamp: new Date(),
              });
            }
          } catch (error) {
            this.logger.error(`Error emitting friendOnline to socket ${socketId}: ${error.message}`);
          }
        });

        this.logger.log(`Notified friend ${friendId} that user ${userId} is online`);
      }
    } catch (error) {
      this.logger.error(`Error in notifyFriendOnline: ${error.message}`);
    }
  }

  // Helper: Thông báo cho bạn bè khi một user offline
  private notifyFriendOffline(userId: string, friendId: string, lastSeen?: Date) {
    try {
      // Kiểm tra server và sockets có tồn tại không
      if (!this.server || !this.server.sockets || !this.server.sockets.sockets) {
        this.logger.warn('Server sockets not available for notifyFriendOffline');
        return;
      }

      // Tìm tất cả socket của friend đang online
      const friendSockets = Array.from(this.connectedUsers.entries())
        .filter(([_, conn]) => conn.userId === friendId)
        .map(([socketId]) => socketId);

      if (friendSockets.length > 0) {
        friendSockets.forEach((socketId) => {
          try {
            const socket = this.server.sockets.sockets.get(socketId);
            if (socket && socket.connected) {
              socket.emit('friendOffline', {
                userId,
                lastSeen: lastSeen || new Date(),
                timestamp: new Date(),
              });
            }
          } catch (error) {
            this.logger.error(`Error emitting friendOffline to socket ${socketId}: ${error.message}`);
          }
        });

        this.logger.log(`Notified friend ${friendId} that user ${userId} is offline`);
      }
    } catch (error) {
      this.logger.error(`Error in notifyFriendOffline: ${error.message}`);
    }
  }
}

