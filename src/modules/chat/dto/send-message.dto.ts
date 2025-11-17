import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AttachmentDto {
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
    attachments?: AttachmentDto[];

    @IsString()
    @IsOptional()
    replyTo?: string;
}

