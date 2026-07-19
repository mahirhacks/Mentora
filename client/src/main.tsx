import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { BoardProvider } from "./board/BoardContext";
import { AppShell } from "./components/layout/AppShell";
import { HomePage } from "./pages/HomePage";
import { LessonsPage } from "./pages/LessonsPage";
import { LiveLessonPage } from "./pages/LiveLessonPage";
import { SummaryPage } from "./pages/SummaryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StatsPage } from "./pages/StatsPage";
import { applyTheme, usePrefsStore } from "./state/prefsStore";
import "./styles.css";

applyTheme(usePrefsStore.getState().darkMode);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BoardProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/lessons" element={<LessonsPage />} />
            <Route path="/lesson" element={<LiveLessonPage />} />
            <Route path="/summary" element={<SummaryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </BoardProvider>
  </StrictMode>,
);
