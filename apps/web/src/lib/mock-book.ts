import cover from "@/assets/cover.jpg";
import page1 from "@/assets/page1.jpg";
import page2 from "@/assets/page2.jpg";
import page3 from "@/assets/page3.jpg";
import charFox from "@/assets/char-fox.jpg";
import charOwl from "@/assets/char-owl.jpg";

export const mockCharacters = [
  {
    id: "fox",
    name: "Pip the Fox",
    image: charFox,
    traits: ["orange fur", "blue scarf", "white tail tip", "small"],
  },
  {
    id: "owl",
    name: "Professor Hoot",
    image: charOwl,
    traits: ["round glasses", "brown feathers", "wise"],
  },
];

export const mockPages = [
  {
    id: "p0",
    image: cover,
    text: "The Brave Little Fox",
    isCover: true,
  },
  {
    id: "p1",
    image: page1,
    text: "Pip woke up in his cozy burrow as morning light tiptoed through the door.",
  },
  {
    id: "p2",
    image: page2,
    text: "High in the old oak tree, Professor Hoot was waiting with a curious smile.",
  },
  {
    id: "p3",
    image: page3,
    text: "By the silver stream, Pip met a kind bunny and shared his sweetest berries.",
  },
  {
    id: "p4",
    image: page1,
    text: "Together they discovered that even the smallest hearts can be the bravest.",
  },
  {
    id: "p5",
    image: page2,
    text: '"Listen close," whispered the wind, "the forest remembers every kind word."',
  },
  {
    id: "p6",
    image: page3,
    text: "When the sun dipped low, Pip felt his pockets full of friendship.",
  },
  {
    id: "p7",
    image: page1,
    text: "He hummed a tiny song that only brave little foxes know.",
  },
  {
    id: "p8",
    image: page2,
    text: "Stars blinked awake one by one, like a sky full of fireflies.",
  },
  {
    id: "p9",
    image: page3,
    text: "And tucked beneath the moon, Pip whispered, \"Tomorrow, another adventure.\"",
  },
];

export const mockBook = {
  title: "The Brave Little Fox",
  style: "Watercolor",
  ageRange: "Ages 3–5",
  pages: mockPages,
  characters: mockCharacters,
};