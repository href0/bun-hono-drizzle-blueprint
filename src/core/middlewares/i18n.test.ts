import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { appConfig } from '../../config';
import { getLocale } from '../context/request-context';
import { ConflictError, NotFoundError } from '../errors';
import { ApiResponse } from '../response/api-response';
import { asyncHandler } from './async-handler';
import { globalErrorHandler } from './error-handler';
import { notFoundHandler } from './not-found';
import { requestContextMiddleware } from './request-context';

const buildApp = (): Hono => {
  const app = new Hono();
  app.use('*', requestContextMiddleware());
  app.get(
    '/ok',
    asyncHandler(() =>
      Promise.resolve(
        new ApiResponse({ locale: getLocale() }, { id: 'Berhasil diambil', en: 'Fetched' }),
      ),
    ),
  );
  app.get('/conflict', () => {
    throw new ConflictError(
      { id: 'Email sudah dipakai', en: 'Email already used' },
      {
        details: [{ field: 'email', message: { id: 'Sudah terdaftar', en: 'Already registered' } }],
      },
    );
  });
  app.get('/missing-default', () => {
    throw new NotFoundError();
  });
  app.onError(globalErrorHandler);
  app.notFound(notFoundHandler);
  return app;
};

const get = (path: string, acceptLanguage?: string): Response | Promise<Response> =>
  buildApp().request(
    path,
    acceptLanguage ? { headers: { 'Accept-Language': acceptLanguage } } : {},
  );

describe('i18n — language negotiation per request', () => {
  it('should answer in DEFAULT_LOCALE without Accept-Language and advertise it', async () => {
    const res = await get('/ok');

    expect(appConfig.DEFAULT_LOCALE).toBe('id');
    expect(res.headers.get('Content-Language')).toBe('id');
    expect(res.headers.get('Vary')).toContain('Accept-Language');
    expect(await res.json()).toMatchObject({ message: 'Berhasil diambil', data: { locale: 'id' } });
  });

  it('should answer success responses in English for Accept-Language: en', async () => {
    const res = await get('/ok', 'en-US,en;q=0.9,id;q=0.5');

    expect(res.headers.get('Content-Language')).toBe('en');
    expect(await res.json()).toMatchObject({ message: 'Fetched', data: { locale: 'en' } });
  });

  it('should translate error messages and their details', async () => {
    const id = (await (await get('/conflict', 'id')).json()) as Record<string, any>;
    const en = (await (await get('/conflict', 'en')).json()) as Record<string, any>;

    expect(id.message).toBe('Email sudah dipakai');
    expect(id.error.details).toEqual([{ field: 'email', message: 'Sudah terdaftar' }]);
    expect(en.message).toBe('Email already used');
    expect(en.error.details).toEqual([{ field: 'email', message: 'Already registered' }]);
  });

  it('should translate default error messages and the 404 route message', async () => {
    const defaultMessage = (await (await get('/missing-default', 'en')).json()) as {
      message: string;
    };
    const route = (await (await get('/nowhere', 'en')).json()) as { message: string };

    expect(defaultMessage.message).toBe('Resource not found');
    expect(route.message).toBe('Route not found: GET /nowhere');
  });

  it('should fall back to DEFAULT_LOCALE for an unsupported language', async () => {
    const res = await get('/ok', 'fr-FR');

    expect(res.headers.get('Content-Language')).toBe('id');
    expect(((await res.json()) as { message: string }).message).toBe('Berhasil diambil');
  });

  it('getLocale() outside a request should return DEFAULT_LOCALE', () => {
    expect(getLocale()).toBe(appConfig.DEFAULT_LOCALE);
  });

  it('should keep Error.message in English for logs regardless of the request language', () => {
    expect(new ConflictError({ id: 'Bentrok', en: 'Clash' }).message).toBe('Clash');
  });
});
