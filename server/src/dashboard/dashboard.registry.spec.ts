import { BadRequestException } from '@nestjs/common';
import {
  DASHBOARD_WIDGETS,
  canViewWidget,
  defaultWidgets,
  resolveWidgets,
  validateWidgets,
} from './dashboard.registry';
import type { AuthUser } from '../common/decorators/current-user.decorator';
const user = (permissions: string[]): AuthUser => ({
  userId: 1,
  username: 'tester',
  isAdmin: false,
  roles: [],
  permissions,
});
describe('dashboard registry boundary', () => {
  it('recent activity requires independent log access rather than menu management access', () => {
    const definition = DASHBOARD_WIDGETS.find(
      (w) => w.key === 'activity.recent',
    )!;
    expect(canViewWidget(user(['Menu.read']), definition)).toBe(false);
    expect(canViewWidget(user(['LogRecord.read']), definition)).toBe(true);
  });
  it('accepts every built-in widget and does not share mutable defaults', () => {
    const first = defaultWidgets();
    expect(validateWidgets(first)).toEqual(first);
    expect(first).toHaveLength(12);
    expect(
      first
        .filter((widget) =>
          ['generation.health', 'creation.recent'].includes(widget.widgetKey),
        )
        .every((widget) => widget.enabled === false),
    ).toBe(true);
    (first[0].params.metrics as string[]).push('invalid');
    expect(() => validateWidgets(defaultWidgets())).not.toThrow();
  });
  it.each(['apiUrl', 'sql', 'formatter', 'permissionCodes'])(
    'rejects injected field %s',
    (key) => {
      const [widget] = defaultWidgets();
      expect(() =>
        validateWidgets([{ ...widget, [key]: 'malicious' }]),
      ).toThrow(BadRequestException);
    },
  );
  it.each([0, 31, '30', null])('rejects unsupported period %s', (days) => {
    const widget = defaultWidgets()[1];
    widget.params.days = days as number;
    expect(() => validateWidgets([widget])).toThrow(BadRequestException);
  });
  it('rejects unknown keys, duplicate keys, bad span, no enabled widgets and out-of-range params', () => {
    const widgets = defaultWidgets();
    expect(() =>
      validateWidgets([{ ...widgets[0], widgetKey: 'custom' }]),
    ).toThrow();
    expect(() => validateWidgets([widgets[0], widgets[0]])).toThrow();
    expect(() =>
      validateWidgets([{ ...widgets[0], layout: { order: 0, span: 4 } }]),
    ).toThrow();
    expect(() =>
      validateWidgets(widgets.map((w) => ({ ...w, enabled: false }))),
    ).toThrow();
    expect(() =>
      validateWidgets([
        { ...widgets[3], params: { ...widgets[3].params, limit: 500 } },
      ]),
    ).toThrow();
  });
  it('requires both product and SKU access, not merely one', () => {
    const definition = DASHBOARD_WIDGETS.find(
      (w) => w.key === 'catalog.distribution',
    )!;
    expect(canViewWidget(user(['Product.read']), definition)).toBe(false);
    expect(
      canViewWidget(user(['Product.read', 'ProductSku.read']), definition),
    ).toBe(true);
  });
  it('skips removed definitions, upgrades parameters and appends new widgets as disabled', () => {
    const w = { ...defaultWidgets()[1], enabled: false, params: { days: 999 } };
    const result = resolveWidgets([null, { widgetKey: 'removed' }, w]);
    expect(result).toHaveLength(DASHBOARD_WIDGETS.length);
    expect(result.find((x) => x.widgetKey === w.widgetKey)).toMatchObject({
      enabled: false,
      params: { days: 7 },
    });
    expect(
      result
        .filter((x) => x.widgetKey !== w.widgetKey)
        .every((x) => x.enabled === false),
    ).toBe(true);
  });
});
