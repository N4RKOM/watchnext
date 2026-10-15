type PlaceholderProps = {
  title: string;
  introduction: string;
  heading: string;
  description: string;
};

export function Placeholder({ title, introduction, heading, description }: PlaceholderProps) {
  return (
    <div className="page-content">
      <div className="page-heading">
        <p className="eyebrow">Good company. Great watching.</p>
        <h1>{title}</h1>
        <p className="page-introduction">{introduction}</p>
      </div>
      <section className="placeholder" aria-labelledby="placeholder-heading">
        <div className="placeholder-symbol" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="32" height="32" fill="none">
            <rect x="5" y="7" width="22" height="19" rx="3" stroke="currentColor" strokeWidth="1.75" />
            <path d="M5 13h22M11 7v6M21 7v6M14 18l5 3-5 3v-6Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
          </svg>
        </div>
        <span className="status-label">Not available yet</span>
        <h2 id="placeholder-heading">{heading}</h2>
        <p>{description}</p>
      </section>
    </div>
  );
}
