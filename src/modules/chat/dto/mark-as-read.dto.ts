import { IsNotEmpty, IsString } from 'class-validator';

export class MarkAsReadDto {
    @IsString()
    @IsNotEmpty()
    conversationId: string;

    @IsString()
    @IsNotEmpty()
    messageId: string;
}

