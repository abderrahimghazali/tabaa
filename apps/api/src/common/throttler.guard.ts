import { Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerStorage, type ThrottlerModuleOptions } from '@nestjs/throttler';

// Explicit @Inject: tsx and vitest do not emit decorator metadata.
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @Inject('THROTTLER:MODULE_OPTIONS') options: ThrottlerModuleOptions,
    @Inject(ThrottlerStorage) storage: ThrottlerStorage,
    @Inject(Reflector) reflector: Reflector,
  ) {
    super(options, storage, reflector);
  }
}
