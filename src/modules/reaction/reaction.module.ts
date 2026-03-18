import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReactionService } from './reaction.service';
import { ReactionController } from './reaction.controller';
import { Reaction, ReactionSchema } from './schemas/reaction.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Reaction.name, schema: ReactionSchema }])],
  controllers: [ReactionController],
  providers: [ReactionService],
  exports: [MongooseModule],
})
export class ReactionModule {}
