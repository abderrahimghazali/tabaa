import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { InvitationsController, TeamController } from './team.controller.js';
import { TeamService } from './team.service.js';

@Module({ imports: [AuthModule], controllers: [TeamController, InvitationsController], providers: [TeamService] })
export class TeamModule {}
