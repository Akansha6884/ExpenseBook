import { Expense } from './expense.model';
import { categoryTotals, monthKeyOf, monthlyTotals, shiftMonth } from './expense-stats';

function expense(id: string, amount: number, category: Expense['category'], date: string): Expense {
  return { id, title: id, amount, category, date };
}

describe('expense stats', () => {
  describe('month helpers', () => {
    it('monthKeyOf uses local time', () => {
      expect(monthKeyOf(new Date(2026, 0, 31, 23, 59))).toBe('2026-01');
    });

    it('shiftMonth crosses year boundaries both ways', () => {
      expect(shiftMonth('2026-01', -1)).toBe('2025-12');
      expect(shiftMonth('2025-12', 1)).toBe('2026-01');
      expect(shiftMonth('2026-10', -11)).toBe('2025-11');
      expect(shiftMonth('2026-10', 0)).toBe('2026-10');
    });
  });

  describe('monthlyTotals', () => {
    const data = [
      expense('a', 100, 'Food', '2026-10-01'),
      expense('b', 50.25, 'Food', '2026-10-31'),
      expense('c', 0.1, 'Other', '2026-08-15'),
      expense('d', 0.2, 'Other', '2026-08-16'),
      expense('old', 999, 'Bills', '2025-10-31'),
      expense('future', 5, 'Bills', '2026-11-01')
    ];

    it('returns 12 consecutive months ending at endMonth, oldest first', () => {
      const months = monthlyTotals(data, '2026-10').map((m) => m.month);

      expect(months.length).toBe(12);
      expect(months[0]).toBe('2025-11');
      expect(months[11]).toBe('2026-10');
    });

    it('sums each month, fills gaps with zero, and ignores months outside the range', () => {
      const byMonth = new Map(monthlyTotals(data, '2026-10').map((m) => [m.month, m]));

      expect(byMonth.get('2026-10')).toEqual({ month: '2026-10', total: 150.25, count: 2 });
      expect(byMonth.get('2026-09')).toEqual({ month: '2026-09', total: 0, count: 0 });
      expect(byMonth.has('2025-10')).toBeFalse();
      expect(byMonth.has('2026-11')).toBeFalse();
    });

    it('rounds to paise so float drift never shows', () => {
      const august = monthlyTotals(data, '2026-10').find((m) => m.month === '2026-08');
      expect(august?.total).toBe(0.3);
    });
  });

  describe('categoryTotals', () => {
    it('sums per category, largest first, skipping empty categories', () => {
      const totals = categoryTotals([
        expense('a', 300, 'Travel', '2026-10-01'),
        expense('b', 600, 'Food', '2026-10-02'),
        expense('c', 100, 'Travel', '2026-10-03')
      ]);

      expect(totals.map((t) => [t.category, t.total, t.count])).toEqual([
        ['Food', 600, 1],
        ['Travel', 400, 2]
      ]);
      expect(totals.map((t) => t.percent)).toEqual([60, 40]);
    });

    it('returns an empty list for no expenses', () => {
      expect(categoryTotals([])).toEqual([]);
    });
  });
});
