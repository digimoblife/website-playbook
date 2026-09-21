import type { Status } from "@/lib/domain";
import { STATUS_LABEL } from "@/lib/labels";

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}
