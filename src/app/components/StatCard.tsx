import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: "primary" | "warning" | "danger" | "success";
  footer?: ReactNode;
}

const colorConfig = {
  primary: "bg-primary/10 text-primary",
  warning: "bg-status-in-progress-bg text-status-in-progress",
  danger: "bg-status-pending-bg text-status-pending",
  success: "bg-status-completed-bg text-status-completed",
};

export default function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  color = "primary",
  footer,
}: StatCardProps) {
  return (
    <div className="bg-card rounded-lg border border-border p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-1">{title}</p>
          <p className="text-3xl font-semibold text-foreground mb-2">{value}</p>
          {trend && (
            <p
              className={`text-sm font-medium ${
                trend.isPositive ? "text-status-completed" : "text-status-pending"
              }`}
            >
              {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
            </p>
          )}
          {footer && <div className="mt-3 text-sm text-muted-foreground">{footer}</div>}
        </div>
        <div className={`p-3 rounded-lg ${colorConfig[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
