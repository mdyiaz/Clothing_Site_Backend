import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SearchLogDto, SearchSuggestionDto } from './dto/search.dto';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('suggestions')
  @Public()
  @ApiOperation({ summary: 'Type-ahead product and category suggestions' })
  suggestions(@Query() query: SearchSuggestionDto) {
    return this.search.suggestions(query);
  }

  @Get('popular')
  @Public()
  @ApiOperation({ summary: 'Most searched terms from the last 30 days' })
  popular(@Query('limit') limit?: string) {
    return this.search.popular(limit ? Number(limit) : 10);
  }

  @Post('log')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record a search executed by a shopper' })
  log(@Body() dto: SearchLogDto, @CurrentUser('userId') userId?: string) {
    return this.search.log(dto, userId).then(() => ({ ok: true }));
  }
}
