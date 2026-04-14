import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';

export enum PostAction {
    APPROVE = 'approve',
    REJECT = 'reject',
}

export class ApprovePostDto {
    @ApiProperty({
        description: 'Hành động: approve | reject',
        enum: PostAction,
    })
    @IsEnum(PostAction)
    @IsNotEmpty()
    action: PostAction;
}
