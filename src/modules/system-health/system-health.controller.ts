import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedActor } from '../../types/express';
import { QueryErrorLogDto, QueryMismatchDto, ResolveDto } from './dto/system-health.dto';
import { ErrorLogService } from './error-log.service';
import { MismatchService } from './mismatch.service';
import { ReconciliationService } from './reconciliation.service';
import { SystemHealthService } from './system-health.service';

@ApiTags('System Health')
@Controller('admin/system-health')
export class SystemHealthController {
  constructor(
    private readonly errors: ErrorLogService,
    private readonly mismatches: MismatchService,
    private readonly summary: SystemHealthService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  @Get('errors')
  @RequirePermissions('menu.settings.errors')
  @ApiOperation({ summary: 'Error logs with level/source/resolved filters (admin)' })
  listErrors(@Query() query: QueryErrorLogDto) {
    return this.errors.findAll(query);
  }

  @Get('mismatches')
  @RequirePermissions('menu.settings.mismatches')
  @ApiOperation({ summary: 'Data mismatches with type/severity filters (admin)' })
  listMismatches(@Query() query: QueryMismatchDto) {
    return this.mismatches.findAll(query);
  }

  @Get('summary')
  @RequirePermissions('menu.settings')
  @ApiOperation({ summary: 'Dashboard counts: open errors/mismatches + resolved in 24h' })
  getSummary() {
    return this.summary.getSummary();
  }

  @Post('mismatches/rerun')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('menu.settings.mismatches')
  @ApiOperation({ summary: 'Run every reconciliation check right now' })
  rerunChecks() {
    return this.reconciliation.runAllChecks();
  }

  @Patch('errors/:id/resolve')
  @RequirePermissions('menu.settings.errors')
  @ApiOperation({ summary: 'Mark an error log resolved' })
  resolveError(
    @Param('id') id: string,
    @Body() dto: ResolveDto,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    return this.errors.resolve(id, actor.userId, dto.note);
  }

  @Patch('mismatches/:id/resolve')
  @RequirePermissions('menu.settings.mismatches')
  @ApiOperation({ summary: 'Mark a data mismatch resolved' })
  resolveMismatch(
    @Param('id') id: string,
    @Body() dto: ResolveDto,
    @CurrentUser() actor: AuthenticatedActor,
  ) {
    return this.mismatches.resolve(id, actor.userId, dto.note);
  }
}
