import { PartialType } from '@nestjs/swagger';
import { CreateReactCommentDto } from './create-react-comment.dto';

export class UpdateReactCommentDto extends PartialType(CreateReactCommentDto) {}
