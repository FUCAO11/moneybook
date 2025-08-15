// src/App.tsx
import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import TabBar from "./components/TabBar";

// 懒加载三页
const AddPage = lazy(() => import("./pages/AddPage"));
const BillsPage = lazy(() => import("./pages/BillsPage"));
const InsightsPage = lazy(() => import("./pages/InsightsPage"));

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        {/* 只让这里滚动 */}
        <div className="app-scroll">
          {/* 包一层 page，便于全局样式把“每页第一行”做吸顶 */}
          <main className="page">
            <Suspense fallback={<div style={{ padding: 16 }}>加载中…</div>}>
              <Routes>
                <Route path="/" element={<Navigate to="/add" replace />} />
                <Route path="/add" element={<AddPage />} />
                <Route path="/bills" element={<BillsPage />} />
                <Route path="/insights" element={<InsightsPage />} />
                {/* 兜底到 /add */}
                <Route path="*" element={<Navigate to="/add" replace />} />
              </Routes>
            </Suspense>
          </main>
        </div>

        {/* TabBar 放在滚动容器外部 → 永远贴底不随内容滚动 */}
        <TabBar />
      </div>
    </BrowserRouter>
  );
}
