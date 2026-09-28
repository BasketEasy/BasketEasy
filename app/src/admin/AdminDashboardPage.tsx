import { AdminPageHeader } from './shared/AdminLayout';
import { AdminStatsPanel } from './stats/AdminStatsPanel';

/** `/admin`: the platform-wide dashboard. Each club page carries the same panel, scoped. */
export function AdminDashboardPage() {
  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader title="Tableau de bord" />
      <AdminStatsPanel />
    </div>
  );
}
