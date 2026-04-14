import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { subscribeToTerminalOutput } from "../ws/store";
import "@xterm/xterm/css/xterm.css";

interface ConsoleViewerProps {
  isExpanded: boolean;
}

export function ConsoleViewer({ isExpanded }: ConsoleViewerProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!terminalRef.current || terminalInstance.current) return;

    const term = new Terminal({
      theme: {
        background: "#1c1c1c",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
        cursorAccent: "#1c1c1c",
        selectionBackground: "#3a3d41",
        black: "#000000",
        red: "#cd3131",
        green: "#0dbc79",
        yellow: "#e5e510",
        blue: "#2472c8",
        magenta: "#bc3fbc",
        cyan: "#11a8cd",
        white: "#e5e5e5",
        brightBlack: "#666666",
        brightRed: "#f14c4c",
        brightGreen: "#23d18b",
        brightYellow: "#f5f543",
        brightBlue: "#3b8eea",
        brightMagenta: "#d670d6",
        brightCyan: "#29b8db",
        brightWhite: "#e5e5e5",
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: "bar",
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(terminalRef.current);
    fit.fit();

    terminalInstance.current = term;
    fitAddon.current = fit;
    setIsReady(true);

    const handleResize = () => {
      fitAddon.current?.fit();
    };

    window.addEventListener("resize", handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(terminalRef.current);

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      term.dispose();
      terminalInstance.current = null;
      fitAddon.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isReady || !terminalInstance.current) return;

    const term = terminalInstance.current;

    const handleTerminalData = (data: string) => {
      term.write(data);
    };

    const unsubscribe = subscribeToTerminalOutput(handleTerminalData);

    return () => {
      unsubscribe();
    };
  }, [isReady]);

  useEffect(() => {
    if (isExpanded && fitAddon.current) {
      setTimeout(() => {
        fitAddon.current?.fit();
      }, 100);
    }
  }, [isExpanded]);

  if (!isExpanded) return null;

  return (
    <div className="flex flex-col rounded-xl shadow-md overflow-hidden bg-[#1c1c1c]">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-[#2d2d2d] border-b border-[#3d3d3d]">
        <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
        <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
        <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
        <span className="ml-2 text-xs text-gray-400 font-medium">Terminal</span>
      </div>
      <div ref={terminalRef} className="flex-1 min-h-[200px] p-2" />
    </div>
  );
}
