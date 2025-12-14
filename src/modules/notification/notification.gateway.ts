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
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  // userId -> Set<Socket>
  private userSockets = new Map<string, Set<Socket>>();

  constructor(
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Socket connected: ${client.id}`);
    client.emit('connected', { socketId: client.id });
  }

  handleDisconnect(client: Socket) {
    const userId = (client as any).userId;
    if (!userId) return;

    const sockets = this.userSockets.get(userId);
    sockets?.delete(client);

    if (sockets && sockets.size === 0) {
      this.userSockets.delete(userId);
    }

    this.logger.log(`Socket ${client.id} disconnected from user ${userId}`);
  }

  @SubscribeMessage('register')
  handleRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { userId: string },
  ) {
    const { userId } = payload || {};
    if (!userId) {
      client.emit('error', { message: 'userId required' });
      return;
    }

    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }

    this.userSockets.get(userId)!.add(client);
    (client as any).userId = userId;

    client.emit('register:ack');
    this.logger.log(`Registered socket ${client.id} for user ${userId}`);
  }

  @SubscribeMessage('getNotifications')
  async handleGetNotifications(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { page?: number; limit?: number },
  ) {
    const userId = (client as any).userId;
    if (!userId) return;

    const page = payload?.page ?? 1;
    const limit = payload?.limit ?? 20;

    const result = await this.notificationService.findByUser(
      userId,
      limit,
      page,
    );

    client.emit('notifications:list', result);
  }

  @SubscribeMessage('markAllRead')
  async handleMarkAllRead(
    @ConnectedSocket() client: Socket,
  ) {
    const userId = (client as any).userId;
    if (!userId) {
      client.emit('error', { message: 'userId required' });
      return;
    }

    await this.notificationService.markAllRead(userId);
    
    this.logger.log(`Marked all notifications as read for user ${userId}`);
  }

  emitToUser(userId: string, event: string, payload: any) {
    const sockets = this.userSockets.get(userId);

    if (!sockets || sockets.size === 0) {
      this.logger.debug(`User ${userId} offline → skip ${event}`);
      return false;
    }

    sockets.forEach((socket) => {
      socket.emit(event, payload);
    });

    return true;
  }
}
