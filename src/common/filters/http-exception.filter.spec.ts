import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { GlobalExceptionFilter } from './http-exception.filter';

function createHost(url = '/test', method = 'GET') {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });

  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url, method }),
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
  });

  it('formats an HttpException with its own status and message', () => {
    const { host, status, json } = createHost();

    filter.catch(new NotFoundException('Season not found'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: 'Season not found',
        path: '/test',
      }),
    );
  });

  it('joins array-form validation messages into one string', () => {
    const { host, status, json } = createHost();

    filter.catch(
      new BadRequestException(['name must be a string', 'startDate must be a date']),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'name must be a string, startDate must be a date',
      }),
    );
  });

  it('formats an unhandled non-HTTP error as a generic 500', () => {
    const { host, status, json } = createHost();

    filter.catch(new Error('unexpected db failure'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        errorCode: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
      }),
    );
  });
});
