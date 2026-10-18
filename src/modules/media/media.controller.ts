import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/auth.decorators';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/permissions';
import { DestroyMediaDto, SignUploadDto } from './dto/media.dto';
import { MediaService } from './media.service';

@ApiTags('Media')
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get('config')
  @Public()
  @ApiOperation({ summary: 'Cloudinary cloud name for frontend URL builders' })
  getConfig() {
    return this.media.getConfig();
  }

  @Post('sign')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.MEDIA_UPLOAD)
  @ApiOperation({ summary: 'Signed Cloudinary upload params (API secret never leaves the server)' })
  sign(@Body() dto: SignUploadDto) {
    return this.media.signUpload(dto);
  }

  @Post('destroy')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.MEDIA_MANAGE)
  @ApiOperation({ summary: 'Delete an asset from Cloudinary by public_id' })
  destroy(@Body() dto: DestroyMediaDto) {
    return this.media.destroy(dto);
  }
}
