import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SaveService } from './save.service';
import { SaveController } from './save.controller';
import { Saved, SaveSchema } from './schemas/saved.schema';
import { RecommendationsModule } from 'src/modules/recommendations/recommendations.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Saved.name, schema: SaveSchema }]),
    RecommendationsModule,
  ],
  controllers: [SaveController],
  providers: [SaveService],
  exports: [SaveService],
})
export class SaveModule {}
