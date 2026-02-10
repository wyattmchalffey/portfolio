// projects.js — Project data for the portfolio world
const PROJECTS = [
  {
    id: 'project1',
    name: 'TaskFlow',
    area: 'Workshop',
    description: 'A drag-and-drop project management app with real-time collaboration, Kanban boards, and automated workflow triggers.',
    tech: ['React', 'Node.js', 'Socket.io', 'MongoDB'],
    url: 'https://github.com/wyatt/taskflow',
    npcDialog: [
      "Welcome to the Workshop!",
      "I've been building TaskFlow — a project management tool that makes teamwork effortless.",
      "It features real-time Kanban boards, drag-and-drop tasks, and automated workflows.",
      "Built with React and Socket.io for live collaboration. Check it out!"
    ]
  },
  {
    id: 'project2',
    name: 'DataLens',
    area: 'Lab',
    description: 'An interactive data visualization dashboard that transforms complex datasets into beautiful, explorable charts and graphs.',
    tech: ['D3.js', 'Python', 'Flask', 'PostgreSQL'],
    url: 'https://github.com/wyatt/datalens',
    npcDialog: [
      "Ah, you found the Lab!",
      "DataLens is my data visualization platform.",
      "It turns raw datasets into interactive charts you can actually explore.",
      "Python crunches the numbers, D3.js makes them beautiful."
    ]
  },
  {
    id: 'project4',
    name: 'Steamdle',
    area: 'Arcade',
    description: 'A daily guessing game where you identify a Steam game based on its reviews. You get 6 tries — think Wordle, but for gamers.',
    tech: ['JavaScript', 'Steam API', 'HTML/CSS', 'Node.js'],
    url: 'https://steamdle.com/',
    npcDialog: [
      "Step right up to the Arcade!",
      "Steamdle is a daily guessing game I built.",
      "You read Steam reviews and try to guess which game they're about — in 6 tries.",
      "It's like Wordle, but for gamers. Give it a shot!"
    ]
  },
  {
    id: 'project5',
    name: 'GreenThumb',
    area: 'South Garden',
    description: 'A smart plant care companion app with watering schedules, light tracking, and community plant identification powered by ML.',
    tech: ['React Native', 'TensorFlow.js', 'Firebase', 'REST API'],
    url: 'https://github.com/wyatt/greenthumb',
    npcDialog: [
      "Welcome to the Community Garden!",
      "This garden is shared by everyone who visits — plant seeds, water them, and watch them grow together!",
      "Walk up to any soil plot and press E to plant or tend your crops.",
      "Try watering plants to speed them up, and come back later to harvest!",
      "Check the Garden Journal from the action menu to track your collection."
    ]
  },
  {
    id: 'project6',
    name: 'CloudDeploy',
    area: 'South Garden',
    description: 'A one-click deployment CLI tool that provisions infrastructure, configures CI/CD pipelines, and monitors app health.',
    tech: ['Go', 'Docker', 'Terraform', 'AWS SDK'],
    url: 'https://github.com/wyatt/clouddeploy',
    portalOnly: true
  }
];

// Guide NPC in town square
const GUIDE_NPC = {
  id: 'guide',
  name: 'Guide',
  dialog: [
    "Hey there, welcome to my portfolio!",
    "I'm Wyatt — a developer who loves building things.",
    "Walk around and explore! Each room showcases a different project.",
    "Approach the glowing portals or talk to the NPCs to learn more.",
    "Use WASD to move and E to interact. Have fun exploring!"
  ]
};
