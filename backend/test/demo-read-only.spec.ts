import { Controller, Get, Module, Post } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { DemoReadOnlyGuard } from '../src/common/demo-read-only.guard';
import { parseDemoReadOnly } from '../src/config';

let writes = 0;
@Controller('fixture')
class FixtureController {
  @Get()
  read() {
    return { writes };
  }
  @Post()
  write() {
    writes++;
    return { writes };
  }
}
@Module({
  controllers: [FixtureController],
  providers: [{ provide: APP_GUARD, useClass: DemoReadOnlyGuard }],
})
class FixtureModule {}

describe('demo read-only HTTP protection', () => {
  const original = process.env.DEMO_READ_ONLY;
  afterEach(() => {
    if (original === undefined) delete process.env.DEMO_READ_ONLY;
    else process.env.DEMO_READ_ONLY = original;
  });
  it('defaults off and rejects misspelled configuration', () => {
    expect(parseDemoReadOnly(undefined)).toBe(false);
    expect(parseDemoReadOnly('true')).toBe(true);
    expect(() => parseDemoReadOnly('tru')).toThrow();
  });
  it.each(['true', 'false'])('enforces mode %s before executing writes', async (mode) => {
    process.env.DEMO_READ_ONLY = mode;
    writes = 0;
    const app = await NestFactory.create(FixtureModule, { logger: false });
    try {
      await app.listen(0, '127.0.0.1');
      const url = (await app.getUrl()) + '/fixture';
      expect((await fetch(url)).status).toBe(200);
      const response = await fetch(url, { method: 'POST' });
      expect(response.status).toBe(mode === 'true' ? 403 : 201);
      expect(writes).toBe(mode === 'true' ? 0 : 1);
      if (mode === 'true') {
        expect((await response.json()).code).toBe('DEMO_READ_ONLY');
        for (const method of ['PUT', 'PATCH', 'DELETE']) {
          // Guard also applies to existing routes with these methods; POST above verifies HTTP registration.
          const guard = new DemoReadOnlyGuard();
          expect(() =>
            guard.canActivate({
              switchToHttp: () => ({ getRequest: () => ({ method }) }),
            } as never),
          ).toThrow();
        }
      }
    } finally {
      await app.close();
    }
  });
});
