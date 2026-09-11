import { describe, expect, it } from 'vitest';

import { apiHealthResponseSchema } from './index';

describe('apiHealthResponseSchema', () => {
  it('正常な API ヘルスレスポンスを受け入れる', () => {
    expect(
      apiHealthResponseSchema.parse({ status: 'ok', service: 'api' }),
    ).toEqual({ status: 'ok', service: 'api' });
  });
});
