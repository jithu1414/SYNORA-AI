import { useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import type { Extension } from "@codemirror/state";

type CodeEditorProps = {
  value: string;
  language: string;
  darkMode: boolean;
  onChange: (value: string) => void;
};

async function languageExtension(language: string): Promise<Extension[]> {
  switch (language) {
    case "Python": return [(await import("@codemirror/lang-python")).python()];
    case "JavaScript": return [(await import("@codemirror/lang-javascript")).javascript()];
    case "TypeScript": return [(await import("@codemirror/lang-javascript")).javascript({ typescript: true })];
    case "Java": return [(await import("@codemirror/lang-java")).java()];
    case "C++": return [(await import("@codemirror/lang-cpp")).cpp()];
    case "Go": return [(await import("@codemirror/lang-go")).go()];
    case "Rust": return [(await import("@codemirror/lang-rust")).rust()];
    case "PHP": return [(await import("@codemirror/lang-php")).php()];
    case "SQL": return [(await import("@codemirror/lang-sql")).sql()];
    case "HTML/CSS": return [(await import("@codemirror/lang-html")).html()];
    default: return [];
  }
}

export default function CodeEditor({ value, language, darkMode, onChange }: CodeEditorProps) {
  const [loadedLanguage, setLoadedLanguage] = useState<{ language: string; extensions: Extension[] } | null>(null);
  const [languageIssue, setLanguageIssue] = useState<{ language: string; message: string } | null>(null);

  useEffect(() => {
    let active = true;
    void languageExtension(language)
      .then((loadedExtensions) => {
        if (active) {
          setLoadedLanguage({ language, extensions: loadedExtensions });
          setLanguageIssue(null);
        }
      })
      .catch(() => {
        if (active) {
          setLanguageIssue({ language, message: `Syntax highlighting for ${language} could not be loaded.` });
        }
      });
    return () => {
      active = false;
    };
  }, [language]);

  const extensions = loadedLanguage?.language === language ? loadedLanguage.extensions : [];
  const languageError = languageIssue?.language === language ? languageIssue.message : "";

  return (
    <>
      {languageError && <p className="inline-error" role="alert">{languageError}</p>}
      <CodeMirror
        className="code-editor"
        value={value}
        height="250px"
        extensions={extensions}
        theme={darkMode ? oneDark : undefined}
        placeholder="Paste code or an error message here…"
        onChange={onChange}
        basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }}
      />
    </>
  );
}
