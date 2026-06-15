import {
    Controller,
    Post,
    Body,
    UseInterceptors,
    UploadedFiles,
    UploadedFile,
    HttpException,
    HttpStatus,
    UseGuards,
    Req,
    Res,
} from '@nestjs/common';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { ChatService } from './chat.service';
import { VoiceEffectService } from './helpers/voice-effect.service';
import { SendMessageDto } from './dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { File } from 'multer';
import { Response } from 'express';
import { Get, Param, Query } from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
    constructor(
        private readonly chatService: ChatService,
        private readonly voiceEffectService: VoiceEffectService,
    ) { }

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

            const baseUrl = `${req.protocol}://${req.get('host')}`;

            // Gọi service để upload files và trả về attachments
            const attachments = await this.chatService.sendMessageWithFiles(
                userId,
                sendMessageDto,
                baseUrl,
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

    @Post('voice-effect')
    @UseInterceptors(FileInterceptor('audio'))
    async applyVoiceEffect(
        @Req() req: any,
        @UploadedFile() audio: File,
        @Body('voicePreset') voicePreset: string,
        @Res() res: Response,
    ) {
        try {
            const userId = req.user.userId;
            if (!userId) {
                throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
            }

            if (!audio) {
                throw new HttpException('Audio file is required', HttpStatus.BAD_REQUEST);
            }

            if (!voicePreset) {
                throw new HttpException('Voice preset is required', HttpStatus.BAD_REQUEST);
            }

            const convertedAudio = await this.voiceEffectService.convertVoice(
                audio.buffer,
                audio.originalname,
                voicePreset,
            );

            res.set({
                'Content-Type': 'audio/wav',
                'Content-Disposition': `attachment; filename="voice_${voicePreset}.wav"`,
                'Content-Length': convertedAudio.length,
            });

            return res.send(convertedAudio);
        } catch (error) {
            console.error('Error applying voice effect:', error);
            throw new HttpException(
                error.message || 'Failed to apply voice effect',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Public()
    @Get('file/:id')
    async getFile(@Param('id') id: string, @Res() res: Response) {
        try {
            const file = await this.chatService.getFile(id);
            if (!file) {
                throw new HttpException('File not found', HttpStatus.NOT_FOUND);
            }
            res.set({
                'Content-Type': file.mimetype,
                'Content-Disposition': `attachment; filename="${encodeURIComponent(file.filename)}"`,
                'Content-Length': file.size.toString(),
            });
            return res.send(file.data);
        } catch (error) {
            console.error('Error getting file:', error);
            throw new HttpException(
                'File not found',
                HttpStatus.NOT_FOUND,
            );
        }
    }

    @Post('conversation/:conversationId/summary-unread')
    async postSummaryUnread(
        @Req() req: any,
        @Param('conversationId') conversationId: string,
        @Body() body: { messages: string[], lang?: string },
    ) {
        try {
            const userId = req.user.userId;
            return await this.chatService.getSummaryUnread(conversationId, userId, body.messages, body.lang);
        } catch (error) {
            throw new HttpException(
                error.message || 'Failed to summarize unread messages',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Post('message/:messageId/translate')
    async translateMessage(
        @Req() req: any,
        @Param('messageId') messageId: string,
        @Query('targetLang') targetLang: string = 'en',
    ) {
        try {
            const userId = req.user.userId;
            if (!userId) {
                throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
            }
            return await this.chatService.translateMessage(messageId, userId, targetLang);
        } catch (error) {
            throw new HttpException(
                error.message || 'Failed to translate message',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}


