import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Only these Cloudinary roots may be written to (matches PROJECT_MASTER_DOCUMENT §10). */
export const ALLOWED_UPLOAD_ROOTS = ['products', 'banners', 'collections', 'homepage', 'navbar'] as const;

const FOLDER_PATTERN = /^(products|banners|collections|homepage|navbar)(\/[a-zA-Z0-9_\-]+)+$/;
const PUBLIC_ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;

export class SignUploadDto {
  @ApiProperty({
    example: 'products/uuid/common',
    description: 'Cloudinary folder — must start with one of ' + ALLOWED_UPLOAD_ROOTS.join(', '),
  })
  @IsString()
  @MaxLength(200)
  @Matches(FOLDER_PATTERN, {
    message: 'Folder must look like products/{id}, banners/{id}, collections/{id} or homepage/{id}.',
  })
  folder!: string;

  @ApiPropertyOptional({ example: 'eid-panjabi-front', description: 'Optional public_id (no extension)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(PUBLIC_ID_PATTERN, {
    message: 'publicId may only contain letters, numbers, underscores and hyphens.',
  })
  publicId?: string;

  @ApiPropertyOptional({ enum: ['image', 'video'], default: 'image' })
  @IsOptional()
  @IsIn(['image', 'video'])
  resourceType?: 'image' | 'video';
}

export class DestroyMediaDto {
  @ApiProperty({ example: 'products/uuid/common/eid-panjabi-front' })
  @IsString()
  @MaxLength(250)
  @Matches(/^[a-zA-Z0-9_\-\/]+$/, {
    message: 'publicId may only contain letters, numbers, underscores, hyphens and slashes.',
  })
  publicId!: string;

  @ApiPropertyOptional({ enum: ['image', 'video'], default: 'image' })
  @IsOptional()
  @IsIn(['image', 'video'])
  resourceType?: 'image' | 'video';
}
