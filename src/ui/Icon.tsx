// Stroke icons on a 24 grid, drawn to match the element line-art.
const P: Record<string, string> = {
  select: 'M5 3l13 6.5-5.6 1.7L10 17z',
  pen: 'M4 20c3-1 4-3 6-6s5-7 7-8c1.5-.7 2.8.6 2.1 2.1-1 2-5 5-8 7s-5 3-6 6',
  arrow: 'M5 19L19 5M10 5h9v9',
  dimension: 'M3 12h18M3 8v8M21 8v8M7 12l-2-2M7 12l-2 2M17 12l2-2M17 12l2 2',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  eraser: 'M8 20h12M5.5 14.5l7-7a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L11 19H8.5z',
  lasso: 'M6 7c0-2 3-3.5 6-3.5S18 5 18 7.5 15 12 12 12 6 10 6 7zM9 11.4c-.6 1.6-.2 3 1 4M10 15.4a2 2 0 11-2 3.4',
  flip: 'M12 3v18M8 7L3 12l5 5zM16 7l5 5-5 5z',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  compare: 'M12 3v18M4 5h5v14H4zM15 5h5v14h-5',
  export: 'M12 15V3M7 8l5-5 5 5M5 14v6h14v-6',
  mic: 'M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3zM5 11a7 7 0 0014 0M12 18v3',
  stop: 'M7 7h10v10H7z',
  send: 'M5 12h13M13 6l6 6-6 6',
  book: 'M5 4h9a4 4 0 014 4v12H9a4 4 0 01-4-4zM5 16a4 4 0 014-4h9',
  close: 'M6 6l12 12M18 6L6 18',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1.5 1.5 0 100-.01',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  chat: 'M4 5h16v11H9l-5 4z',
  globe: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  chevron: 'M6 9l6 6 6-6',
  check: 'M5 12l5 5 9-10',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  menu: 'M4 7h16M4 12h16M4 17h16',
};

export function Icon({ name, size = 20, title }: { name: keyof typeof P | string; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={P[name] ?? ''} />
    </svg>
  );
}
