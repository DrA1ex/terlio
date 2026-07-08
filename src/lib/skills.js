export const skills = [
  {
    name: 'terminal',
    title: 'Terminal UX',
    enabledByDefault: true,
    description: 'Отвечает про CLI, TTY, клавиатурное управление и аккуратный терминальный UX.',
    hints: ['raw mode', 'ANSI', 'keyboard-first', 'status line'],
  },
  {
    name: 'code',
    title: 'Code Assistant',
    enabledByDefault: true,
    description: 'Добавляет практичные технические ответы, псевдокод и архитектурные замечания.',
    hints: ['architecture', 'implementation', 'edge cases'],
  },
  {
    name: 'planner',
    title: 'Planner',
    enabledByDefault: false,
    description: 'Структурирует ответ как план действий с приоритетами и следующими шагами.',
    hints: ['plan', 'milestones', 'scope'],
  },
  {
    name: 'writer',
    title: 'Writer',
    enabledByDefault: false,
    description: 'Делает ответы более гладкими: формулировки, тон, редактирование текста.',
    hints: ['tone', 'draft', 'copy'],
  },
  {
    name: 'analyst',
    title: 'Analyst',
    enabledByDefault: true,
    description: 'Разбирает запрос на части, явно показывает ограничения и компромиссы.',
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
