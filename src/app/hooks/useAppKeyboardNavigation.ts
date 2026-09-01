import { useEffect, useRef } from "react";
import type { AppView } from "@/app/shell/types";
import { isTextEditableTarget } from "@/shared/lib/domUtils";

export function useAppKeyboardNavigation(
  currentView: AppView,
  setCurrentView: (view: AppView) => void,
) {
  const currentViewRef = useRef(currentView);

  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "," && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCurrentView("settings");
        return;
      }

      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      if (document.body.style.overflow === "hidden") {
        return;
      }

      const view = currentViewRef.current;
      if (view === "providers" || isTextEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setCurrentView(view === "skillsDiscovery" ? "skills" : "providers");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setCurrentView]);
}
