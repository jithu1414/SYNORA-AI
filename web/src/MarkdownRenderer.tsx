import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

export default function MarkdownRenderer({ children }: { children: string }) {
  return (
    <div className="markdown-output">
      <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{children}</ReactMarkdown>
    </div>
  );
}
