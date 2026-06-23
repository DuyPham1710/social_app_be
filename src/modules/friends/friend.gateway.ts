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
import { PresenceService } from 'src/shared/services/presence.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';

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

  constructor(
    private readonly friendsService: FriendsService,
    private readonly presenceService: PresenceService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    // Presence transitions may come from any namespace (chat/friend/...)
    this.eventEmitter.on(AppEvents.PRESENCE_ONLINE, (payload: { userId: string }) => {
      const userId = payload?.userId;
      if (!userId) return;
      this.handlePresenceOnline(userId).catch((e) => {
        this.logger.warn(`handlePresenceOnline failed: ${e?.message ?? e}`);
      });
    });

    this.eventEmitter.on(
      AppEvents.PRESENCE_OFFLINE,
      (payload: { userId: string; lastSeenAt?: Date }) => {
        const userId = payload?.userId;
        if (!userId) return;
        this.handlePresenceOffline(userId, payload?.lastSeenAt).catch((e) => {
          this.logger.warn(`handlePresenceOffline failed: ${e?.message ?? e}`);
        });
      },
    );
  }

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

        // Xóa connection (friend namespace)
        this.connectedUsers.delete(client.id);

        // Update presence store + persist lastSeenAt (only when truly offline)
        this.presenceService
          .markOffline(userId, client.id)
          .then(({ becameOffline, lastSeenAt }) => {
            if (!becameOffline) return;
            // Notifications will be handled via AppEvents.PRESENCE_OFFLINE
          })
          .catch((error) => {
            this.logger.warn(`Presence markOffline failed for user ${userId}: ${error?.message ?? error}`);
          });

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

      await this.presenceService.markOnline(userId, client.id);

      // Lấy danh sách bạn bè của user
      const friends = await this.friendsService.getFriends(userId);
      const friendIds = friends.map((friend: any) => friend._id.toString());

      // Lưu/cập nhật danh sách bạn bè vào map
      this.userFriendsMap.set(userId, new Set(friendIds));

      this.logger.log(
        `✅ User registered: ${client.id}, userId: ${userId}, username: ${username || 'Unknown'}, friends: ${friendIds.length}`,
      );

      // Notifications will be handled via AppEvents.PRESENCE_ONLINE

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

      // Dùng PresenceService (global) để biết online/offline
      const presences = await this.presenceService.getPresence(friendIds);

      const userIdToConnection = new Map<string, UserConnection>();
      this.connectedUsers.forEach((conn) => {
        if (!userIdToConnection.has(conn.userId)) {
          userIdToConnection.set(conn.userId, conn);
        }
      });

      const onlineFriendsInfo: Array<{ userId: string; username?: string; lastSeen?: Date }> = [];
      for (const p of presences) {
        if (!p.isOnline) continue;
        const conn = userIdToConnection.get(p.userId);
        onlineFriendsInfo.push({
          userId: p.userId,
          username: conn?.username,
          lastSeen: conn?.connectedAt,
        });
      }

      return onlineFriendsInfo;
    } catch (error) {
      this.logger.error(`Error getting online friends info: ${error.message}`);
      return [];
    }
  }

  private async handlePresenceOnline(userId: string) {
    try {
      // Notify only friends who are currently connected to /friend
      const friends = await this.friendsService.getFriends(userId);
      const friendIds = friends.map((friend: any) => friend._id.toString());

      // Username is best-effort (only available if userId is connected to /friend)
      const username =
        Array.from(this.connectedUsers.values()).find((c) => c.userId === userId)?.username;

      friendIds.forEach((friendId) => {
        this.notifyFriendOnline(userId, friendId, username);
      });
    } catch (e) {
      this.logger.warn(`Error handling presence online for ${userId}: ${e?.message ?? e}`);
    }
  }

  private async handlePresenceOffline(userId: string, lastSeenAt?: Date) {
    try {
      const friends = await this.friendsService.getFriends(userId);
      const friendIds = friends.map((friend: any) => friend._id.toString());

      friendIds.forEach((friendId) => {
        this.notifyFriendOffline(userId, friendId, lastSeenAt ?? new Date());
      });

      // Cleanup cache if this user had registered in /friend before
      this.userFriendsMap.delete(userId);
    } catch (e) {
      this.logger.warn(`Error handling presence offline for ${userId}: ${e?.message ?? e}`);
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

