import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';
import { TextModerationService } from './shared/services/text-moderation.service';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Test API')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly textModerationService: TextModerationService
  ) { }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @ApiOperation({ summary: 'Test kiểm duyệt nội dung (HuggingFace)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          example: 'Đây là một câu bình thường cần kiểm tra',
          description: 'Nội dung văn bản cần kiểm duyệt'
        }
      }
    }
  })
  @Post('check-text')
  async checkText(@Body('text') text: string) {
    if (!text) {
      return { is_safe: true, violated_categories: [] };
    }
    return await this.textModerationService.checkText(text);
  }
}
