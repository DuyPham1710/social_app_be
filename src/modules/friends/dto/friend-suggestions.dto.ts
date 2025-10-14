import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class FriendSuggestionsDto {
  @ApiPropertyOptional({ 
    description: 'Số lượng gợi ý muốn lấy', 
    example: 10,
    minimum: 1,
    maximum: 50
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'limit must be a number' })
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @ApiPropertyOptional({ 
    description: 'Số trang (pagination)', 
    example: 1,
    minimum: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'page must be a number' })
  @Min(1)
  page?: number = 1;
}
