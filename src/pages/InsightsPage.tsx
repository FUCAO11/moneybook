import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { db } from '../db';
import type { Txn, Account, Category, Kind } from '../db';

import {
  ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
  BarChart, Bar,
} from 'recharts';

/* -------------------- helpers & types -------------------- */

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

type KindFilter = 'all' | 'expense' | 'income';
type ViewMode   = 'root' | 'child' | 'rootChildren'; // 大类 / 小类 / 指定大类的子类

const fmtAmount = (cents: number, currency = 'CNY') =>
  (cents / 100).toLocaleString(undefined, { style: 'currency', currency });

const formatTooltipCurrency = (value: number | string) =>
  fmtAmount(Number(value));

const ymd = (d: Date) => d.toISOString().slice(0, 10); // YYYY-MM-DD

const COLORS = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
  '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab'
];

function toDayKey(ts: number) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* -------------------- page -------------------- */

export default function InsightsPage() {
  // 快捷：today / 7d / month / all / ''（空=用户手动调整了日期）
  const [quick, setQuick] = useState<'today'|'7d'|'month'|'all'|''>('month');

  // 过滤
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [accountId, setAccountId] = useState<string>('');
  const [q, setQ] = useState('');
  const [start, setStart] = useState<string>(''); // YYYY-MM-DD
  const [end, setEnd] = useState<string>('');

  // 数据
  const [rows, setRows] = useState<RowVM[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [catsMap, setCatsMap] = useState<Map<string, Category>>(new Map());

  // 视图模式（统一控制三张图）
  const [viewMode, setViewMode] = useState<ViewMode>('root');
  const [selectedRootId, setSelectedRootId] = useState<string>('');

  // 手势（左右滑动切换视图）
  const touchStartX = useRef<number | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    const TH = 50;
    if (dx > TH) cycleView(-1);
    if (dx < -TH) cycleView(1);
  }
  function cycleView(dir: -1 | 1) {
    const order: ViewMode[] = ['root', 'child', 'rootChildren'];
    let i = order.indexOf(viewMode);
    i = (i + dir + order.length) % order.length;
    const next = order[i];
    if (next === 'rootChildren' && rootChoices.length === 0) {
      setViewMode('root');
    } else {
      if (next === 'rootChildren' && !selectedRootId && rootChoices[0]) {
        setSelectedRootId(rootChoices[0].id);
      }
      setViewMode(next);
    }
  }

  // 初始化：默认本月；拉取账户 & 分类表
  useEffect(() => {
    const now = new Date();
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setStart(ymd(s));
    setEnd(ymd(e));
    setQuick('month');

    (async () => {
      const [accts, allCats] = await Promise.all([
        db.accounts.toArray(),
        db.categories.toArray(),
      ]);
      setAccounts(accts);
      setCatsMap(new Map(allCats.map(c => [c.id, c])));
    })();
  }, []);

  // 拉数：当筛选变化
  useEffect(() => {
    runFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quick, start, end, kindFilter, accountId, q]);

  async function runFetch() {
    // 1) 取基础集合
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

    // 2) 关键字/账户/收支 过滤
    const acctMap = new Map<string, Account>((await db.accounts.toArray()).map(a => [a.id, a]));
    const catMap  = new Map<string, Category>((await db.categories.toArray()).map(c => [c.id, c]));

    const k = q.trim().toLowerCase();
    txns = txns.filter(t => {
      if (kindFilter !== 'all' && t.kind !== kindFilter) return false;
      if (accountId && t.accountId !== accountId) return false;
      if (!k) return true;
      const a = t.accountId ? (acctMap.get(t.accountId)?.name ?? '') : '';
      const root = t.rootCategoryId ? (catMap.get(t.rootCategoryId)?.name ?? '') : '';
      const child = t.categoryId ? (catMap.get(t.categoryId)?.name ?? '') : '';
      const note = t.note ?? '';
      return [a, root, child, note].some(s => s.toLowerCase().includes(k));
    });

    // 3) 组装 VM
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

    // 「全部」时，把日期输入框显示为 数据库最早/最晚 的日期（仅展示，不影响过滤逻辑）
    if (quick === 'all') {
      const first = await db.txns.orderBy('ts').first();
      const last  = await db.txns.orderBy('ts').reverse().first();
      setStart(first ? ymd(new Date(first.ts)) : '');
      setEnd(last ? ymd(new Date(last.ts)) : '');
    }
  }

  /* ------- 视图相关：可选大类（跟随当前饼图的 income/expense） ------- */
  const pieKind: Kind = kindFilter === 'income' ? 'income' : 'expense';
  const rootChoices = useMemo(() => {
    const all = Array.from(catsMap.values());
    return all.filter(c => c.parentId === null && c.kind === pieKind);
  }, [catsMap, pieKind]);

  // kind 变化或 rootChoices 变化时，确保 rootChildren 有有效的 root
  useEffect(() => {
    if (viewMode === 'rootChildren') {
      const ok = selectedRootId && rootChoices.some(r => r.id === selectedRootId);
      if (!ok) setSelectedRootId(rootChoices[0]?.id || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, rootChoices]);

  /* ------- 统一视图过滤后的 rows（让三张图 & KPI 同步） ------- */
  const rowsScoped = useMemo(() => {
    if (viewMode === 'rootChildren' && selectedRootId) {
      return rows.filter(r => r.rootCategoryId === selectedRootId);
    }
    return rows;
  }, [rows, viewMode, selectedRootId]);

  /* ------- KPI ------- */
  const kpi = useMemo(() => {
    let exp = 0, inc = 0;
    const daySet = new Set<string>();
    rowsScoped.forEach(r => {
      if (r.kind === 'expense') exp += r.amountCents;
      else inc += r.amountCents;
      daySet.add(toDayKey(r.ts));
    });
    const net = inc - exp;
    const days = (quick === 'all' && start && end)
      ? Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1)
      : Math.max(1, daySet.size);
    return {
      expense: exp,
      income: inc,
      net,
      avgExpensePerDay: exp / days
    };
  }, [rowsScoped, quick, start, end]);

  /* ------- 趋势数据（日粒度） ------- */
  const trendData = useMemo(() => {
    const map = new Map<string, { day: string; expense: number; income: number; net: number }>();
    for (const r of rowsScoped) {
      const key = toDayKey(r.ts);
      const obj = map.get(key) || { day: key, expense: 0, income: 0, net: 0 };
      if (r.kind === 'expense') obj.expense += r.amountCents;
      else obj.income += r.amountCents;
      obj.net = obj.income - obj.expense;
      map.set(key, obj);
    }
    return [...map.values()].sort((a,b)=>a.day.localeCompare(b.day));
  }, [rowsScoped]);

  /* ------- 分类饼图（按视图模式分组） ------- */
  const categoryData = useMemo(() => {
    const hit = rowsScoped.filter(r => r.kind === pieKind);
    const sumBy = new Map<string, { id: string; name: string; value: number; count: number }>();

    for (const r of hit) {
      let id = '';
      if (viewMode === 'root') {
        id = r.rootCategoryId || '';
      } else {
        id = r.categoryId || '';
      }
      if (!id) continue;
      const name = catsMap.get(id)?.name || '未分类';
      const obj = sumBy.get(id) || { id, name, value: 0, count: 0 };
      obj.value += r.amountCents;
      obj.count += 1;
      sumBy.set(id, obj);
    }

    const arr = [...sumBy.values()].sort((a,b)=>b.value-a.value);
    const top = arr.slice(0, 10);
    const rest = arr.slice(10);
    const restSum = rest.reduce((s,x)=>s+x.value, 0);
    if (restSum > 0) {
      top.push({ id:'__others__', name:'其他', value: restSum, count: rest.reduce((s,x)=>s+x.count,0) });
    }
    return top;
  }, [rowsScoped, pieKind, viewMode, catsMap]);

  /* ------- 账户条形图（按当前 kindFilter；all 时按支出） ------- */
  const accountKind: Kind = kindFilter === 'income' ? 'income' : 'expense';
  const accountBars = useMemo(() => {
    const hit = rowsScoped.filter(r => r.kind === accountKind);
    const sumBy = new Map<string, { name: string; value: number }>();
    for (const r of hit) {
      const name = r.accountName || '未指定';
      const obj = sumBy.get(name) || { name, value: 0 };
      obj.value += r.amountCents;
      sumBy.set(name, obj);
    }
    return [...sumBy.values()].sort((a,b)=>b.value-a.value);
  }, [rowsScoped, accountKind]);

  /* ------- 交互：快捷时间 ------- */
  async function setQuickRange(range: 'today'|'7d'|'month'|'all') {
    const now = new Date();
    if (range === 'today') {
      const s = ymd(now); setStart(s); setEnd(s);
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

  /* -------------------- render -------------------- */

  return (
    <div style={{ padding: 12 }}>
      {/* 标题 + 快捷筛选 */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
        <h2 style={{ margin: 0 }}>统计</h2>
        <div style={{display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end'}}>
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

      {/* 过滤器（日期在上；控件等宽等高） */}
      <div style={filterGrid}>
        {/* 搜索（占两列） */}
        <input
          placeholder="搜索：备注 / 类别 / 账户"
          value={q}
          onChange={e=>setQ(e.target.value)}
          style={{ ...control, gridColumn: '1 / span 2' }}
        />

        {/* 日期先放上面 */}
        <input
          type="date"
          value={start}
          onChange={e=>{ setStart(e.target.value); setQuick(''); }}
          style={dateControl}
        />
        <input
          type="date"
          value={end}
          onChange={e=>{ setEnd(e.target.value); setQuick(''); }}
          style={dateControl}
        />

        {/* 收支筛选 / 账户 */}
        <select value={kindFilter} onChange={e=>setKindFilter(e.target.value as KindFilter)} style={control}>
          <option value="all">全部（支出+收入）</option>
          <option value="expense">仅支出</option>
          <option value="income">仅收入</option>
        </select>

        <select value={accountId} onChange={e=>setAccountId(e.target.value)} style={control}>
          <option value="">全部账户</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        {/* 视图模式 / 指定大类（第二个下拉始终显示；非 rootChildren 时禁用且置灰） */}
        <select
          value={viewMode}
          onChange={e=>{
            const v = e.target.value as ViewMode;
            setViewMode(v);
            if (v === 'rootChildren' && !selectedRootId && rootChoices[0]) {
              setSelectedRootId(rootChoices[0].id);
            }
          }}
          style={control}
        >
          <option value="root">按大类</option>
          <option value="child">按小类</option>
          <option value="rootChildren">指定大类的子类</option>
        </select>

        <select
          value={selectedRootId}
          onChange={e=>setSelectedRootId(e.target.value)}
          disabled={viewMode !== 'rootChildren'}
          style={{ ...control, ...(viewMode !== 'rootChildren' ? controlDisabled : null) }}
        >
          <option value="">选择大类</option>
          {rootChoices.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>

      {/* KPI */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, margin:'8px 0 12px'}}>
        <div style={statBox}>本期支出：<b style={{color:'#d33'}}>{fmtAmount(kpi.expense)}</b></div>
        <div style={statBox}>本期收入：<b style={{color:'#0a7'}}>{fmtAmount(kpi.income)}</b></div>
        <div style={statBox}>结余：<b style={{color: kpi.net>=0 ? '#0a7' : '#d33'}}>{fmtAmount(Math.abs(kpi.net))} {kpi.net>=0?'盈余':'赤字'}</b></div>
        <div style={statBox}>日均支出：<b>{fmtAmount(Math.round(kpi.avgExpensePerDay))}</b></div>
      </div>

      {/* 趋势（按日） */}
      <section style={{marginBottom:12}}>
        <div style={cardHeader}>
          <strong>趋势（按日）</strong>
          <span style={{color:'#666', fontSize:12}}>
            {viewMode==='root' ? '按大类范围统计' : (viewMode==='child' ? '按小类范围统计' : `仅统计大类「${catsMap.get(selectedRootId)?.name || ''}」`)}
          </span>
        </div>
        <div style={chartCard} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {trendData.length === 0 ? (
            <div style={emptyTip}>暂无数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#e15759" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#e15759" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gInc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#59a14f" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#59a14f" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gNet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4e79a7" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#4e79a7" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis tickFormatter={(v)=> (v/100).toFixed(0)} />
                <Tooltip formatter={(value: number | string) => formatTooltipCurrency(value)} />
                <Area type="monotone" dataKey="expense" name="支出" stroke="#e15759" fill="url(#gExp)" />
                <Area type="monotone" dataKey="income"  name="收入" stroke="#59a14f" fill="url(#gInc)" />
                <Area type="monotone" dataKey="net"     name="结余" stroke="#4e79a7" fill="url(#gNet)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* 分类分析 */}
      <section style={{marginBottom:12}}>
        <div style={cardHeader}>
          <strong>
            分类分析（{pieKind==='expense'?'支出':'收入'} · {
              viewMode==='root' ? '大类' : (viewMode==='child' ? '小类' : `子类：${catsMap.get(selectedRootId)?.name || ''}`)
            }）
          </strong>
        </div>
        <div style={chartCard} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {categoryData.length === 0 ? (
            <div style={emptyTip}>暂无数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={categoryData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                >
                  {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend />
                <Tooltip formatter={(value: number | string) => formatTooltipCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* 账户分析 */}
      <section>
        <div style={cardHeader}>
          <strong>账户分析（{accountKind==='expense'?'支出':'收入'}）</strong>
        </div>
        <div style={chartCard} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {accountBars.length === 0 ? (
            <div style={emptyTip}>暂无数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={accountBars} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v)=> (v/100).toFixed(0)} />
                <Tooltip formatter={(value: number | string) => formatTooltipCurrency(value)} />
                <Bar dataKey="value" name="金额" fill="#4e79a7" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </div>
  );
}

/* -------------------- styles -------------------- */
const filterGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
  marginBottom: 8,
  
};

// 🔁 用这两段替换文件底部的 control / controlDisabled 定义
const control: React.CSSProperties = {
  padding: 8,
  borderRadius: 8,
  border: '1px solid #ddd',
  
};

const controlDisabled: React.CSSProperties = {
  background: '#f6f6f6',
  color: '#999',
  // 仅视觉弱化，不改变尺寸
  opacity: 0.8,
  
};
// 保持你现在的 control / controlDisabled 不变，下面只是新增：

const dateControl: React.CSSProperties = {
  padding: 8,
  borderRadius: 8,
  border: '1px solid #ddd',
  // 关键：在 grid 单元内水平居中
  justifySelf: 'center',
  // 设一个视觉合适的宽度，同时不超过单元格
  width: 180,
  maxWidth: '100%',
  // iOS 日期控件文字居中可能不完全生效，但留着更统一
  textAlign: 'center',
};


const btnLite: React.CSSProperties = { padding:'8px 10px', border:'1px solid #ddd', borderRadius:8, background:'#fff' };
const statBox: React.CSSProperties = { padding:10, border:'1px solid #eee', borderRadius:8, background:'#fafafa' };
const chartCard: React.CSSProperties = { border:'1px solid #eee', borderRadius:8, background:'#fff', padding:8 };
const emptyTip: React.CSSProperties = { padding:12, color:'#888', textAlign:'center' };
const cardHeader: React.CSSProperties = { display:'flex', alignItems:'center', justifyContent:'space-between', margin:'8px 0' };
