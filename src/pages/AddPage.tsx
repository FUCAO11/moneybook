// src/pages/AddPage.tsx
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  db, ensureSeed, addTxn, addCategory, listRootCategories, listChildren,
  addAccountQuick,
} from '../db';
import { deleteCategory, getCategory, renameAccount, deleteAccount, renameCategory } from '../db';
import type { Kind, Account, Category } from '../db';


const toCents = (s:string) => Math.max(0, Math.round((parseFloat(s || '0')) * 100));

export default function AddPage() {
  // 基本输入
  const [kind, setKind] = useState<Kind>('expense');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  // 分类（两级）
  const [roots, setRoots] = useState<Category[]>([]);
  const [rootId, setRootId] = useState<string>('');
  const [children, setChildren] = useState<Category[]>([]);
  const [childId, setChildId] = useState<string>('');

  // 账户
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string>('');

  // 统一弹窗
  const [showMgr, setShowMgr] = useState(false);
  const [mgrTab, setMgrTab] = useState<'category' | 'account'>('category');

  const currency = useMemo(() => accounts[0]?.currency || 'CNY', [accounts]);

  useEffect(() => {
    (async () => {
      await ensureSeed();
      const accts = await db.accounts.toArray();
      setAccounts(accts);
      setAccountId(accts[0]?.id || '');
      await reloadRoots(kind);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 用 useCallback 定义，放在两个 useEffect 之前，避免“使用前定义”的报错
const reloadRoots = useCallback(async (k: Kind) => {
  const r = await listRootCategories(k);
  setRoots(r);
  const firstRoot = r[0]?.id || '';

  // 用函数式 setState，避免把 rootId/childId 加进依赖
  setRootId(prevRootId => {
    const newRoot = r.find(x => x.id === prevRootId)?.id || firstRoot;

    (async () => {
      if (newRoot) {
        const cs = await listChildren(newRoot);
        setChildren(cs);
        setChildId(prevChildId =>
          cs.find(x => x.id === prevChildId)?.id || cs[0]?.id || ''
        );
      } else {
        setChildren([]);
        setChildId('');
      }
    })();

    return newRoot;
  });
}, []);

// kind 切换时刷新大类/小类（依赖完整，不再告警）
useEffect(() => {
  reloadRoots(kind);
}, [kind, reloadRoots]);


  // kind 切换时刷新大类/小类
  // kind 切换时刷新大类/小类（无警告版本）
   useEffect(() => {reloadRoots(kind);}, [kind, reloadRoots]);


  

  async function onChangeRoot(id: string) {
    setRootId(id);
    const cs = id ? await listChildren(id) : [];
    setChildren(cs);
    setChildId(cs[0]?.id || '');
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cents = toCents(amount);
    if (!cents) { alert('请输入金额'); return; }
    if (!childId) { alert('请选择小类'); return; }

    await addTxn({
      kind,
      amountCents: cents,
      note,
      accountId: accountId || undefined,
      categoryId: childId
    });
    setAmount(''); setNote('');
    alert('已保存');
  }

  return (
    <div style={{ padding: 12 }}>
      {/* 标题 + 统一管理按钮 */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
        <h2 style={{ margin: 0 }}>记一笔</h2>
        <button
          type="button"
          onClick={() => { setMgrTab('category'); setShowMgr(true); }}
          style={btnLite}
        >
          管理
        </button>
      </div>

      {/* 收/支 */}
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

      {/* 大类/小类（录入用） */}
      <div style={{ marginBottom: 12 }}>
        <label>大类：</label>
        <div style={{ display:'flex', gap:8 }}>
          <select value={rootId} onChange={e=>onChangeRoot(e.target.value)} style={{ flex:1, padding:8 }}>
            {roots.length === 0
              ? <option value="" disabled>空</option>
              : roots.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>小类：</label>
        <div style={{ display:'flex', gap:8 }}>
          <select value={childId} onChange={e=>setChildId(e.target.value)} style={{ flex:1, padding:8 }}>
            {children.length === 0
              ? <option value="" disabled>空</option>
              : children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* 金额 */}
      <div style={{ margin:'12px 0' }}>
        <label>金额：</label>
        <input inputMode="decimal" placeholder="0.00"
          value={amount} onChange={e=>setAmount(e.target.value)}
          style={{ width:'100%', padding:10, borderRadius:8, border:'1px solid #ddd' }} />
        <div style={{ fontSize:12, color:'#888', marginTop:4 }}>币种：{currency}</div>
      </div>

      {/* 账户 */}
      <div style={{ marginBottom: 8 }}>
        <label>支付/收入方式（账户）：</label>
        <select value={accountId} onChange={e=>setAccountId(e.target.value)} style={{ width:'100%', padding:8 }}>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {/* 备注（可选） */}
      <div style={{ margin:'12px 0' }}>
        <label>备注（可选）：</label>
        <input placeholder="这笔没有备注可留空"
          value={note} onChange={e=>setNote(e.target.value)}
          style={{ width:'100%', padding:10, borderRadius:8, border:'1px solid #ddd' }} />
      </div>

      <button onClick={onSubmit}
        style={{ width:'100%', padding:12, borderRadius:10, background:'#0d6efd', color:'#fff' }}>
        保存
      </button>

      {showMgr && (
        <ManageModal
          kind={kind}
          currentRootId={rootId}
          initialTab={mgrTab}
          onClose={async (changed) => {
            setShowMgr(false);
            if (changed) {
              await reloadRoots(kind);                 // 分类变化刷新
              const accts = await db.accounts.toArray(); // 账户变化刷新
              setAccounts(accts);
              if (!accts.find(a => a.id === accountId)) {
                setAccountId(accts[0]?.id || '');
              }
            }
          }}
        />
      )}
    </div>
  );
}

const btnLite: React.CSSProperties = {
  padding:'8px 10px', border:'1px solid #ddd', borderRadius:8, background:'#fff'
};

/* ===================== 统一管理弹窗 ===================== */
function ManageModal({
  kind, currentRootId, initialTab='category', onClose
}: {
  kind: Kind; currentRootId?: string; initialTab?: 'category'|'account';
  onClose: (changed:boolean)=>void;
}) {
  const [tab, setTab] = useState<'category'|'account'>(initialTab);
  const [changed, setChanged] = useState(false);

  return (
    <div style={overlay}>
      <div style={card}>
        {/* 顶部：页签 + 完成 */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
          <div style={{display:'flex', gap:6}}>
            <button
              type="button"
              onClick={()=>setTab('category')}
              style={{...btnLite, background: tab==='category'?'#eef4ff':'#fff'}}
            >分类</button>
            <button
              type="button"
              onClick={()=>setTab('account')}
              style={{...btnLite, background: tab==='account'?'#eef4ff':'#fff'}}
            >账户</button>
          </div>
          <button type="button" onClick={()=>onClose(changed)} style={btnLite}>完成</button>
        </div>

        {tab === 'category' ? (
          <CategoryPanel
            kind={kind}
            currentRootId={currentRootId}
            onChanged={()=>setChanged(true)}
          />
        ) : (
          <AccountPanel onChanged={()=>setChanged(true)} />
        )}
      </div>
    </div>
  );
}

/* ---------- 分类面板（新增 / 删除 / 重命名） ---------- */
function CategoryPanel({
  kind, currentRootId, onChanged
}: { kind: Kind; currentRootId?: string; onChanged: ()=>void }) {
  const [roots, setRoots] = useState<Category[]>([]);
  const [rootId, setRootId] = useState<string>(currentRootId || '');

  const [children, setChildren] = useState<Category[]>([]);
  const [selChildId, setSelChildId] = useState<string>(''); // ✅ 下拉选择的小类

  const [newRoot, setNewRoot] = useState('');
  const [newChild, setNewChild] = useState('');

  // 重命名：大类
  const [editingRoot, setEditingRoot] = useState(false);
  const [rootEditName, setRootEditName] = useState('');

  // 重命名：小类（针对下拉选中的那一个）
  const [editingChild, setEditingChild] = useState(false);
  const [childEditName, setChildEditName] = useState('');

  useEffect(() => { (async () => {
    const r = await listRootCategories(kind);
    setRoots(r);
    const rid = currentRootId && r.some(x=>x.id===currentRootId) ? currentRootId : (r[0]?.id || '');
    setRootId(rid);
    setRootEditName(r.find(x => x.id === rid)?.name || '');
    const cs = rid ? await listChildren(rid) : [];
    setChildren(cs);
    setSelChildId(cs[0]?.id || '');
  })(); }, [kind]); // eslint-disable-line

  async function refresh(root: string) {
    const r = await listRootCategories(kind);
    setRoots(r);
    setRootId(root);
    setRootEditName(r.find(x => x.id === root)?.name || '');
    const cs = root ? await listChildren(root) : [];
    setChildren(cs);
    setSelChildId(cs[0]?.id || '');
    setEditingRoot(false);
    setEditingChild(false);
  }

  /* ===== 大类：新增 / 重命名 / 删除 ===== */
  async function createRoot() {
    const name = newRoot.trim();
    if (!name) return;
    await addCategory({ kind, name, parentId: null });
    setNewRoot('');
    onChanged();
    const r = await listRootCategories(kind);
    const rid = r.find(x=>x.name===name)?.id || r[0]?.id || '';
    await refresh(rid);
  }
  function startEditRoot() { if (!rootId) return; setEditingRoot(true); setRootEditName(roots.find(r=>r.id===rootId)?.name || ''); }
  function cancelEditRoot() { setEditingRoot(false); }
  async function saveEditRoot() {
    const name = rootEditName.trim();
    if (!name) { alert('名称不能为空'); return; }
    await renameCategory(rootId, name);
    setEditingRoot(false);
    onChanged();
    await refresh(rootId);
  }
  async function removeRoot(id: string) {
    const cat = await getCategory(id);
    if (!cat) return;
    if (!confirm(`确认删除大类「${cat.name}」？\n有引用或有子类将无法删除。`)) return;
    try {
      await deleteCategory(id);
      onChanged();
      const rid = (await listRootCategories(kind)).find(x => x.id !== id)?.id || '';
      await refresh(rid);
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败');
    }
  }

  /* ===== 小类：新增 / 重命名 / 删除（下拉式） ===== */
  async function createChild() {
    if (!rootId) { alert('请先选择一个大类'); return; }
    const name = newChild.trim();
    if (!name) return;
    await addCategory({ kind, name, parentId: rootId });
    setNewChild('');
    onChanged();
    // 选中新建的小类
    const cs = await listChildren(rootId);
    setChildren(cs);
    const created = cs.find(x => x.name === name);
    setSelChildId(created?.id || cs[0]?.id || '');
  }
  function startEditChild() {
    if (!selChildId) return;
    const cur = children.find(c => c.id === selChildId);
    setChildEditName(cur?.name || '');
    setEditingChild(true);
  }
  function cancelEditChild() { setEditingChild(false); }
  async function saveEditChild() {
    if (!selChildId) return;
    const name = childEditName.trim();
    if (!name) { alert('名称不能为空'); return; }
    await renameCategory(selChildId, name);
    setEditingChild(false);
    onChanged();
    await refresh(rootId);
  }
  async function removeChild() {
    if (!selChildId) return;
    const cat = await getCategory(selChildId);
    if (!cat) return;
    if (!confirm(`确认删除小类「${cat.name}」？\n如被流水引用将无法删除。`)) return;
    try {
      await deleteCategory(selChildId);
      onChanged();
      await refresh(rootId);
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败');
    }
  }

  return (
    <div>
      {/* 大类 */}
      <div style={{marginBottom:12}}>
        <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <select value={rootId} onChange={e=>refresh(e.target.value)} style={{flex:1, padding:8}}>
            {roots.length === 0
              ? <option value="" disabled>空</option>
              : roots.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          {roots.length > 0 && !editingRoot && (
            <>
              <button type="button" onClick={startEditRoot} style={btnLite}>重命名</button>
              <button type="button" onClick={()=>removeRoot(rootId)} style={{...btnLite, color:'#d00'}}>删除</button>
            </>
          )}

          {editingRoot && (
            <div style={{display:'flex', gap:8, width:'100%'}}>
              <input
                value={rootEditName}
                onChange={e=>setRootEditName(e.target.value)}
                style={{flex:1, padding:8}}
                placeholder="输入新的大类名称"
              />
              <button type="button" onClick={saveEditRoot} style={btnLite}>保存</button>
              <button type="button" onClick={cancelEditRoot} style={btnLite}>取消</button>
            </div>
          )}
        </div>

        <div style={{display:'flex', gap:8, marginTop:6}}>
          <input value={newRoot} onChange={e=>setNewRoot(e.target.value)}
                 placeholder="新增大类（如：饮食）" style={{flex:1, padding:8}} />
          <button type="button" onClick={createRoot} style={btnLite}>＋</button>
        </div>
      </div>

      {/* 小类（下拉式） */}
      <div>
        <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:6}}>
          <strong>小类</strong>
        </div>

        <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <select
            value={selChildId}
            onChange={e=>{ setSelChildId(e.target.value); setEditingChild(false); }}
            style={{flex:1, padding:8}}
            disabled={children.length === 0}
          >
            {children.length === 0
              ? <option value="" disabled>空</option>
              : children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
            }
          </select>

          {children.length > 0 && !editingChild && (
            <>
              <button type="button" onClick={startEditChild} style={btnLite}>重命名</button>
              <button type="button" onClick={removeChild} style={{...btnLite, color:'#d00'}}>删除</button>
            </>
          )}

          {editingChild && (
            <div style={{display:'flex', gap:8, width:'100%'}}>
              <input
                value={childEditName}
                onChange={e=>setChildEditName(e.target.value)}
                style={{flex:1, padding:8}}
                placeholder="输入新的小类名称"
              />
              <button type="button" onClick={saveEditChild} style={btnLite}>保存</button>
              <button type="button" onClick={cancelEditChild} style={btnLite}>取消</button>
            </div>
          )}
        </div>

        <div style={{display:'flex', gap:8, marginTop:6}}>
          <input value={newChild} onChange={e=>setNewChild(e.target.value)}
                 placeholder="新增小类（如：早餐）" style={{flex:1, padding:8}} />
          <button type="button" onClick={createChild} style={btnLite}>＋</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 账户面板（新增 / 重命名 / 删除） ---------- */
function AccountPanel({ onChanged }: { onChanged: ()=>void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<string>(''); // 正在编辑的账户ID
  const [editName, setEditName] = useState('');

  useEffect(() => { (async () => {
    const accts = await db.accounts.toArray();
    setAccounts(accts);
  })(); }, []);

  async function refresh() {
    const accts = await db.accounts.toArray();
    setAccounts(accts);
  }

  async function create() {
    const name = newName.trim();
    if (!name) return;
    await addAccountQuick(name);
    setNewName('');
    onChanged();
    await refresh();
  }

  function startEdit(a: Account) {
    setEditing(a.id);
    setEditName(a.name);
  }
  function cancelEdit() {
    setEditing('');
  }
  async function saveEdit() {
    if (!editing) return;
    const name = editName.trim();
    if (!name) { alert('名称不能为空'); return; }
    await renameAccount(editing, name);
    setEditing('');
    onChanged();
    await refresh();
  }

  async function remove(id: string, name: string) {
    if (!confirm(`确认删除账户「${name}」？\n如被流水引用将无法删除。`)) return;
    try {
      await deleteAccount(id);
      onChanged();
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败');
    }
  }

  return (
    <div>
      <div style={{display:'flex', gap:8, marginBottom:6}}>
        <input
          value={newName}
          onChange={e=>setNewName(e.target.value)}
          placeholder="新增账户（如：微信/支付宝）"
          style={{flex:1, padding:8}}
        />
        <button type="button" onClick={create} style={btnLite}>＋</button>
      </div>

      <div style={{maxHeight:300, overflowY:'auto', border:'1px solid #eee', borderRadius:8}}>
        {accounts.length === 0 && <div style={{padding:12, color:'#888'}}>暂无账户</div>}
        {accounts.map(a => (
          <div key={a.id} style={{padding:'8px 12px', borderBottom:'1px solid #f1f1f1'}}>
            {editing === a.id ? (
              <div style={{display:'flex', gap:8}}>
                <input value={editName} onChange={e=>setEditName(e.target.value)} style={{flex:1, padding:8}} />
                <button type="button" onClick={saveEdit} style={btnLite}>保存</button>
                <button type="button" onClick={cancelEdit} style={btnLite}>取消</button>
              </div>
            ) : (
              <div style={{display:'flex', alignItems:'center', gap:8}}>
                <span style={{flex:1}}>{a.name}</span>
                <button type="button" onClick={()=>startEdit(a)} style={btnLite}>重命名</button>
                <button type="button" onClick={()=>remove(a.id, a.name)} style={{...btnLite, color:'#d00'}}>删除</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* 弹窗样式 */
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
