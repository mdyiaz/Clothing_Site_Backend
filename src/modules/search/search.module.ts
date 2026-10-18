import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [CacheModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
