import { Module } from '@nestjs/common';
import { AddressService } from './address.service';
import { UserController } from './user.controller';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';

@Module({
  controllers: [UserController],
  providers: [UserRepository, UserService, AddressService],
  exports: [UserService, AddressService],
})
export class UsersModule {}
