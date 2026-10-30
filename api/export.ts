import ExcelJS from 'exceljs';
import { Expense } from '../src/app/expenses/expense.model';

const HEADERS = ['Date', 'Title', 'Category', 'Amount (INR)'];

/**
 * CSV for Excel/Sheets: UTF-8 with BOM (so ₹ and non-English titles show correctly),
 * CRLF line endings, RFC 4180 quoting.
 */
export function toCsv(expenses: readonly Expense[]): string {
  const rows = expenses.map((e) => [e.date, e.title, e.category, e.amount.toFixed(2)]);
  return '﻿' + [HEADERS, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function csvCell(value: string): string {
  // A leading = + - @ (or tab/CR) would run as a formula when opened in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** A real .xlsx: date and currency cells, bold frozen header, filter buttons, and a SUM total. */
export async function toXlsx(expenses: readonly Expense[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Expense Book';
  const sheet = workbook.addWorksheet('Expenses', { views: [{ state: 'frozen', ySplit: 1 }] });

  sheet.columns = [
    { header: HEADERS[0], key: 'date', width: 14, style: { numFmt: 'dd-mmm-yyyy' } },
    { header: HEADERS[1], key: 'title', width: 40 },
    { header: HEADERS[2], key: 'category', width: 14 },
    { header: HEADERS[3], key: 'amount', width: 16, style: { numFmt: '"₹"#,##0.00' } }
  ];
  sheet.getRow(1).font = { bold: true };

  for (const e of expenses) {
    // Strings are written as text, never as formulas, so titles can't inject one.
    sheet.addRow({ date: toUtcDate(e.date), title: e.title, category: e.category, amount: e.amount });
  }

  if (expenses.length > 0) {
    sheet.autoFilter = { from: 'A1', to: `D${expenses.length + 1}` };
    const total = Math.round(expenses.reduce((sum, e) => sum + e.amount, 0) * 100) / 100;
    const totalRow = sheet.addRow({
      title: 'Total',
      amount: { formula: `SUM(D2:D${expenses.length + 1})`, result: total }
    });
    totalRow.font = { bold: true };
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Midnight UTC, so the spreadsheet shows the same calendar day in every time zone. */
function toUtcDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** e.g. expenses-2026-10-29.csv */
export function exportFileName(extension: 'csv' | 'xlsx', today = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `expenses-${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}.${extension}`;
}
