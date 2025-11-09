// import { ApiProperty } from '@nestjs/swagger';
// import { Expose, Transform, Type } from 'class-transformer';
// import { PrivacyType } from 'src/shared/enums/privacy_type';
// import UserResponseDto from 'src/modules/user/dto/user.response.dto';

// export class PrivacyResponseDto {
//     @ApiProperty({ description: 'User ID', example: '507f1f77bcf86cd799439011' })
//     @Expose()
//     @Transform(({ obj }) => obj.userId?.toString() || obj._id?.toString())
//     userId: string;

//     @ApiProperty({
//         description: 'Default privacy setting',
//         enum: PrivacyType,
//         example: PrivacyType.PUBLIC,
//     })
//     @Expose()
//     defaultPrivacy: PrivacyType;

//     @ApiProperty({
//         description: 'List of friends to exclude',
//         type: [UserResponseDto],
//         example: [],
//     })
//     @Expose()
//     @Type(() => UserResponseDto)
//     friends_except: UserResponseDto[];

//     @ApiProperty({
//         description: 'List of friends with detail access',
//         type: [UserResponseDto],
//         example: [],
//     })
//     @Expose()
//     @Type(() => UserResponseDto)
//     friends_detail: UserResponseDto[];

//     @ApiProperty({ description: 'Created at', example: '2024-01-01T00:00:00.000Z' })
//     @Expose()
//     createdAt?: Date;

//     @ApiProperty({ description: 'Updated at', example: '2024-01-01T00:00:00.000Z' })
//     @Expose()
//     updatedAt?: Date;
// }

