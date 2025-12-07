import { Expose, Type } from 'class-transformer';
import UserResponseDto from 'src/modules/user/dto/user.response.dto';

export class MessageEditLogResponseDto {
    @Expose()
    _id: string;

    @Expose()
    messageId: string;

    @Expose()
    oldText: string;

    @Expose()
    newText: string;

    @Expose()
    @Type(() => UserResponseDto)
    editedBy: UserResponseDto;

    @Expose()
    editedAt: Date;

    @Expose()
    createdAt?: Date;

    @Expose()
    updatedAt?: Date;
}

