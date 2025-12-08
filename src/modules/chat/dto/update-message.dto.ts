import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateMessageDto {
    @IsString()
    @IsNotEmpty()
    messageId: string;

    @IsString()
    @IsNotEmpty()
    newText: string; // Nội dung mới của tin nhắn
}

