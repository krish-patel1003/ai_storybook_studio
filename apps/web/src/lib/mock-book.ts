export const mockCharacters = [
  {
    id: "fox",
    name: "Pip the Fox",
    image: "/assets/char-fox.jpg",
    traits: ["orange fur", "blue scarf", "white tail tip", "small"],
  },
  {
    id: "owl",
    name: "Professor Hoot",
    image: "/assets/char-owl.jpg",
    traits: ["round glasses", "brown feathers", "wise"],
  },
];

export const mockPages = [
  {
    id: "p0",
    image: "/assets/cover.jpg",
    text: "The Brave Little Fox",
    isCover: true,
  },
  {
    id: "p1",
    image: "/assets/page1.jpg",
    text: "Pip woke up in his cozy burrow as morning light tiptoed through the door.",
  },
  {
    id: "p2",
    image: "/assets/page2.jpg",
    text: "High in the old oak tree, Professor Hoot was waiting with a curious smile.",
  },
  {
    id: "p3",
    image: "/assets/page3.jpg",
    text: "By the silver stream, Pip met a kind bunny and shared his sweetest berries.",
  },
  {
    id: "p4",
    image: "/assets/page1.jpg",
    text: "Together they discovered that even the smallest hearts can be the bravest.",
  },
  {
    id: "p5",
    image: "/assets/page2.jpg",
    text: '"Listen close," whispered the wind, "the forest remembers every kind word."',
  },
  {
    id: "p6",
    image: "/assets/page3.jpg",
    text: "When the sun dipped low, Pip felt his pockets full of friendship.",
  },
  {
    id: "p7",
    image: "/assets/page1.jpg",
    text: "He hummed a tiny song that only brave little foxes know.",
  },
  {
    id: "p8",
    image: "/assets/page2.jpg",
    text: "Stars blinked awake one by one, like a sky full of fireflies.",
  },
  {
    id: "p9",
    image: "/assets/page3.jpg",
    text: 'And tucked beneath the moon, Pip whispered, "Tomorrow, another adventure."',
  },
];

export const mockBook = {
  title: "The Brave Little Fox",
  style: "Watercolor",
  ageRange: "Ages 3–5",
  pages: mockPages,
  characters: mockCharacters,
};
