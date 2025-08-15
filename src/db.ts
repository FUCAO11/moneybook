// src/db.ts
import Dexie, { type Table } from 'dexie';
import { uuid } from './utils/uuid';

export type Kind = 'expense' | 'income';

/* ======= 数据结构 ======= */



// 重命名账户
export async function renameAccount(id: string, name: string) {
  await db.accounts.update(id, { name: name.trim() });
}

// 删除账户（如被流水引用则不允许）
export async function deleteAccount(id: string) {
  const used = await db.txns.where('accountId').equals(id).count();
  if (used > 0) throw new Error('该账户已被流水引用，无法删除');
  await db.accounts.delete(id);
}


export interface Account {
  id: string;
  name: string;
  type: 'cash' | 'bank' | 'wallet';
  currency: string;   // 'CNY' 等
  createdAt: number;
}

export interface Category {
  id: string;
  name: string;
  kind: Kind;
  parentId: string | null; // null = 大类; 其他为所属大类ID（小类）
  color?: string;
  enabled?: boolean;       // ✅ 新增：是否启用（默认 true）
  createdAt: number;
}

export interface Txn {
  id: string;
  ts: number;                 // 时间戳（自动现在）
  month: string;              // "YYYY-MM"
  kind: Kind;                 // 收入/支出
  amountCents: number;
  note?: string;
  accountId?: string;         // 支付/收入方式（账户）
  categoryId?: string;        // 小类
  rootCategoryId?: string;    // 大类（统计友好）
  createdAt: number;
  updatedAt: number;
}

export const monthKey = (ts:number) => {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  return `${y}-${m}`;
};

/* ======= Dexie 实例与版本迁移 ======= */

class MoneyDB extends Dexie {
  txns!: Table<Txn, string>;
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;

  constructor() {
    super('moneybook');

    // v1: 只有 txns
    this.version(1).stores({
      txns: 'id, month, kind, ts, [month+kind]'
    });

    // v2: 加 accounts & categories
    this.version(2).stores({
      txns: 'id, month, kind, ts, [month+kind]',
      accounts: 'id, name, type, currency',
      categories: 'id, kind, parentId, name, [kind+parentId]'
    });

    // v3: txns 增加 categoryId / rootCategoryId / account 相关索引
    this.version(3).stores({
      txns: 'id, month, kind, ts, [month+kind], categoryId, rootCategoryId, accountId, [month+rootCategoryId], [accountId+month]',
      accounts: 'id, name, type, currency',
      categories: 'id, kind, parentId, name, [kind+parentId]'
    }).upgrade(async (tx) => {
      // 兼容旧数据：如果已有 categoryId 但没有 rootCategoryId，则尝试回填
      const catTable = tx.table('categories') as Table<Category, string>;
      const txnTable = tx.table('txns') as Table<Txn, string>;
      const all = await txnTable.toArray();
      for (const t of all) {
        if (t.categoryId && !t.rootCategoryId) {
          const child = await catTable.get(t.categoryId);
          if (child) {
            t.rootCategoryId = child.parentId ?? child.id;
            await txnTable.put(t);
          }
        }
      }
    });

    // v4: 为 Category 增加 enabled 字段（默认 true）
    // 注意：schema 字符串不变（未加索引），只是借升级钩子给历史数据补字段
    this.version(4).stores({
      txns: 'id, month, kind, ts, [month+kind], categoryId, rootCategoryId, accountId, [month+rootCategoryId], [accountId+month]',
      accounts: 'id, name, type, currency',
      categories: 'id, kind, parentId, name, [kind+parentId]'
    }).upgrade(async (tx) => {
      const cats = tx.table('categories') as Table<Category, string>;
      const all = await cats.toArray();
      for (const c of all) {
        if (typeof c.enabled === 'undefined') {
          c.enabled = true;
          await cats.put(c);
        }
      }
    });
  }
}

export const db = new MoneyDB();

/* ======= 种子数据 ======= */

export async function ensureSeed() {
  const now = Date.now();
  if (await db.accounts.count() === 0) {
    await db.accounts.bulkAdd([
      { id: uuid(), name:'现金',  type:'cash',  currency:'CNY', createdAt: now },
      { id: uuid(), name:'银行卡', type:'bank',  currency:'CNY', createdAt: now },
      { id: uuid(), name:'电子钱包', type:'wallet', currency:'CNY', createdAt: now }
    ]);
  }
  if (await db.categories.count() === 0) {
    const eatId = uuid();
    const transId = uuid();
    const salaryId = uuid();
    await db.categories.bulkAdd([
      { id: eatId,    name:'饮食', kind:'expense', parentId: null, enabled:true, createdAt: now },
      { id: transId,  name:'交通', kind:'expense', parentId: null, enabled:true, createdAt: now },
      { id: salaryId, name:'工资', kind:'income',  parentId: null, enabled:true, createdAt: now },
      // 样例小类
      { id: uuid(), name:'早餐', kind:'expense', parentId: eatId, enabled:true, createdAt: now },
      { id: uuid(), name:'午餐', kind:'expense', parentId: eatId, enabled:true, createdAt: now },
    ]);
  }
}

/* ======= 分类/账户/流水 API ======= */

/** 快速新增分类（大类/小类） */
export async function addCategory(opts: { kind: Kind; name: string; parentId?: string | null }) {
  const rec: Category = {
    id: uuid(),
    name: opts.name.trim(),
    kind: opts.kind,
    parentId: (opts.parentId ?? null),
    enabled: true,
    createdAt: Date.now()
  };
  await db.categories.add(rec);
  return rec;
}

/** 只列出启用的大类；管理界面可传 includeDisabled:true 查看全部 */
export async function listRootCategories(kind: Kind, opts?: { includeDisabled?: boolean }) {
  if (opts?.includeDisabled) {
    return db.categories.where('kind').equals(kind).and(c => c.parentId === null).sortBy('createdAt');
  }
  return db.categories.where('kind').equals(kind)
    .and(c => c.parentId === null && c.enabled !== false).sortBy('createdAt');
}

/** 只列出启用的小类；管理界面可传 includeDisabled:true 查看全部 */
export async function listChildren(rootId: string, opts?: { includeDisabled?: boolean }) {
  if (opts?.includeDisabled) {
    return db.categories.where('parentId').equals(rootId).sortBy('createdAt');
  }
  return db.categories.where('parentId').equals(rootId)
    .and(c => c.enabled !== false).sortBy('createdAt');
}

/** 快速新增账户 */
export async function addAccountQuick(name: string, type: Account['type'] = 'cash', currency='CNY') {
  const rec: Account = { id: uuid(), name: name.trim(), type, currency, createdAt: Date.now() };
  await db.accounts.add(rec);
  return rec;
}

/** 保存一笔流水（自动 ts / month，并回填 rootCategoryId） */
export async function addTxn(p: {
  kind: Kind;
  amountCents: number;
  note?: string;
  accountId?: string;
  categoryId?: string;   // 小类
  ts?: number;           // 可选，不传则用现在
}) {
  const ts = p.ts ?? Date.now();
  const id = uuid();
  const now = Date.now();
  let rootCategoryId: string | undefined = undefined;
  if (p.categoryId) {
    const child = await db.categories.get(p.categoryId);
    if (child) rootCategoryId = child.parentId ?? child.id;
  }
  const rec: Txn = {
    id,
    ts,
    month: monthKey(ts),
    kind: p.kind,
    amountCents: p.amountCents,
    note: p.note?.trim() || undefined,
    accountId: p.accountId,
    categoryId: p.categoryId,
    rootCategoryId,
    createdAt: now,
    updatedAt: now
  };
  await db.txns.add(rec);
  return rec;
}

/* ======= 分类管理（查看/重命名/启用/移动/删除） ======= */

export async function getCategory(id: string) {
  return db.categories.get(id);
}

/** 重命名分类 */
export async function renameCategory(id: string, name: string) {
  await db.categories.update(id, { name: name.trim() });
}

/** 启用/停用；大类停用时级联其子类；启用时只启用自身（可按需改为级联） */
export async function setCategoryEnabled(id: string, enabled: boolean) {
  await db.transaction('rw', db.categories, async () => {
    const cat = await db.categories.get(id);
    if (!cat) return;
    await db.categories.update(id, { enabled });
    if (cat.parentId === null) {
      const kids = await db.categories.where('parentId').equals(cat.id).toArray();
      await Promise.all(kids.map(k => db.categories.update(k.id, { enabled })));
    }
  });
}

/** 把“小类”移动到另一个大类；并修正该小类历史流水的 rootCategoryId */
export async function moveChildToRoot(childId: string, newRootId: string) {
  await db.transaction('rw', db.categories, db.txns, async () => {
    const child = await db.categories.get(childId);
    const root  = await db.categories.get(newRootId);
    if (!child || !root) throw new Error('分类不存在');
    if (child.parentId === null) throw new Error('只能移动小类');
    if (root.parentId !== null) throw new Error('新父级必须是大类');

    await db.categories.update(childId, { parentId: newRootId });
    // 修正历史流水的 rootCategoryId
    const rows = await db.txns.where('categoryId').equals(childId).toArray();
    for (const t of rows) {
      t.rootCategoryId = newRootId;
      await db.txns.put(t);
    }
  });
}

/** 删除分类：大类需无子类且无引用；小类需无引用 */
export async function deleteCategory(id: string) {
  const cat = await db.categories.get(id);
  if (!cat) return;

  if (cat.parentId === null) {
    const childCnt = await db.categories.where('parentId').equals(cat.id).count();
    if (childCnt > 0) throw new Error('该大类下仍有小类，无法删除');
    const used = await db.txns.where('rootCategoryId').equals(cat.id).count();
    if (used > 0) throw new Error('该大类已被流水引用，无法删除');
  } else {
    const used = await db.txns.where('categoryId').equals(cat.id).count();
    if (used > 0) throw new Error('该小类已被流水引用，无法删除');
  }
  await db.categories.delete(id);
}


