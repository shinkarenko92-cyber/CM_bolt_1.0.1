/// <reference types="vite/client" />

declare module 'react-markdown' {
  import type { ComponentType } from 'react';
  type ReactMarkdownProps = { children?: string };
  const ReactMarkdown: ComponentType<ReactMarkdownProps>;
  export default ReactMarkdown;
}
