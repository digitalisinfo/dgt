export default function AuroraBg() {
  return (
    <>
      <div className="fixed inset-0 pointer-events-none -z-10 aurora-gradient" />
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="qa-blob qa-blob-a" />
        <div className="qa-blob qa-blob-b" />
        <div className="qa-blob qa-blob-c" />
      </div>
      <div className="fixed inset-0 pointer-events-none -z-10 aurora-grid" />
    </>
  );
}
