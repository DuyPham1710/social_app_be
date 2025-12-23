import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ReactStoryService } from './react-story.service';
import { CreateReactStoryDto } from './dto/create-react-story.dto';
import { UpdateReactStoryDto } from './dto/update-react-story.dto';

@ApiBearerAuth()
@ApiTags('ReactStory')
@UseGuards(JwtAuthGuard)
@Controller('react-story')
export class ReactStoryController {
  constructor(private readonly reactStoryService: ReactStoryService) {}

  @Post()
  async createOrUpdate(@Req() req, @Body() dto: CreateReactStoryDto) {
    const userId = req.user.userId;
    const result = await this.reactStoryService.createOrUpdate(userId, dto);
    if (result === null) {
      return null;
    }
    return result;
  }
  @Get(':storyId')
  findByStory(@Param('storyId') storyId: string) {
    return this.reactStoryService.findByStory(storyId);
  }

  @Get('user/current/:storyId')
  checkUserReact(@Req() req, @Param('storyId') storyId: string) {
    const userId = req.user.userId;
    return this.reactStoryService.findUserReactOnStory(userId, storyId);
  }

  @Patch(':storyId')
  update(@Req() req, @Param('storyId') storyId: string, @Body() dto: UpdateReactStoryDto) {
    const userId = req.user.userId;
    return this.reactStoryService.update(userId, storyId, dto);
  }

  @Delete(':storyId')
  remove(@Req() req, @Param('storyId') storyId: string) {
    const userId = req.user.userId;
    return this.reactStoryService.remove(userId, storyId);
  }
}
