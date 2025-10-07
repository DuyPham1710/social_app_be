import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
    Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

interface JwtPayload {
    sub?: string;
    id?: string;
    _id?: string;
    userId?: string;
    username?: string;
    email?: string;
    iat?: number;
    exp?: number;
}

@Injectable()
export class WsJwtGuard implements CanActivate {
    private readonly logger = new Logger(WsJwtGuard.name);

    constructor(private readonly jwtService: JwtService) { }

    canActivate(context: ExecutionContext): boolean {
        const client: Socket = context.switchToWs().getClient();

        // Lấy token từ header hoặc query
        const authHeader = client.handshake.headers['authorization'] as string;
        const queryToken = client.handshake.query?.token as string;

        this.logger.debug(`Headers: ${JSON.stringify(client.handshake.headers)}`);
        this.logger.debug(`Query: ${JSON.stringify(client.handshake.query)}`);

        let token = '';

        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.replace('Bearer ', '');
            this.logger.debug('Token found in Authorization header');
        } else if (queryToken) {
            token = queryToken;
            this.logger.debug('Token found in query parameter');
        }

        if (!token) {
            this.logger.warn('WebSocket connection attempt without token');
            throw new UnauthorizedException('Missing authentication token');
        }

        try {
            this.logger.debug(`Attempting to verify token: ${token.substring(0, 20)}...`);

            const payload: JwtPayload = this.jwtService.verify(token);
            this.logger.debug(`Token payload: ${JSON.stringify(payload)}`);

            // Extract userId từ nhiều trường có thể có trong payload
            const userId = payload.sub || payload.id || payload._id || payload.userId;

            this.logger.debug(`Extracted userId: ${userId}`);

            if (!userId) {
                this.logger.warn(`Token payload does not contain valid user ID. Payload: ${JSON.stringify(payload)}`);
                throw new UnauthorizedException('Invalid token payload - missing user ID');
            }

            // Gán thông tin user vào client để dùng sau
            (client as any).user = {
                ...payload,
                userId: userId.toString(), // Đảm bảo userId là string
            };

            this.logger.log(`✅ WebSocket authenticated successfully for user: ${userId}`);
            return true;
        } catch (error) {
            this.logger.error(`❌ WebSocket authentication failed: ${error.message}`);
            this.logger.error(`Error details: ${JSON.stringify(error)}`);

            if (error.name === 'TokenExpiredError') {
                throw new UnauthorizedException('Token has expired');
            } else if (error.name === 'JsonWebTokenError') {
                throw new UnauthorizedException('Invalid token format');
            } else {
                throw new UnauthorizedException(`Authentication failed: ${error.message}`);
            }
        }
    }
}
