export function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <div className="page-head">
        <h1>{title}</h1>
      </div>
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          Segera hadir.
        </p>
      </div>
    </>
  );
}
