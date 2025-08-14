import { useEffect, useState } from 'react';
// 运行时需要的“值”
import { db, addTxn, monthKey } from './db';
// 仅类型（不会被打进 bundle）
import type { Txn, Kind } from './db';

import { Container, Navbar, Row, Col, Form, Button, ListGroup } from 'react-bootstrap';

const toCents = (s:string) => Math.round((parseFloat(s || '0')) * 100);
const fmt = (cents:number, currency='CNY') =>
  (cents/100).toLocaleString(undefined, { style:'currency', currency });

export default function App() {
  const [kind, setKind] = useState<Kind>('expense');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [monthTotal, setMonthTotal] = useState({ expense:0, income:0 });
  const [list, setList] = useState<Txn[]>([]);

  async function refresh() {
    const m = monthKey(Date.now());
    const rows = await db.txns.where('month').equals(m).toArray();
    // 按时间倒序
    rows.sort((a,b) => b.ts - a.ts);
    const expense = rows.filter(r=>r.kind==='expense').reduce((s,r)=>s+r.amountCents,0);
    const income  = rows.filter(r=>r.kind==='income').reduce((s,r)=>s+r.amountCents,0);
    setMonthTotal({ expense, income });
    setList(rows);
  }

  useEffect(()=>{ refresh(); }, []);

  async function onSubmit(e:React.FormEvent){
    e.preventDefault();
    if(!amount) return;
    await addTxn({
      ts: Date.now(),
      kind,
      amountCents: toCents(amount),
      note: note.trim() || undefined
    });
    setAmount(''); setNote('');
    await refresh();
  }

  async function onExport(){
    const all = await db.txns.toArray();
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `moneybook-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onClearAll(){
    if(confirm('清空本地所有交易记录？此操作不可恢复。')){
      await db.txns.clear();
      await refresh();
    }
  }

  return (
    <>
      <Navbar bg="light" className="mb-3">
        <Container>
          <Navbar.Brand>MoneyBook</Navbar.Brand>
          <div className="ms-auto d-flex gap-2">
            <Button size="sm" variant="outline-secondary" onClick={onExport}>导出</Button>
            <Button size="sm" variant="outline-danger" onClick={onClearAll}>清空</Button>
          </div>
        </Container>
      </Navbar>

      <Container>
        <div className="p-3 border rounded mb-3">
          <div>本月支出：<strong>{fmt(monthTotal.expense)}</strong></div>
          <div>本月收入：<strong>{fmt(monthTotal.income)}</strong></div>
        </div>

        <Form onSubmit={onSubmit} className="p-3 border rounded mb-3">
          <Row className="g-2">
            <Col xs={5}>
              <Form.Select value={kind} onChange={e=>setKind(e.target.value as Kind)}>
                <option value="expense">支出</option>
                <option value="income">收入</option>
              </Form.Select>
            </Col>
            <Col xs={7}>
              <Form.Control inputMode="decimal" placeholder="金额（元）"
                value={amount} onChange={e=>setAmount(e.target.value)} />
            </Col>
          </Row>
          <Form.Control className="mt-2" placeholder="备注（可选）"
            value={note} onChange={e=>setNote(e.target.value)} />
          <Button type="submit" className="mt-3" disabled={!amount}>保存</Button>
        </Form>

        <ListGroup className="mb-5">
          {list.map(item => (
            <ListGroup.Item key={item.id} className="d-flex justify-content-between">
              <div>
                <div className="fw-semibold">{item.kind==='expense'?'支出':'收入'} · {item.note || '—'}</div>
                <small className="text-muted">
                  {new Date(item.ts).toLocaleString()}
                </small>
              </div>
              <div className={item.kind==='expense'?'text-danger':'text-success'}>
                {item.kind==='expense' ? '-' : '+'}{fmt(item.amountCents)}
              </div>
            </ListGroup.Item>
          ))}
          {list.length===0 && <div className="text-center text-muted p-3">本月暂无记录</div>}
        </ListGroup>
      </Container>
    </>
  );
}
