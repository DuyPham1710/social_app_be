import { PartialType } from '@nestjs/swagger';
import { CreateEmojiDto } from './create-emoji.dto';

export class UpdateEmojiDto extends PartialType(CreateEmojiDto) {}
