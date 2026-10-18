import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/auth.decorators';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/permissions';
import { UpdateSettingsDto } from './dto/settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Storefront settings map (currency, shipping, VAT, chatbot…)' })
  getPublic() {
    return this.settings.getPublic();
  }

  @Get('admin')
  @RequirePermissions(PERMISSIONS.SETTINGS_VIEW)
  @ApiOperation({ summary: 'Every setting with updatedAt (admin)' })
  getAdmin() {
    return this.settings.getAdmin();
  }

  @Patch()
  @RequirePermissions(PERMISSIONS.SETTINGS_UPDATE)
  @ApiOperation({ summary: 'Batch upsert settings' })
  upsert(@Body() dto: UpdateSettingsDto) {
    return this.settings.upsertMany(dto.settings);
  }

  @Delete(':key')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.SETTINGS_UPDATE)
  remove(@Param('key') key: string) {
    return this.settings.remove(key);
  }

  @Get(':key')
  @Public()
  @ApiOperation({ summary: 'Single setting by key' })
  getOne(@Param('key') key: string) {
    return this.settings.getOne(key);
  }
}
