import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { loadAppConfig } from '../config';

@Injectable()
export class DemoReadOnlyGuard implements CanActivate {
  private readonly enabled = loadAppConfig().demoReadOnly;

  canActivate(context: ExecutionContext): boolean {
    const method = context.switchToHttp().getRequest<{ method: string }>().method;
    if (this.enabled && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      throw new ForbiddenException({ code: 'DEMO_READ_ONLY', message: '演示模式不支持修改数据' });
    }
    return true;
  }
}
