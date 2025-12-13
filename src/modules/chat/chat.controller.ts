import {
    Controller,
    Post,
    Body,
    UseInterceptors,
    UploadedFiles,
    HttpException,
    HttpStatus,
    UseGuards,
    Req,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { File } from 'multer';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
    constructor(private readonly chatService: ChatService) { }

    @Post('send-message')
    @UseInterceptors(FilesInterceptor('files', 10))
    async sendMessageWithFiles(
        @Req() req: any,
        @Body() sendMessageDto: SendMessageDto,
        @UploadedFiles() files?: File[],
    ) {
        try {
            const userId = req.user.userId;


            if (!userId) {
                throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
            }

            // Gọi service để upload files và trả về attachments
            const attachments = await this.chatService.sendMessageWithFiles(
                userId,
                sendMessageDto,
                files,
            );

            return {
                success: true,
                attachments, // Chỉ trả về URLs, FE sẽ dùng để gửi message qua WebSocket
            };
        } catch (error) {
            console.error('Error sending message with files:', error);
            throw new HttpException(
                error.message || 'Failed to send message',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}

