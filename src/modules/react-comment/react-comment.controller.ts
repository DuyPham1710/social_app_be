import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ReactCommentService } from './react-comment.service';
import { CreateReactCommentDto } from './dto/create-react-comment.dto';
import { UpdateReactCommentDto } from './dto/update-react-comment.dto';

@Controller('react-comment')
export class ReactCommentController {
  constructor(private readonly reactCommentService: ReactCommentService) {}

  @Post()
  create(@Body() createReactCommentDto: CreateReactCommentDto) {
    return this.reactCommentService.create(createReactCommentDto);
  }

  @Get()
  findAll() {
    return this.reactCommentService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reactCommentService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateReactCommentDto: UpdateReactCommentDto) {
    return this.reactCommentService.update(+id, updateReactCommentDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reactCommentService.remove(+id);
  }
}
