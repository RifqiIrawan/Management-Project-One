import type { ReactNode } from 'react';

interface Props {
  icon: string;
  title: string;
  text?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon, title, text, action }: Props) {
  return (
    <div className="text-center py-5 px-3">
      <i className={`bi ${icon} display-4 text-secondary`} aria-hidden="true" />
      <h2 className="h5 mt-3">{title}</h2>
      {text && <p className="text-secondary mb-3">{text}</p>}
      {action}
    </div>
  );
}
