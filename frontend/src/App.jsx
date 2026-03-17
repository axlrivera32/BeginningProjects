import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import AuthScreen      from "./components/AuthScreen";
import AppShell        from "./components/AppShell";
import Dashboard       from "./components/Dashboard";
import Trading         from "./components/Trading";
import LiquidityPools  from "./components/LiquidityPools";
import BotControls     from "./components/BotControls";
import PaperTrading    from "./components/PaperTrading";
import Settings        from "./components/Settings";
import PoolBotDashboard from "./components/PoolBotDashboard";
import Toast           from "./components/Toast";
import "./styles/global.css";

function Require({ children }) {
  const session = useAuth(s => s.session);
  return session ? children : <Navigate to="/auth" replace />;
}
function Public({ children }) {
  const session = useAuth(s => s.session);
  return session ? <Navigate to="/" replace /> : children;
}

export default function App() {
  const init = useAuth(s => s.init);
  useEffect(() => { init(); }, [init]);
  return (
    <>
      <Toast />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Public><AuthScreen /></Public>} />
          <Route path="/" element={<Require><AppShell /></Require>}>
            <Route index             element={<Dashboard />} />
            <Route path="trading"    element={<Trading />} />
            <Route path="pools"      element={<LiquidityPools />} />
            <Route path="bot"        element={<BotControls />} />
            <Route path="botdash"    element={<PoolBotDashboard />} />
            <Route path="paper"      element={<PaperTrading />} />
            <Route path="settings"   element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}
