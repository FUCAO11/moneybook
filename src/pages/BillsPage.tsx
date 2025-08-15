// src/pages/BillsPage.tsx
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { db, listRootCategories, listChildren, monthKey } from '../db';
import type { Txn, Account, Category, Kind } from '../db';

/* ================= helpers ================= */
type RowVM = {
  id: string;
  ts: number;
  kind: Kind;
  amountCents: number;
  note?: string;
  accountId?: string;
  accountName?: string;
  currency: string;
  rootCategoryId?: string;
  categoryId?: string;
  rootName?: string;
  childName?: string;
};

const fmtAmount = (cents: number, currency = 'CNY') =>
  (cents / 100).toLocaleString(undefined, { style: 'currency', currency });
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const toCents = (s: string) => Math.max(0, Math.round((parseFloat(s || '0')) * 100));
const toLocalDatetimeInputValue = (ts: number) => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/* ================= page ================= */
export default function BillsPage() {
  const [quick, setQuick] = useState<'today'|'7d'|'month'|'all'|''>('today');
  const [q, setQ] = useState('');
  const [start, setStart] = useState<string>(''); // YYYY-MM-DD
  const [end, setEnd] = useState<string>('');     // YYYY-MM-DD
  const [loading, setLoading] = useState(false);

  const [rows, setRows] = useState<RowVM[]>([]);

  const [swipedId, setSwipedId] = useState<string>('');
  const touchStartX = useRef<number | null>(null);
  const touchActiveId = useRef<string | null>(null);

  const { sumExpense, sumIncome } = useMemo(() => {
    let exp = 0, inc = 0;
    for (const r of rows) {
      if (r.kind === 'expense') exp += r.amountCents;
      else inc += r.amountCents;
    }
    return { sumExpense: exp, sumIncome: inc };
  }, [rows]);

  // 查询函数：依赖筛选条件
  const runSearch = useCallback(async () => {
    setLoading(true);
    try {
      let txns: Txn[] = [];
      if (quick === 'all') {
        txns = await db.txns.orderBy('ts').reverse().toArray();
      } else {
        const startTs = start ? new Date(start + 'T00:00:00').getTime() : undefined;
        const endTs   = end   ? new Date(end   + 'T23:59:59.999').getTime() : undefined;
        if (startTs !== undefined && endTs !== undefined) {
          txns = await db.txns.where('ts').between(startTs, endTs, true, true).reverse().toArray();
        } else if (startTs !== undefined) {
          txns = await db.txns.where('ts').aboveOrEqual(startTs).reverse().toArray();
        } else if (endTs !== undefined) {
          txns = await db.txns.where('ts').belowOrEqual(endTs).reverse().toArray();
        } else {
          txns = await db.txns.orderBy('ts').reverse().toArray();
        }
      }

      const [accounts, categories] = await Promise.all([db.accounts.toArray(), db.categories.toArray()]);
      const acctMap = new Map<string, Account>(accounts.map(a => [a.id, a]));
      const catMap  = new Map<string, Category>(categories.map(c => [c.id, c]));

      const k = q.trim().toLowerCase();
      if (k) {
        txns = txns.filter(t => {
          const a = t.accountId ? (acctMap.get(t.accountId)?.name ?? '') : '';
          const root = t.rootCategoryId ? (catMap.get(t.rootCategoryId)?.name ?? '') : '';
          const child = t.categoryId ? (catMap.get(t.categoryId)?.name ?? '') : '';
          const note = t.note ?? '';
          return [a, root, child, note].some(s => s.toLowerCase().includes(k));
        });
      }

      const vms: RowVM[] = txns.map(t => {
        const a = t.accountId ? acctMap.get(t.accountId) : undefined;
        const root = t.rootCategoryId ? catMap.get(t.rootCategoryId) : undefined;
        const child = t.categoryId ? catMap.get(t.categoryId) : undefined;
        return {
          id: t.id,
          ts: t.ts,
          kind: t.kind,
          amountCents: t.amountCents,
          note: t.note,
          accountId: t.accountId,
          accountName: a?.name,
          currency: a?.currency || 'CNY',
          rootCategoryId: t.rootCategoryId,
          categoryId: t.categoryId,
          rootName: root?.name,
          childName: child?.name,
        };
      });

      setRows(vms);
    } finally {
      setLoading(false);
    }
  }, [q, start, end, quick]);

  // 初始设定为“今日”
  useEffect(() => {
    const now = new Date();
    const s = ymd(now);
    setStart(s);
    setEnd(s);
    setQuick('today');
  }, []);

  // 条件变化就查询（不需要禁用规则）
  useEffect(() => {
    runSearch();
  }, [runSearch]);

  async function setQuickRange(range: 'today'|'7d'|'month'|'all') {
    const now = new Date();
    if (range === 'today') {
      const s = ymd(now);
      setStart(s); setEnd(s);
    } else if (range === '7d') {
      const s = new Date(now); s.setDate(now.getDate()-6);
      setStart(ymd(s)); setEnd(ymd(now));
    } else if (range === 'month') {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth()+1, 0);
      setStart(ymd(s)); setEnd(ymd(e));
    } else if (range === 'all') {
      const first = await db.txns.orderBy('ts').first();
      const last  = await db.txns.orderBy('ts').reverse().first();
      setStart(first ? ymd(new Date(first.ts)) : '');
      setEnd(last ? ymd(new Date(last.ts)) : '');
    }
    setQuick(range);
  }

  // 左滑
  function onTouchStart(id: string, e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchActiveId.current = id;
  }
  function onTouchMove(id: string, e: React.TouchEvent) {
    if (touchActiveId.current !== id || touchStartX.current == null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    if (dx < -30) setSwipedId(id);
    if (dx > 30 && swipedId === id) setSwipedId('');
  }
  function onTouchEnd() {
    touchStartX.current = null;
    touchActiveId.current = null;
  }

  async function onDelete(id: string) {
    if (!confirm('确认删除这条记录？')) return;
    await db.txns.delete(id);
    setSwipedId('');
    runSearch();
  }

  return (
    <div style={{ padding: 12 }}>
      {/* 标题 + 快捷按钮 */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
        <h2 style={{ margin: 0 }}>账单</h2>
        <div style={{display:'flex', gap:8}}>
          <button type="button" onClick={()=>setQuickRange('today')}
                  style={{...btnLite, background: quick==='today'?'#eef4ff':'#fff'}}>今日</button>
          <button type="button" onClick={()=>setQuickRange('7d')}
                  style={{...btnLite, background: quick==='7d'?'#eef4ff':'#fff'}}>近7天</button>
          <button type="button" onClick={()=>setQuickRange('month')}
                  style={{...btnLite, background: quick==='month'?'#eef4ff':'#fff'}}>本月</button>
          <button type="button" onClick={()=>setQuickRange('all')}
                  style={{...btnLite, background: quick==='all'?'#eef4ff':'#fff'}}>全部</button>
        </div>
      </div>

      {/* 筛选区：搜索 + 居中的两个日期输入 */}
      <div style={{ marginBottom:8 }}>
        <input
          placeholder="搜索：备注 / 类别 / 账户"
          value={q}
          onChange={e=>setQ(e.target.value)}
          style={{...inp, width:'100%'}}
        />
        <div style={{display:'flex', gap:8, justifyContent:'center', marginTop:8}}>
          <input
            type="date"
            value={start}
            onChange={e=>{ setStart(e.target.value); setQuick(''); }}
            style={dateInp}
          />
          <input
            type="date"
            value={end}
            onChange={e=>{ setEnd(e.target.value); setQuick(''); }}
            style={dateInp}
          />
        </div>
      </div>

      {/* 汇总 */}
      <div style={{display:'flex', gap:12, margin:'8px 0 12px'}}>
        <div style={statBox}>本期支出：<b style={{color:'#d33'}}>{fmtAmount(sumExpense)}</b></div>
        <div style={statBox}>本期收入：<b style={{color:'#0a7'}}>{fmtAmount(sumIncome)}</b></div>
      </div>

      {/* 列表 */}
      {loading ? (
        <div style={{padding:12, color:'#888'}}>加载中…</div>
      ) : rows.length === 0 ? (
        <div style={{padding:12, color:'#888'}}>暂无记录</div>
      ) : (
        <div style={{border:'1px solid #eee', borderRadius:8, overflow:'hidden'}}>
          {rows.map(r => {
            const opened = swipedId === r.id;
            return (
              <div key={r.id} style={{position:'relative', overflow:'hidden'}}>
                <div style={{position:'absolute', right:0, top:0, bottom:0, width:180, display:'flex'}}>
                  <button type="button" onClick={()=>onDelete(r.id)}
                          style={{flex:1, border:'none', background:'#e74c3c', color:'#fff'}}>删除</button>
                  <EditLauncher row={r} onSaved={()=>{ setSwipedId(''); runSearch(); }} />
                </div>

                <div
                  onTouchStart={(e)=>onTouchStart(r.id, e)}
                  onTouchMove={(e)=>onTouchMove(r.id, e)}
                  onTouchEnd={onTouchEnd}
                  style={{...itemRow, transform:`translateX(${opened?-180:0}px)`, transition:'transform .2s ease'}}
                >
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{display:'flex', alignItems:'center', gap:6}}>
                      <span style={kindPill(r.kind)}>{r.kind==='expense'?'支出':'收入'}</span>
                      <span style={{fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                        {r.rootName || '未分类'}{r.childName ? ` / ${r.childName}` : ''}
                      </span>
                    </div>
                    <div style={{fontSize:12, color:'#888', marginTop:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                      {new Date(r.ts).toLocaleString()}
                      {r.accountName ? ` · ${r.accountName}` : ''}
                      {r.note ? ` · ${r.note}` : ''}
                    </div>
                  </div>
                  <div style={{marginLeft:8, textAlign:'right', whiteSpace:'nowrap',
                              color: r.kind==='expense' ? '#d33' : '#0a7', fontWeight:700}}>
                    {r.kind==='expense' ? '-' : '+'}{fmtAmount(r.amountCents, r.currency)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* =============== 编辑入口（按钮+弹窗） =============== */
function EditLauncher({ row, onSaved }: { row: RowVM; onSaved: ()=>void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={()=>setOpen(true)}
              style={{flex:1, border:'none', background:'#95a5a6', color:'#fff'}}>修改</button>
      {open && <EditModal row={row} onClose={(saved)=>{ setOpen(false); if (saved) onSaved(); }} />}
    </>
  );
}

function EditModal({ row, onClose }: { row: RowVM; onClose: (saved:boolean)=>void }) {
  const [kind, setKind] = useState<Kind>(row.kind);
  const [amount, setAmount] = useState<string>((row.amountCents/100).toString());
  const [note, setNote] = useState<string>(row.note || '');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string>(row.accountId || '');

  const [roots, setRoots] = useState<Category[]>([]);
  const [rootId, setRootId] = useState<string>(row.rootCategoryId || '');
  const [children, setChildren] = useState<Category[]>([]);
  const [childId, setChildId] = useState<string>(row.categoryId || '');

  const [dt, setDt] = useState<string>(toLocalDatetimeInputValue(row.ts));

  // 只在挂载时加载账户；用函数式 setState 避免把 accountId 放进依赖
  useEffect(() => {
    let ignore = false;
    (async () => {
      const accts = await db.accounts.toArray();
      if (ignore) return;
      setAccounts(accts);
      setAccountId(cur => cur || accts[0]?.id || '');
    })();
    return () => { ignore = true; };
  }, []);

  // kind 变化时加载分类；用 row.* 作为偏好默认值，避免读 rootId/childId 进依赖
  useEffect(() => {
    let ignore = false;
    (async () => {
      const rts = await listRootCategories(kind);
      if (ignore) return;
      setRoots(rts);

      const prefRoot = row.rootCategoryId;
      const rid = (prefRoot && rts.some(x=>x.id===prefRoot)) ? prefRoot : (rts[0]?.id || '');
      setRootId(cur => cur || rid);

      const cs = rid ? await listChildren(rid) : [];
      if (ignore) return;
      setChildren(cs);

      const prefChild = row.categoryId;
      setChildId(cur =>
        (cur && cs.some(x=>x.id===cur))
          ? cur
          : (prefChild && cs.some(x=>x.id===prefChild)) ? prefChild : (cs[0]?.id || '')
      );
    })();
    return () => { ignore = true; };
  }, [kind, row.rootCategoryId, row.categoryId]);

  async function onChangeRoot(id: string) {
    setRootId(id);
    const cs = id ? await listChildren(id) : [];
    setChildren(cs);
    setChildId(cs[0]?.id || '');
  }

  async function save() {
    const cents = toCents(amount);
    if (!cents) { alert('请输入正确金额'); return; }
    if (!childId) { alert('请选择小类'); return; }
    if (!dt) { alert('请选择时间'); return; }

    const t = await db.txns.get(row.id);
    if (!t) { alert('记录不存在'); onClose(false); return; }

    const newTs = new Date(dt).getTime();

    t.kind = kind;
    t.ts = newTs;
    t.month = monthKey(newTs);
    t.amountCents = cents;
    t.note = note.trim() || undefined;
    t.accountId = accountId || undefined;
    t.categoryId = childId;
    t.rootCategoryId = rootId || undefined;
    t.updatedAt = Date.now();

    await db.txns.put(t);
    onClose(true);
  }

  return (
    <div style={overlay}>
      <div style={card}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
          <strong>修改记录</strong>
          <button type="button" onClick={()=>onClose(false)} style={btnLite}>取消</button>
        </div>

        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
          <button type="button"
            onClick={()=>setKind('expense')}
            style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #ddd',
                    background: kind==='expense' ? '#eef4ff' : '#fff' }}>
            支出
          </button>
          <button type="button"
            onClick={()=>setKind('income')}
            style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #ddd',
                    background: kind==='income' ? '#eef4ff' : '#fff' }}>
            收入
          </button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>大类：</label>
          <div style={{ display:'flex', gap:8 }}>
            <select value={rootId} onChange={e=>onChangeRoot(e.target.value)} style={{ flex:1, padding:8 }}>
              {roots.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>小类：</label>
          <div style={{ display:'flex', gap:8 }}>
            <select value={childId} onChange={e=>setChildId(e.target.value)} style={{ flex:1, padding:8 }}>
              {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div style={{ margin:'12px 0' }}>
          <label>金额：</label>
          <input inputMode="decimal" placeholder="0.00"
            value={amount} onChange={e=>setAmount(e.target.value)}
            style={{ width:'100%', padding:10, borderRadius:8, border:'1px solid #ddd' }} />
        </div>

        <div style={{ margin:'12px 0' }}>
          <label>时间：</label>
          <input type="datetime-local"
            value={dt}
            onChange={e=>setDt(e.target.value)}
            style={{ width:'100%', padding:10, borderRadius:8, border:'1px solid #ddd' }} />
        </div>

        <div style={{ marginBottom: 8 }}>
          <label>账户：</label>
          <select value={accountId} onChange={e=>setAccountId(e.target.value)} style={{ width:'100%', padding:8 }}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div style={{ margin:'12px 0' }}>
          <label>备注（可选）：</label>
          <input placeholder="可留空"
            value={note} onChange={e=>setNote(e.target.value)}
            style={{ width:'100%', padding:10, borderRadius:8, border:'1px solid #ddd' }} />
        </div>

        <button type="button" onClick={save}
          style={{ width:'100%', padding:12, borderRadius:10, background:'#0d6efd', color:'#fff' }}>
          保存修改
        </button>
      </div>
    </div>
  );
}

/* =============== styles =============== */
const inp: React.CSSProperties = { padding:8, borderRadius:8, border:'1px solid #ddd' };

/** 日期输入：居中 + 略放大（手机友好） */
const dateInp: React.CSSProperties = {
  padding:'10px 12px',
  borderRadius:12,
  border:'1px solid #ddd',
  fontSize:16,
  height:44,
  textAlign:'center',
  width:'min(210px, 43vw)',   // 两个并排在手机屏上舒适
  flex:'0 0 auto'
};

const btnLite: React.CSSProperties = { padding:'8px 10px', border:'1px solid #ddd', borderRadius:8, background:'#fff' };
const statBox: React.CSSProperties = { flex:1, padding:10, border:'1px solid #eee', borderRadius:8, background:'#fafafa' };
const itemRow: React.CSSProperties = { display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderBottom:'1px solid #f1f1f1', background:'#fff' };
const kindPill = (k: Kind): React.CSSProperties => ({
  fontSize:12, borderRadius:999, padding:'2px 8px',
  background: k==='expense' ? '#fde7e7' : '#e6f5ee',
  color: k==='expense' ? '#c22121' : '#0b7f52'
});
const overlay: React.CSSProperties = {
  position:'fixed', inset:0, background:'rgba(0,0,0,.35)',
  display:'flex', alignItems:'center', justifyContent:'center', zIndex: 999
};
const card: React.CSSProperties = {
  width:'min(720px, 92vw)',
  maxHeight:'80vh',
  background:'#fff',
  borderRadius:12,
  padding:12,
  boxShadow:'0 8px 28px rgba(0,0,0,.18)',
  display:'flex', flexDirection:'column'
};
