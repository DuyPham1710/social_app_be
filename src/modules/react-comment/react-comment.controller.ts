import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  Get,
  Patch,
  Req,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CreateReactCommentDto } from './dto/create-react-comment.dto';
import { ReactCommentService } from './react-comment.service';
import { ReactCommentResponseDto } from './dto/react-comment-response';
import { UpdateReactCommentDto } from './dto/update-react-comment.dto';


@ApiBearerAuth()
@ApiTags('ReactComment')
@UseGuards(JwtAuthGuard)
@Controller('react-comment')
export class ReactCommentController {
  constructor(private readonly reactCommentService: ReactCommentService) { }


  @Post()
  @ApiBody({ type: CreateReactCommentDto })
  createOrUpdate(@Req() req, @Body() dto: CreateReactCommentDto) {
    const userId = req.user.userId;
    return this.reactCommentService.createOrUpdate(userId, dto);
  }


  @Get(':commentId')
  findByComment(@Param('commentId') commentId: string): Promise<ReactCommentResponseDto[]> {
    return this.reactCommentService.findByComment(commentId);
  }

  //kiểm tra user hiện tại có react bài post không
  @Get('user/current/:commentId')
  checkUserReact(@Req() req, @Param('commentId') commentId: string) {
    const userId = req.user.userId;
    return this.reactCommentService.findUserReactOnComment(userId, commentId);
  }

  //update emoji
  @Patch(':commentId')
  update(@Req() req, @Param('commentId') commentId: string, @Body() dto: UpdateReactCommentDto) {
    const userId = req.user.userId;
    return this.reactCommentService.update(userId, commentId, dto);
  }

  //xóa react
  @Delete(':commentId')
  remove(@Req() req, @Param('commentId') commentId: string) {
    const userId = req.user.userId;
    return this.reactCommentService.remove(userId, commentId);
  }
}
