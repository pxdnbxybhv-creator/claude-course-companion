// The figures (图) to make, each drawn as a half-cell mask (see geometry.ts: # full · . empty ·
// A ◤ · B ◥ · C ◢ · D ◣). Every one has area 8 and is solvable with the seven pieces — checked in
// tests/tangram.test.ts, which also checks none encloses a hole. Ordered roughly from easy to hard.
// (Classic figures that need pieces turned 45° — the running man, the swan — want a diagonal grid.)
import type { Figure } from './geometry';

export const FIGURES: Figure[] = [
  { id: 'square', zh: '方', en: 'Square', art: ['.CD.', 'C##D', 'B##A', '.BA.'] },
  { id: 'house', zh: '屋', en: 'House', art: ['.CD.', 'C##D', '.##.', '.##.'] },
  { id: 'kite', zh: '纸鸢', en: 'Kite', art: ['.CD.', 'C##D', 'B##A', '..#.'] },
  { id: 'boat', zh: '帆', en: 'Sailboat', art: ['..D..', '..#D.', 'B###A', '.B#A.'] },
  { id: 'fish', zh: '鱼', en: 'Fish', art: ['..D..', 'C##DC', 'B##AB', '.A...'] },
  { id: 'pine', zh: '松', en: 'Pine', art: ['..#..', '.C#D.', 'C###D', '..#..'] },
  { id: 'bell', zh: '钟', en: 'Temple Bell', art: ['.CD.', '.##.', '.##.', 'C##D'] },
  { id: 'junk', zh: '舟', en: 'Junk', art: ['.D.D.', '.#D#D', 'B###A'] },
  { id: 'cat', zh: '猫', en: 'Cat', art: ['DC...', 'B#...', '.#D..', 'C###A'] },
  { id: 'fox', zh: '狐', en: 'Fox', art: ['DC..', 'B#..', '.#D.', 'C##D', '...#'] },
  { id: 'rabbit', zh: '兔', en: 'Rabbit', art: ['.D.D', '.#.#', 'C###', '..#A'] },
  { id: 'geese', zh: '雁阵', en: 'Wild Geese', art: ['..CD..', '.C##D.', 'C#AB#D'] },
  { id: 'duck', zh: '鸭', en: 'Duck', art: ['CD..', 'B#..', '.#..', '.##D', '.B#A'] },
  { id: 'goose', zh: '鹅', en: 'Goose', art: ['B#..', '.#..', '.#..', '.##D', '.##.'] },
  { id: 'crane', zh: '鹤', en: 'Crane on One Leg', art: ['B#..', '.#..', '.##D', '..#.', '..#.', '..#.'] },
  { id: 'horse', zh: '马', en: 'Horse', art: ['CD...', '.#...', '.####', '.#..#'] },
  { id: 'dog', zh: '犬', en: 'Dog', art: ['.D...', '##...', '.####', '.A..#'] },
  { id: 'person', zh: '人', en: 'Standing Figure', art: ['.#.', 'C#D', '.##', '.#.', 'C#D'] },
  { id: 'dancer', zh: '舞', en: 'Dancer', art: ['..#.', '.C#D', 'C##.', '.#..', 'C#..'] },
  { id: 'sitter', zh: '坐', en: 'Sitting Quietly', art: ['.#..', 'C#D.', '.##.', '.###'] },
  { id: 'stairs', zh: '阶', en: 'Stairs', art: ['#...', '##..', '###.', '..##'] },
];

export const FIGURE: Record<string, Figure> = Object.fromEntries(FIGURES.map((f) => [f.id, f]));
