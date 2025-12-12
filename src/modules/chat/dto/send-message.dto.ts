import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

class AttachmentDto {
    @IsString()
    url: string;

    @IsString()
    type: string;

    @IsOptional()
    size?: number;
}

export class SendMessageDto {
    @IsString()
    @IsNotEmpty()
    conversationId: string;

    @IsString()
    @IsOptional()
    text?: string;

    @IsArray()
    @IsOptional()
    attachments?: AttachmentDto[]; // URLs từ Cloudinary sau khi upload

    @IsString()
    @IsOptional()
    replyTo?: string;
}

