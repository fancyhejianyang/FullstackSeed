import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../common/decorators/require-permissions.decorator';
import { LogRecordsController } from '../log-records/log-records.controller';
import { DataImportController } from '../data-import/data-import.controller';
import { UsersService } from '../users/users.service';
import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { User } from '../users/entities/user.entity';
import type { Role } from '../roles/entities/role.entity';
import type { Permission } from '../permissions/entities/permission.entity';
import { MenusService } from './menus.service';
import type { Menu } from './entities/menu.entity';

describe('system module permission separation', () => {
  it('keeps scope changes and the new access-control root admin-only', async () => {
    const row = { id: 1, path: '/demo', isSystem: false };
    const repository = {
      findOne: jest.fn().mockResolvedValue(row),
      save: jest.fn((value: unknown) => Promise.resolve(value)),
    };
    const service = new MenusService(repository as unknown as Repository<Menu>);
    await expect(service.update(1, { isSystem: true }, false)).rejects.toThrow(
      ForbiddenException,
    );
    row.isSystem = true;
    await expect(service.update(1, { isSystem: false }, false)).rejects.toThrow(
      ForbiddenException,
    );
    row.path = '/access-control';
    row.isSystem = false;
    await expect(service.update(1, { name: '更名' }, false)).rejects.toThrow(
      ForbiddenException,
    );
    expect(repository.save).not.toHaveBeenCalled();
    await expect(
      service.update(1, { name: '权限与审计' }, true),
    ).resolves.toMatchObject({ name: '权限与审计' });
  });
  const guard = new PermissionsGuard(new Reflector());
  const cases = [
    [LogRecordsController, 'findAll', 'LogRecord.read'],
    [LogRecordsController, 'findModuleConfigs', 'LogRecord.read'],
    [LogRecordsController, 'updateModuleConfigs', 'LogRecord.update'],
    [DataImportController, 'findAll', 'DataImport.read'],
    [DataImportController, 'downloadTemplate', 'DataImport.read'],
    [DataImportController, 'createConfig', 'DataImport.create'],
    [DataImportController, 'updateConfig', 'DataImport.update'],
  ] as const;
  it.each(cases)(
    '%s.%s requires %s, not Menu.read',
    (controller, method, permission) => {
      const handler = Object.getOwnPropertyDescriptor(
        controller.prototype,
        method,
      )!.value as () => void;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
        permission,
      ]);
      const context = (permissions: string[], isAdmin = false) =>
        ({
          getHandler: () => handler,
          getClass: () => controller,
          switchToHttp: () => ({
            getRequest: () => ({ user: { permissions, isAdmin } }),
          }),
        }) as ExecutionContext;
      expect(() => guard.canActivate(context(['Menu.read']))).toThrow(
        ForbiddenException,
      );
      expect(guard.canActivate(context([permission]))).toBe(true);
      expect(guard.canActivate(context([], true))).toBe(true);
      if (!permission.endsWith('.read')) {
        expect(() =>
          guard.canActivate(context([permission.split('.')[0] + '.read'])),
        ).toThrow(ForbiddenException);
      }
    },
  );
  it('seeds new module permissions for admin without granting them to ordinary Menu.read roles', async () => {
    const ordinary = {
      code: 'staff',
      permissionCodes: ['Menu.read'],
      permissions: [],
    };
    const admin = { code: 'admin', permissionCodes: [], permissions: [] };
    const roles = {
      find: jest.fn().mockResolvedValue([ordinary]),
      findOne: jest.fn().mockResolvedValue(admin),
      save: jest.fn((value: unknown) => Promise.resolve(value)),
    };
    const permissions = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({}),
    };
    const users = {
      findOne: jest.fn().mockResolvedValue({ username: 'root' }),
    };
    const service = new UsersService(
      users as unknown as Repository<User>,
      roles as unknown as Repository<Role>,
      permissions as unknown as Repository<Permission>,
      new ConfigService(),
    );
    await service.onModuleInit();
    expect(admin.permissionCodes).toEqual(
      expect.arrayContaining([
        'LogRecord.read',
        'LogRecord.update',
        'DataImport.read',
        'DataImport.create',
        'DataImport.update',
      ]),
    );
    expect(ordinary.permissionCodes).toEqual(['Menu.read']);
    expect(roles.save).not.toHaveBeenCalledWith(ordinary);
  });
});
