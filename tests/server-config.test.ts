import { expect, it } from 'vitest';
import { serverConfig } from '../integrations/server/config';

it('uses the managed HTTPS address and supports an initially empty client allowlist', () => {
  expect(
    serverConfig({
      RENDER_EXTERNAL_URL: 'https://synthetic.example',
      MEDKIT_OAUTH_CLIENTS_JSON: '[]',
      MEDKIT_BIND_HOST: '0.0.0.0',
      PORT: '10000',
    }),
  ).toEqual({
    baseUrl: 'https://synthetic.example',
    clients: [],
    host: '0.0.0.0',
    port: 10000,
  });
});
it('keeps loopback binding by default and lets an explicit origin override the provider address', () => {
  expect(
    serverConfig({
      MEDKIT_BASE_URL: 'https://owner.example',
      RENDER_EXTERNAL_URL: 'https://synthetic.example',
      MEDKIT_OAUTH_CLIENTS_JSON: '[]',
    }),
  ).toMatchObject({
    baseUrl: 'https://owner.example',
    host: '127.0.0.1',
    port: 4174,
  });
});
it('rejects missing or ambiguous client configuration, malformed clients and invalid listener settings', () => {
  const env = {
    MEDKIT_BASE_URL: 'https://synthetic.example',
    MEDKIT_OAUTH_CLIENTS_JSON: '[]',
  };
  expect(() => serverConfig({ MEDKIT_BASE_URL: env.MEDKIT_BASE_URL })).toThrow(
    'exactly one',
  );
  expect(() =>
    serverConfig({ ...env, MEDKIT_OAUTH_CLIENTS: '/unused' }),
  ).toThrow('exactly one');
  expect(() =>
    serverConfig({ ...env, MEDKIT_OAUTH_CLIENTS_JSON: '[{}]' }),
  ).toThrow();
  expect(() => serverConfig({ ...env, MEDKIT_BIND_HOST: '::' })).toThrow();
  expect(() => serverConfig({ ...env, PORT: '0' })).toThrow();
  expect(() => serverConfig({ ...env, PORT: 'invalid' })).toThrow();
});
