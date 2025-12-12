import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { forwardRef, Inject, Logger } from '@nestjs/common';
import { NotificationService } from './notification.service';

interface IUserSockets {
  [userId: string]: Set<string>;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/notification',
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(NotificationGateway.name);

  // map userId -> set of socketIds
  private userSockets: IUserSockets = {};

  constructor(
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
  ) {}


  handleConnection(client: Socket) {
    this.logger.log(`Socket connected: ${client.id}`);
    client.emit('connected', { socketId: client.id, namespace: '/notification' });
  }

  handleDisconnect(client: Socket) {
    // remove socket from any user mapping
    for (const userId of Object.keys(this.userSockets)) {
      if (this.userSockets[userId].has(client.id)) {
        this.userSockets[userId].delete(client.id);
        if (this.userSockets[userId].size === 0) delete this.userSockets[userId];
        this.logger.log(`Socket ${client.id} disconnected from user ${userId}`);
        break;
      }
    }
  }

  // client sends: { userId }
  @SubscribeMessage('register')
  handleRegister(@ConnectedSocket() client: Socket, @MessageBody() payload: { userId: string }) {
    const { userId } = payload || {};
    if (!userId) {
      client.emit('error', { event: 'register', message: 'userId required' });
      return;
    }

    if (!this.userSockets[userId]) this.userSockets[userId] = new Set();
    this.userSockets[userId].add(client.id);

    // store userId on socket for easier disconnect handling
    (client as any).userId = userId;

    client.emit('register:ack', { message: 'registered', userId, socketId: client.id });
    this.logger.log(`Registered socket ${client.id} for user ${userId}`);
  }

  // client asks list (page/limit)
  @SubscribeMessage('getNotifications')
  async handleGetNotifications(@ConnectedSocket() client: Socket, @MessageBody() payload: { page?: number; limit?: number }) {
    const userId = (client as any).userId;
    if (!userId) return client.emit('error', { event: 'getNotifications', message: 'not registered' });

    const page = payload?.page || 1;
    const limit = payload?.limit || 20;
    const result = await this.notificationService.findByUser(userId, limit, page);
    client.emit('notifications:list', result);
  }

  @SubscribeMessage('markRead')
  async handleMarkRead(@ConnectedSocket() client: Socket, @MessageBody() payload: { notificationId: string }) {
    const userId = (client as any).userId;
    if (!userId) return client.emit('error', { event: 'markRead', message: 'not registered' });

    await this.notificationService.markRead(payload.notificationId, userId);
    client.emit('markRead:ack', { id: payload.notificationId });
  }

  @SubscribeMessage('markAllRead')
  async handleMarkAllRead(@ConnectedSocket() client: Socket) {
    const userId = (client as any).userId;
    if (!userId) return client.emit('error', { event: 'markAllRead', message: 'not registered' });

    await this.notificationService.markAllRead(userId);
    client.emit('markAllRead:ack', {});
  }

  // public helper to emit to a user (all sockets)
  emitToUser(userId: string, event: string, payload: any) {
    const sockets = this.userSockets[userId];
    if (!sockets || sockets.size === 0) {
      this.logger.debug(`User ${userId} is offline - cannot emit ${event}`);
      return false;
    }

    sockets.forEach(socketId => {
      const s = this.server.sockets.sockets.get(socketId);
      if (s) s.emit(event, payload);
    });

    return true;
  }
}
