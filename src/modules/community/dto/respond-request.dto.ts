import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { RequestAction } from 'src/shared/enums/request_action_community';

export class RespondRequestDto {
    @ApiProperty({
        description: 'Hành động: approve | reject',
        enum: RequestAction,
    })
    @IsEnum(RequestAction)
    @IsNotEmpty()
    action: RequestAction;
}
export { RequestAction };

