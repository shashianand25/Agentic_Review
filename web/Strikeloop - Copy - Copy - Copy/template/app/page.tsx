"use client";

import { useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { OverviewSection } from "@/components/dashboard/sections/overview";
import { PipelineSection } from "@/components/dashboard/sections/pipeline";
import { DealsSection } from "@/components/dashboard/sections/deals";
import { CustomersSection } from "@/components/dashboard/sections/customers";
import { TeamSection } from "@/components/dashboard/sections/team";
import { ForecastingSection } from "@/components/dashboard/sections/forecasting";
import { ReportsSection } from "@/components/dashboard/sections/reports";
import { SettingsSection } from "@/components/dashboard/sections/settings";

export type Section = "overview" | "pipeline" | "deals" | "customers" | "team" | "forecasting" | "reports" | "settings";

export default function Dashboard() {
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const renderSection = () => {
    switch (activeSection) {
      case "overview":
        return <OverviewSection />;
      case "pipeline":
        return <PipelineSection />;
      case "deals":
        return <DealsSection />;
      case "customers":
        return <CustomersSection />;
      case "team":
        return <TeamSection />;
      case "forecasting":
        import { redirect } from "next/navigation"

        export default function Home() {
          redirect("/connect")
        }
      default:
