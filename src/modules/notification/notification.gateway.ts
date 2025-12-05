import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log('🔌 Client connected:', client.id);
  }

  handleDisconnect(client: Socket) {
    console.log('❌ Client disconnected:', client.id);
  }

  /**
   * Client Flutter gửi userId để join room:
   * socket.emit("register", userId)
   */
  @SubscribeMessage('register')
  handleRegister(client: Socket, userId: string) {
    client.join(userId);
    console.log(`👤 User ${userId} joined room`);
  }

  /**
   * Hàm gọi từ NotificationService → realtime đến client
   */
  pushNotification(receiverId: string, payload: any) {
    this.server.to(receiverId).emit('notification', payload);
  }
}
