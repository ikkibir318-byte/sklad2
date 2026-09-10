import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { isAuthenticated, isWorker } from "@/routes/auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    if (typeof window !== "undefined") {
      if (!isAuthenticated()) {
        throw redirect({ to: "/auth" });
      }
      // Ограничение для рабочего: доступ разрешён исключительно к складу (/inventory и /inventory/:id)
      if (isWorker()) {
        const path = location.pathname;
        const isInventoryView =
          path === "/inventory" ||
          path === "/inventory/" ||
          (path.startsWith("/inventory/") && path !== "/inventory/new");

        if (!isInventoryView) {
          throw redirect({ to: "/inventory" });
        }
      }
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
