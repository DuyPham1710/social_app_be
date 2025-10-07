import { OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { CommentService } from './comment.service';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*', // chỉnh lại domain frontend thật khi deploy
    namespace: '/comment',
  },
})
export class CommentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;
  constructor(private readonly commentService: CommentService) { }

  // Lưu userId hoặc postId đang kết nối
  private connectedUsers = new Map<string, string>(); // socketId -> userId
  private postRooms = new Map<string, Set<string>>(); // postId -> set(socketId)

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);

    // Xóa client khỏi tất cả room
    for (const [postId, sockets] of this.postRooms) {
      sockets.delete(client.id);
    }
  }

  // Khi user join vào 1 bài post
  @SubscribeMessage('joinPost')
  handleJoinPost(client: Socket, payload: { postId: string; userId: string }) {
    const { postId, userId } = payload;

    // join room
    client.join(postId);
    this.connectedUsers.set(client.id, userId);

    // add client vào danh sách room
    if (!this.postRooms.has(postId)) {
      this.postRooms.set(postId, new Set());
    }
    this.postRooms.get(postId)?.add(client.id);

    // thông báo người khác biết user vừa join
    client.to(postId).emit('userJoined', { userId });

    console.log(`User ${userId} joined post ${postId}`);
  }

  // Khi user đang gõ bình luận
  @SubscribeMessage('typing')
  handleTyping(client: Socket, payload: { postId: string; userId: string }) {
    const { postId, userId } = payload;
    client.to(postId).emit('userTyping', { userId });
  }

  // Khi user gửi comment mới
  @SubscribeMessage('newComment')
  handleNewComment(
    client: Socket,
    payload: { postId: string; comment: any },
  ) {
    const { postId, comment } = payload;

    // broadcast cho các user khác trong post
    client.to(postId).emit('commentAdded', { comment });
  }
}
