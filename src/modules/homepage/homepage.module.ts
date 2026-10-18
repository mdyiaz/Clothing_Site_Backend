import { Module } from '@nestjs/common';
import { HomepageController } from './homepage.controller';
import { HomepageRepository } from './homepage.repository';
import { HomepageService } from './homepage.service';

@Module({
  controllers: [HomepageController],
  providers: [HomepageRepository, HomepageService],
  exports: [HomepageService],
})
export class HomepageModule {}
