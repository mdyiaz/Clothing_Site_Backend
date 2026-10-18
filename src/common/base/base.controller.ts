import {
  Body,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CursorPaginationDto, PaginationDto } from '../dto/pagination.dto';
import { BaseService } from './base.service';

/**
 * Generic REST controller.
 *
 *   POST   /          create
 *   GET    /          paginated list
 *   GET    /cursor    cursor list (storefront infinite scroll)
 *   GET    /:id       single
 *   PATCH  /:id       update
 *   DELETE /:id       soft delete
 *
 * Declare any custom child routes (e.g. `/tree`) in the subclass — child routes
 * are registered before the inherited `/:id` matcher.
 */
export abstract class BaseController<T = any, CreateDto = any, UpdateDto = any> {
  constructor(protected readonly service: BaseService<T>) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateDto): Promise<T> {
    return this.service.create(dto as Record<string, any>);
  }

  @Get()
  findAll(@Query() query: PaginationDto): Promise<T> {
    return this.service.findAll(query) as unknown as Promise<T>;
  }

  @Get('cursor')
  findCursor(@Query() query: CursorPaginationDto): Promise<T> {
    return this.service.findAllCursor(query) as unknown as Promise<T>;
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<T> {
    return this.service.findById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDto): Promise<T> {
    return this.service.update(id, dto as Record<string, any>);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string): Promise<T> {
    return this.service.remove(id);
  }
}
