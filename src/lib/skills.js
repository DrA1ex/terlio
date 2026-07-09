export const skills = [
  {
    name: 'terminal',
    title: 'Terminal UX',
    enabledByDefault: true,
    description: 'Covers CLI, TTY, keyboard control, and careful terminal UX.',
    hints: ['raw mode', 'ANSI', 'keyboard-first', 'status line'],
  },
  {
    name: 'code',
    title: 'Code Assistant',
    enabledByDefault: true,
    description: 'Adds practical technical answers, pseudocode, and architectural notes.',
    hints: ['architecture', 'implementation', 'edge cases'],
  },
  {
    name: 'planner',
    title: 'Planner',
    enabledByDefault: false,
    description: 'Structures the answer as an action plan with priorities and next steps.',
    hints: ['plan', 'milestones', 'scope'],
  },
  {
    name: 'writer',
    title: 'Writer',
    enabledByDefault: false,
    description: 'Makes answers smoother through wording, tone, and text editing.',
    hints: ['tone', 'draft', 'copy'],
  },
  {
    name: 'analyst',
    title: 'Analyst',
    enabledByDefault: true,
    description: 'Breaks the request into parts and makes constraints and tradeoffs explicit.',
    hints: ['tradeoffs', 'constraints', 'reasoning'],
  },
];

export function createSkillState() {
  const state = new Map();
  for (const skill of skills) {
    state.set(skill.name, Boolean(skill.enabledByDefault));
  }
  return state;
}

export function getSkill(name) {
  return skills.find((skill) => skill.name === name);
}

export function enabledSkillNames(skillState) {
  return skills.filter((skill) => skillState.get(skill.name)).map((skill) => skill.name);
}

export function formatSkillList(skillState) {
  return skills
    .map((skill) => {
      const marker = skillState.get(skill.name) ? 'on ' : 'off';
      return `${marker.padEnd(3)}  ${skill.name.padEnd(9)} ${skill.title} — ${skill.description}`;
    })
    .join('\n');
}
