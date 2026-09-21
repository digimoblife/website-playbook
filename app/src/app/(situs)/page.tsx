import { requireUser } from "@/lib/dal";
import { ROLE_LABEL } from "@/lib/labels";

export default async function BerandaPage() {
  const user = await requireUser();
  return (
    <section className="card">
      <h1>Halo, {user.name}.</h1>
      <p style={{ margin: 0 }}>
        <span className="badge badge-role">{ROLE_LABEL[user.role]}</span>
      </p>
    </section>
  );
}
