import { NavLink } from "react-router-dom";

export default function TabBar() {
  return (
    <nav className="tabbar">
      <NavLink to="/add" className={({isActive}) => isActive ? "tab active" : "tab"}>
        记一笔
      </NavLink>
      <NavLink to="/bills" className={({isActive}) => isActive ? "tab active" : "tab"}>
        账单
      </NavLink>
      <NavLink to="/insights" className={({isActive}) => isActive ? "tab active" : "tab"}>
        统计
      </NavLink>
    </nav>
  );
}
