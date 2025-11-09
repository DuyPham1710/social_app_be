import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { PrivacyType } from 'src/shared/enums/privacy_type';
import UserResponseDto from 'src/modules/user/dto/user.response.dto';

export class DefaultPrivacyResponseDto {
    @ApiProperty({
        description: 'Default privacy setting',
        enum: PrivacyType,
        example: PrivacyType.PUBLIC,
    })
    @Expose()
    defaultPrivacy: PrivacyType;

    @ApiProperty({
        description: 'List of friends to exclude',
        type: [UserResponseDto],
        example: [],
    })
    @Expose()
    @Type(() => UserResponseDto)
    friends_except: UserResponseDto[];

    @ApiProperty({
        description: 'List of friends with detail access',
        type: [UserResponseDto],
        example: [],
    })
    @Expose()
    @Type(() => UserResponseDto)
    friends_detail: UserResponseDto[];
}

