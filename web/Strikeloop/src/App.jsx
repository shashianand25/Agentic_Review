import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { AppProvider } from './context/AppContext.jsx'
import ConnectPage from './pages/ConnectPage.jsx'
import AnalysisPage from './pages/AnalysisPage.jsx'
import OverviewPage from './pages/OverviewPage.jsx'
import ServicesPage from './pages/ServicesPage.jsx'
import DiagramPage from './pages/DiagramPage.jsx'
import SecurityPage from './pages/SecurityPage.jsx'
import CostPage from './pages/CostPage.jsx'
import PlanPage from './pages/PlanPage.jsx'
import MonitorPage from './pages/MonitorPage.jsx'
import HistoryPage from './pages/HistoryPage.jsx'
import ReportPage from './pages/ReportPage.jsx'
import RiskRegisterPage from './pages/RiskRegisterPage.jsx'
import CompliancePage from './pages/CompliancePage.jsx'

// Legacy redirects — old /architecture/:jobId links → new /overview/:jobId
function LegacyArchRedirect() {
  const { jobId } = useParams()
  return <Navigate to={`/overview/${jobId}`} replace />
}

function LegacyReportRedirect() {
  const { jobId } = useParams()
  return <Navigate to={`/overview/${jobId}`} replace />
}

function LegacyPlanRedirect() {
  const { jobId } = useParams()
  return <Navigate to={`/plan/${jobId}`} replace />
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          {/* Entry */}
          <Route path="/" element={<ConnectPage />} />
          <Route path="/run/:jobId" element={<AnalysisPage />} />

          {/* Main pages */}
          <Route path="/overview/:jobId" element={<OverviewPage />} />
          <Route path="/services/:jobId" element={<ServicesPage />} />
          <Route path="/diagram/:jobId"  element={<DiagramPage />} />
          <Route path="/security/:jobId" element={<SecurityPage />} />
          <Route path="/risks/:jobId"    element={<RiskRegisterPage />} />
          <Route path="/compliance/:jobId" element={<CompliancePage />} />
          <Route path="/cost/:jobId"     element={<CostPage />} />
          <Route path="/plan/:jobId"     element={<PlanPage />} />
          <Route path="/monitor"         element={<MonitorPage />} />
          <Route path="/history"         element={<HistoryPage />} />

          {/* Legacy routes */}
          <Route path="/architecture/:jobId" element={<LegacyArchRedirect />} />
          <Route path="/report/:jobId"       element={<LegacyReportRedirect />} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}
