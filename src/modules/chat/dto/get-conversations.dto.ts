import { IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetConversationsDto {
    @Type(() => Number)
    @IsNumber()
    @IsOptional()
    @Min(1)
    page?: number = 1;

    @Type(() => Number)
    @IsNumber()
    @IsOptional()
    @Min(1)
    limit?: number = 20;
}

