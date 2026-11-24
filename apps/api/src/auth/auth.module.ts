import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthDb } from './auth-db.js';
import { AuthService, PasswordResetMailer } from './auth.service.js';
import { AuthStore } from './auth.store.js';
import { SessionAuth } from './session-auth.provider.js';

@Module({
  controllers: [AuthController],
  providers: [AuthDb, AuthService, AuthStore, SessionAuth, PasswordResetMailer],
  exports: [AuthService],
})
export class AuthModule {}
