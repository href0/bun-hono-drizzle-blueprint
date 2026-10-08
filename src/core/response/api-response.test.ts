import { describe, expect, it } from 'bun:test';
import { ApiResponse } from './api-response';
import { parseCalendarDate, parseInstant } from '../../utils/datetime.util';

describe('ApiResponse (Unit)', () => {
  it('should write every instant in the same wire form, whatever its stored precision', () => {
    const json = new ApiResponse({
      createdAt: parseInstant('2026-10-05 10:00:00.123456+07'),
      updatedAt: parseInstant('2026-10-05 10:00:00+07'),
      items: [{ dueDate: parseCalendarDate('2026-10-06') }],
    }).toJSON();

    expect(JSON.parse(JSON.stringify(json)).data).toEqual({
      created_at: '2026-10-05T03:00:00.123Z',
      updated_at: '2026-10-05T03:00:00.000Z',
      items: [{ due_date: '2026-10-06' }],
    });
  });

  it('should format standard success response and recursively convert data to snake_case', () => {
    const res = new ApiResponse(
      { id: 1, fullName: 'John Doe', userProfile: { accountStatus: 'active' } },
      'Success message',
      200,
    );
    const json = res.toJSON() as {
      success: boolean;
      status_code: number;
      message: string;
      data: { id: number; full_name: string; user_profile: { account_status: string } };
      meta?: unknown;
    };

    expect(json.success).toBe(true);
    expect(json.status_code).toBe(200);
    expect(json.message).toBe('Success message');
    expect(json.data.id).toBe(1);
    expect(json.data.full_name).toBe('John Doe');
    expect(json.data.user_profile.account_status).toBe('active');
    expect(json.meta).toBeUndefined();
  });

  it('should format response with pagination metadata converted to snake_case', () => {
    const res = new ApiResponse([{ id: 1, itemName: 'Product A' }], 'List retrieved', 200, {
      currentPage: 2,
      perPage: 10,
      totalItems: 50,
      totalPages: 5,
    });
    const json = res.toJSON() as {
      meta: {
        current_page: number;
        per_page: number;
        total_items: number;
        total_pages: number;
      };
      data: Array<{ id: number; item_name: string }>;
    };

    expect(json.meta).toBeDefined();
    expect(json.meta.current_page).toBe(2);
    expect(json.meta.per_page).toBe(10);
    expect(json.meta.total_items).toBe(50);
    expect(json.meta.total_pages).toBe(5);
    expect(json.data[0]?.item_name).toBe('Product A');
  });
});
