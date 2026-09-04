import React from "react";
import { R3FSpikeCanvas } from "../canvas/R3FSpikeCanvas";
import { Link } from "wouter";
import { ArrowLeft, FileText } from "lucide-react";

export function R3FSpikePage() {
  return (
    <div className="w-screen h-screen flex flex-col bg-[#090a0c] overflow-hidden select-none">
      <div className="h-10 px-4 bg-[#121418] border-b border-[#21252d] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Editor
          </Link>
          <div className="h-4 w-px bg-[#262a33]" />
          <span className="text-xs font-semibold text-slate-200">
            R3F Feasibility Check Spike Route
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/src/canvas/r3f-spike-feasibility-note.md"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-[11px] text-cyan-400 hover:underline"
          >
            <FileText className="w-3 h-3" />
            View Feasibility Note
          </a>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <R3FSpikeCanvas />
      </div>
    </div>
  );
}
