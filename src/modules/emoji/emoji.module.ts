import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Emoji, EmojiSchema } from './schemas/emoji.schema';
import { EmojiController } from './emoji.controller';
import { EmojiService } from './emoji.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Emoji.name, schema: EmojiSchema }]),
  ],
  controllers: [EmojiController],
  providers: [EmojiService],
  exports: [EmojiService],
})
export class EmojiModule {}
