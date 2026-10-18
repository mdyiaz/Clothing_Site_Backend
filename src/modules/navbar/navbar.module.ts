import { Module } from '@nestjs/common';
import { NavbarController } from './navbar.controller';
import { NavbarRepository } from './navbar.repository';
import { NavbarService } from './navbar.service';

@Module({
  controllers: [NavbarController],
  providers: [NavbarRepository, NavbarService],
  exports: [NavbarService],
})
export class NavbarModule {}
