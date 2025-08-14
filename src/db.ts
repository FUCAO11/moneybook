// 原来：import Dexie, { Table } from 'dexie';
import Dexie from 'dexie';
import type { Table } from 'dexie';


export type Kind = 'expense' | 'income';

export interface Txn {
  id: string;
  ts: number;               // 时间戳
  month: string;            // "YYYY-MM"
  kind: Kind;               // 收入/支出
  amountCents: number;      // 金额（分）
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export const monthKey = (ts:number) => new Date(ts).toISOString().slice(0,7);

class MoneyDB extends Dexie {
  txns!: Table<Txn, string>;
  constructor() {
    super('moneybook');
    this.version(1).stores({
      txns: 'id, month, kind, ts, [month+kind]'
    });
  }
}
export const db = new MoneyDB();

export async function addTxn(
  partial: Omit<Txn, 'id'|'createdAt'|'updatedAt'|'month'>
){
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.txns.add({ ...partial, id, month: monthKey(partial.ts), createdAt: now, updatedAt: now });
}
