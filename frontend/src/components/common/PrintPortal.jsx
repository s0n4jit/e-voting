import { createPortal } from 'react-dom';

/** Renders its children into #print-root, the only thing that is printed (see index.css). */
export default function PrintPortal({ children }) {
  const el = document.getElementById('print-root');
  return el ? createPortal(children, el) : null;
}
