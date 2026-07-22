import { ESC } from './codes.js';

export const themes = {
  dark: {
    name: 'dark',
    border: `${ESC}38;5;238m`,
    title: `${ESC}38;5;81m`,
    subtle: `${ESC}38;5;245m`,
    text: `${ESC}38;5;252m`,
    muted: `${ESC}38;5;244m`,
    user: `${ESC}38;5;111m`,
    assistant: `${ESC}38;5;120m`,
    system: `${ESC}38;5;215m`,
    error: `${ESC}38;5;203m`,
    ok: `${ESC}38;5;114m`,
    accent: `${ESC}38;5;141m`,
    input: `${ESC}38;5;255m`,
    suggestion: `${ESC}38;5;250m`,
    selected: `${ESC}48;5;238m${ESC}38;5;255m`,
  },
  mono: {
    name: 'mono',
    border: `${ESC}2m`,
    title: `${ESC}1m`,
    subtle: `${ESC}2m`,
    text: '',
    muted: `${ESC}2m`,
    user: `${ESC}1m`,
    assistant: '',
    system: `${ESC}2m`,
    error: `${ESC}1m`,
    ok: `${ESC}1m`,
    accent: `${ESC}4m`,
    input: '',
    suggestion: '',
    selected: `${ESC}7m`,
  },
  amber: {
    name: 'amber',
    border: `${ESC}38;5;94m`,
    title: `${ESC}38;5;214m`,
    subtle: `${ESC}38;5;137m`,
    text: `${ESC}38;5;223m`,
    muted: `${ESC}38;5;180m`,
    user: `${ESC}38;5;220m`,
    assistant: `${ESC}38;5;229m`,
    system: `${ESC}38;5;215m`,
    error: `${ESC}38;5;203m`,
    ok: `${ESC}38;5;184m`,
    accent: `${ESC}38;5;208m`,
    input: `${ESC}38;5;230m`,
    suggestion: `${ESC}38;5;222m`,
    selected: `${ESC}48;5;94m${ESC}38;5;230m`,
  },
  ocean: {
    name: 'ocean',
    border: `${ESC}38;5;24m`,
    title: `${ESC}38;5;87m`,
    subtle: `${ESC}38;5;109m`,
    text: `${ESC}38;5;195m`,
    muted: `${ESC}38;5;67m`,
    user: `${ESC}38;5;117m`,
    assistant: `${ESC}38;5;159m`,
    system: `${ESC}38;5;152m`,
    error: `${ESC}38;5;203m`,
    ok: `${ESC}38;5;121m`,
    accent: `${ESC}38;5;45m`,
    input: `${ESC}38;5;231m`,
    suggestion: `${ESC}38;5;153m`,
    selected: `${ESC}48;5;24m${ESC}38;5;231m`,
  },
  forest: {
    name: 'forest',
    border: `${ESC}38;5;22m`,
    title: `${ESC}38;5;149m`,
    subtle: `${ESC}38;5;101m`,
    text: `${ESC}38;5;230m`,
    muted: `${ESC}38;5;108m`,
    user: `${ESC}38;5;150m`,
    assistant: `${ESC}38;5;193m`,
    system: `${ESC}38;5;180m`,
    error: `${ESC}38;5;167m`,
    ok: `${ESC}38;5;114m`,
    accent: `${ESC}38;5;113m`,
    input: `${ESC}38;5;229m`,
    suggestion: `${ESC}38;5;144m`,
    selected: `${ESC}48;5;22m${ESC}38;5;230m`,
  },
  synth: {
    name: 'synth',
    border: `${ESC}38;5;55m`,
    title: `${ESC}38;5;207m`,
    subtle: `${ESC}38;5;105m`,
    text: `${ESC}38;5;225m`,
    muted: `${ESC}38;5;99m`,
    user: `${ESC}38;5;219m`,
    assistant: `${ESC}38;5;123m`,
    system: `${ESC}38;5;213m`,
    error: `${ESC}38;5;203m`,
    ok: `${ESC}38;5;119m`,
    accent: `${ESC}38;5;201m`,
    input: `${ESC}38;5;231m`,
    suggestion: `${ESC}38;5;183m`,
    selected: `${ESC}48;5;55m${ESC}38;5;231m`,
  },
  slate: {
    name: 'slate',
    border: `${ESC}38;5;240m`,
    title: `${ESC}38;5;153m`,
    subtle: `${ESC}38;5;247m`,
    text: `${ESC}38;5;254m`,
    muted: `${ESC}38;5;246m`,
    user: `${ESC}38;5;147m`,
    assistant: `${ESC}38;5;151m`,
    system: `${ESC}38;5;180m`,
    error: `${ESC}38;5;210m`,
    ok: `${ESC}38;5;150m`,
    accent: `${ESC}38;5;110m`,
    input: `${ESC}38;5;255m`,
    suggestion: `${ESC}38;5;250m`,
    selected: `${ESC}48;5;240m${ESC}38;5;255m`,
  },
  paper: {
    name: 'paper',
    border: `${ESC}38;5;250m`,
    title: `${ESC}38;5;236m`,
    subtle: `${ESC}38;5;244m`,
    text: `${ESC}38;5;235m`,
    muted: `${ESC}38;5;246m`,
    user: `${ESC}38;5;25m`,
    assistant: `${ESC}38;5;29m`,
    system: `${ESC}38;5;94m`,
    error: `${ESC}38;5;160m`,
    ok: `${ESC}38;5;28m`,
    accent: `${ESC}38;5;31m`,
    input: `${ESC}38;5;232m`,
    suggestion: `${ESC}38;5;239m`,
    selected: `${ESC}48;5;250m${ESC}38;5;232m`,
  },
  matrix: {
    name: 'matrix',
    border: `${ESC}38;5;22m`,
    title: `${ESC}38;5;46m`,
    subtle: `${ESC}38;5;34m`,
    text: `${ESC}38;5;120m`,
    muted: `${ESC}38;5;28m`,
    user: `${ESC}38;5;118m`,
    assistant: `${ESC}38;5;154m`,
    system: `${ESC}38;5;82m`,
    error: `${ESC}38;5;196m`,
    ok: `${ESC}38;5;46m`,
    accent: `${ESC}38;5;40m`,
    input: `${ESC}38;5;231m`,
    suggestion: `${ESC}38;5;77m`,
    selected: `${ESC}48;5;22m${ESC}38;5;231m`,
  },
};


for (const theme of Object.values(themes)) {
  theme.surface ??= '';
  theme.surfaceActive ??= theme.selected ?? theme.accent ?? '';
  theme.borderMuted ??= theme.border ?? theme.muted ?? '';
  theme.borderActive ??= theme.accent ?? theme.title ?? theme.border ?? '';
  theme.borderDanger ??= theme.error ?? theme.border ?? '';
  theme.text ??= theme.text ?? '';
  theme.textMuted ??= theme.muted ?? theme.subtle ?? '';
  theme.textAccent ??= theme.accent ?? theme.title ?? '';
  theme.success ??= theme.ok ?? theme.accent ?? '';
  theme.warning ??= theme.system ?? theme.accent ?? '';
  theme.danger ??= theme.error ?? '';
  theme.info ??= theme.accent ?? theme.title ?? '';
  theme.mutedBg ??= theme.selected ?? '';
  theme.syntaxText ??= theme.text ?? '';
  theme.syntaxComment ??= theme.textMuted ?? theme.muted ?? theme.subtle ?? '';
  theme.syntaxString ??= theme.success ?? theme.assistant ?? theme.ok ?? '';
  theme.syntaxNumber ??= theme.warning ?? theme.system ?? theme.accent ?? '';
  theme.syntaxKeyword ??= theme.textAccent ?? theme.accent ?? theme.title ?? '';
  theme.syntaxType ??= theme.info ?? theme.user ?? theme.title ?? '';
  theme.syntaxBuiltin ??= theme.title ?? theme.textAccent ?? theme.accent ?? '';
  theme.syntaxConstant ??= theme.warning ?? theme.system ?? theme.accent ?? '';
  theme.syntaxProperty ??= theme.assistant ?? theme.text ?? '';
  theme.syntaxPreprocessor ??= theme.danger ?? theme.error ?? theme.textAccent ?? '';
  theme.syntaxAnnotation ??= theme.info ?? theme.accent ?? '';
  theme.syntaxOperator ??= theme.subtle ?? theme.textMuted ?? theme.text ?? '';
  theme.syntaxPunctuation ??= theme.textMuted ?? theme.muted ?? theme.text ?? '';
}
